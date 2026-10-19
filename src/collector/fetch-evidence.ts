// Fetch deployments and per-PR verification evidence from GitHub.

import { throwOnGitHubAccessError } from "./github-api-error.js";
import { deploymentKey } from "./evidence-ledger.js";
import type { DeploymentRecord, PrEvidence, PrReviewRecord } from "../types.js";

const GITHUB_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "worklog",
});

const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const SECONDARY_RATE_LIMIT_DELAY_MS = 60_000;
const CONCURRENCY = 4;
const MAX_FILES = 300;
const MAX_DEPLOYMENTS = 300;
const API = "https://api.github.com";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const retryDelay = (response: Response, attempt: number): number => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && !Number.isNaN(Number(retryAfter))) return Number(retryAfter) * 1000;
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset)) return Math.max(DEFAULT_RETRY_DELAY_MS, reset * 1000 - Date.now() + 1_000);
  }
  return SECONDARY_RATE_LIMIT_DELAY_MS * 2 ** attempt;
};

const isRetryable = async (response: Response): Promise<boolean> => {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  if (response.headers.get("retry-after")) return true;
  if (response.headers.get("x-ratelimit-remaining") === "0") return true;
  try {
    return /secondary rate limit|abuse detection/i.test(await response.clone().text());
  } catch {
    return false;
  }
};

const nextUrl = (response: Response): string | null =>
  response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;

type Fetched<T> = { ok: true; data: T; next: string | null } | { ok: false; status: number };

/** GET with 429/secondary-limit retry. Hard auth/limit errors throw unless `soft` is set. */
const getJson = async <T>(token: string, url: string, context: string, soft = false): Promise<Fetched<T>> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, { headers: GITHUB_HEADERS(token) });
    if (response.ok) return { ok: true, data: (await response.json()) as T, next: nextUrl(response) };
    if (attempt < MAX_RETRIES && (await isRetryable(response))) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    if (soft && (response.status === 403 || response.status === 404) && !(await isRetryable(response))) {
      return { ok: false, status: response.status };
    }
    if (response.status === 404) return { ok: false, status: 404 };
    throwOnGitHubAccessError(response, context);
    return { ok: false, status: response.status };
  }
  return { ok: false, status: 0 };
};

/** Follow pagination; stop when `stop` returns true or `cap` items collected. */
const getPages = async <T>(
  token: string,
  startUrl: string,
  context: string,
  opts: { cap?: number; soft?: boolean; stop?: (item: T) => boolean } = {},
): Promise<{ items: T[]; failed: boolean }> => {
  const items: T[] = [];
  let url: string | null = startUrl;
  while (url) {
    const res: Fetched<T[]> = await getJson<T[]>(token, url, context, opts.soft);
    if (!res.ok) return { items, failed: res.status !== 404 };
    let stopped = false;
    for (const item of res.data) {
      if (opts.stop?.(item)) {
        stopped = true;
        break;
      }
      items.push(item);
      if (opts.cap && items.length >= opts.cap) {
        stopped = true;
        break;
      }
    }
    url = stopped ? null : res.next;
  }
  return { items, failed: false };
};

export const mapWithConcurrency = async <T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> => {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const item = queue.shift() as T;
        await fn(item);
      }
    }),
  );
};

export const fetchDefaultBranch = async (token: string, repo: string): Promise<string | null> => {
  const res = await getJson<{ default_branch?: string }>(token, `${API}/repos/${repo}`, `Repo fetch failed for ${repo}`);
  return res.ok ? (res.data.default_branch ?? null) : null;
};

/** Whether head contains base according to GitHub's compare API; unavailable comparisons are unknown. */
export const isCommitContained = async (token: string, repo: string, base: string, head: string): Promise<boolean | null> => {
  try {
    const res = await getJson<{ status?: string }>(token, `${API}/repos/${repo}/compare/${base}...${head}`, `Commit compare failed for ${repo}`, true);
    if (!res.ok) return null;
    return res.data.status === "ahead" || res.data.status === "identical";
  } catch {
    return null;
  }
};

// ---------- PR evidence ----------

type RawPr = {
  draft?: boolean;
  state: string;
  merged_at: string | null;
  created_at: string;
  merge_commit_sha: string | null;
  user: { login: string } | null;
  base: { ref: string };
  head: { ref: string; sha: string };
};

type RawReview = {
  user: { login: string; type?: string } | null;
  state: string;
  submitted_at: string | null;
};

type RawCheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  app?: { id?: number; slug?: string } | null;
  check_suite?: { id?: number } | null;
  started_at?: string | null;
  completed_at?: string | null;
};
type RawCommitStatus = { context: string; state: "success" | "failure" | "error" | "pending"; created_at?: string };

const FAILED = new Set(["failure", "timed_out", "action_required", "cancelled", "startup_failure"]);
const SKIPPED = new Set(["skipped", "neutral", "stale"]);

export const summarizeCheckRuns = (runs: RawCheckRun[]): NonNullable<PrEvidence["checks"]> => {
  const stamp = (r: RawCheckRun): number => new Date(r.completed_at ?? r.started_at ?? 0).getTime() || 0;
  const latest = new Map<string, RawCheckRun>();
  for (const run of runs) {
    const key = run.app?.id != null && run.check_suite?.id != null
      ? `${run.app.id}:${run.check_suite.id}:${run.name}`
      : run.name;
    const prev = latest.get(key);
    if (!prev || stamp(run) >= stamp(prev)) latest.set(key, run);
  }
  const out = { passed: 0, failed: 0, skipped: 0, pending: 0, names: [] as string[] };
  for (const run of latest.values()) {
    if (run.status !== "completed") out.pending++;
    else if (run.conclusion === "success") out.passed++;
    else if (run.conclusion && FAILED.has(run.conclusion)) out.failed++;
    else if (run.conclusion && SKIPPED.has(run.conclusion)) out.skipped++;
    else out.skipped++;
    if (!(run.status === "completed" && (!run.conclusion || SKIPPED.has(run.conclusion)))) out.names.push(run.name);
  }
  // Names are unique display labels; same-named checks from distinct suites still count separately above.
  out.names = [...new Set(out.names)].sort();
  return out;
};

const summarizeCommitStatuses = (statuses: RawCommitStatus[]): NonNullable<PrEvidence["checks"]> => {
  const latest = new Map<string, RawCommitStatus>();
  for (const status of statuses) {
    const previous = latest.get(status.context);
    if (!previous || new Date(status.created_at ?? 0).getTime() >= new Date(previous.created_at ?? 0).getTime()) {
      latest.set(status.context, status);
    }
  }
  const out = { passed: 0, failed: 0, skipped: 0, pending: 0, names: [] as string[] };
  for (const status of latest.values()) {
    if (status.state === "success") out.passed++;
    else if (status.state === "pending") out.pending++;
    else out.failed++;
    out.names.push(status.context);
  }
  out.names.sort();
  return out;
};

const mergeChecks = (
  runs: NonNullable<PrEvidence["checks"]> | null,
  statuses: RawCommitStatus[] | null,
): NonNullable<PrEvidence["checks"]> | null => {
  if (!runs && !statuses) return null;
  if (!statuses) return runs;
  const statusSummary = summarizeCommitStatuses(statuses);
  if (!runs) return statuses.length ? statusSummary : null;
  return {
    passed: runs.passed + statusSummary.passed,
    failed: runs.failed + statusSummary.failed,
    skipped: runs.skipped,
    pending: runs.pending + statusSummary.pending,
    names: [...new Set([...runs.names, ...statusSummary.names])].sort(),
  };
};

export const filterReviews = (raw: RawReview[], author: string): PrReviewRecord[] =>
  raw
    .filter((r) => r.user && r.submitted_at && r.user.login.toLowerCase() !== author.toLowerCase())
    .map((r) => ({
      reviewer: r.user!.login,
      bot: r.user!.login.endsWith("[bot]") || r.user!.type === "Bot",
      state: r.state,
      submittedAt: r.submitted_at as string,
    }));

export const fetchPrEvidence = async (
  token: string,
  ref: { repo: string; number: number; url?: string },
  now: Date = new Date(),
): Promise<PrEvidence | null> => {
  const base = `${API}/repos/${ref.repo}`;
  const label = `${ref.repo}#${ref.number}`;
  const prRes = await getJson<RawPr>(token, `${base}/pulls/${ref.number}`, `PR fetch failed for ${label}`);
  if (!prRes.ok) return null;
  const pr = prRes.data;
  const author = pr.user?.login ?? "";

  const reviewsRaw = await getPages<RawReview>(token, `${base}/pulls/${ref.number}/reviews?per_page=100`, `Review fetch failed for ${label}`);
  const files = await getPages<{ filename: string }>(token, `${base}/pulls/${ref.number}/files?per_page=100`, `Files fetch failed for ${label}`, { cap: MAX_FILES });

  const checkRes = await getJson<{ check_runs: RawCheckRun[] }>(
    token,
    `${base}/commits/${pr.head.sha}/check-runs?per_page=100`,
    `Check-run fetch failed for ${label}`,
    true,
  );
  let checkSummary: NonNullable<PrEvidence["checks"]> | null = null;
  if (checkRes.ok) {
    const runs = [...checkRes.data.check_runs];
    let next = checkRes.next;
    while (next) {
      const page = await getJson<{ check_runs: RawCheckRun[] }>(token, next, `Check-run fetch failed for ${label}`, true);
      if (!page.ok) break;
      runs.push(...page.data.check_runs);
      next = page.next;
    }
    checkSummary = summarizeCheckRuns(runs);
  }
  const statusRes = await getJson<{ statuses: RawCommitStatus[] }>(
    token,
    `${base}/commits/${pr.head.sha}/status`,
    `Commit-status fetch failed for ${label}`,
    true,
  );
  const checks = mergeChecks(checkSummary, statusRes.ok ? statusRes.data.statuses ?? [] : null);

  return {
    url: ref.url ?? `https://github.com/${ref.repo}/pull/${ref.number}`,
    repository: ref.repo,
    number: ref.number,
    author,
    state: pr.merged_at ? "merged" : pr.state === "open" ? "open" : "closed",
    isDraft: Boolean(pr.draft),
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    mergeCommitSha: pr.merge_commit_sha ?? null,
    createdAt: pr.created_at,
    mergedAt: pr.merged_at,
    reviews: filterReviews(reviewsRaw.items, author),
    checks,
    files: files.items.map((f) => f.filename),
    fetchedAt: now.toISOString(),
  };
};

// ---------- Deployments ----------

type RawDeployment = { id: number; environment: string; production_environment?: boolean | null; transient_environment?: boolean | null; ref: string; sha: string; created_at: string };
type RawStatus = { state: string; created_at: string };

export const isProductionEnvironment = (environment: string): boolean =>
  /prod/i.test(environment) && !/preview|staging|test|dev/i.test(environment);

export const fetchDeployments = async (
  token: string,
  repo: string,
  sinceIso: string,
  known: Set<string> = new Set(),
): Promise<DeploymentRecord[]> => {
  const base = `${API}/repos/${repo}`;
  const sinceMs = new Date(sinceIso).getTime();
  // Deployments carry their own environment name, so /environments is not needed.
  const { items: deployments } = await getPages<RawDeployment>(
    token,
    `${base}/deployments?per_page=100`,
    `Deployment fetch failed for ${repo}`,
    { cap: MAX_DEPLOYMENTS, soft: true, stop: (d) => new Date(d.created_at).getTime() < sinceMs },
  );

  const records: DeploymentRecord[] = [];
  await mapWithConcurrency(deployments, async (d) => {
    const key = deploymentKey({ environment: d.environment, sha: d.sha, createdAt: d.created_at });
    if (known.has(key)) return;
    const res = await getJson<RawStatus[]>(token, `${base}/deployments/${d.id}/statuses?per_page=20`, `Deployment status fetch failed for ${repo}`, true);
    if (!res.ok) return;
    const success = res.data
      .filter((s) => s.state === "success")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
    if (!success) return;
    records.push({
      environment: d.environment,
      production: d.transient_environment !== true && (d.production_environment === true || (d.production_environment == null && isProductionEnvironment(d.environment))),
      ref: d.ref,
      sha: d.sha,
      createdAt: d.created_at,
      succeededAt: success.created_at,
    });
  });
  return records;
};
