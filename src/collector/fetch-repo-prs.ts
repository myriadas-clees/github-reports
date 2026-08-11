// Fetch individual PRs by repo + number via REST API

import { cleanBody } from "./clean-body.js";
import type { DateRange } from "./date-range.js";
import type { PullRequest } from "../types.js";

type RawPR = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  user: { login: string } | null;
  labels: { name: string }[];
};

const GITHUB_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "github-weekly-reporter",
});

export const mapState = (state: string, mergedAt: string | null): PullRequest["state"] => {
  if (mergedAt) return "merged";
  return state === "closed" ? "closed" : "open";
};

export type PRRef = {
  repo: string;
  number: number;
};

/** Search every repository visible to the token for PRs authored by the user. */
export const searchAuthoredPRRefsForBackfill = async (
  token: string,
  username: string,
  range: DateRange,
): Promise<PRRef[]> => {
  const cutoff = range.to.toISOString().slice(0, 10);
  const query = encodeURIComponent(`is:pr author:${username} created:<=${cutoff}`);
  const refs: PRRef[] = [];
  let url: string | null = `https://api.github.com/search/issues?q=${query}&per_page=100`;
  while (url) {
    const response = await fetch(url, { headers: GITHUB_HEADERS(token) });
    if (!response.ok) {
      console.warn(`  Failed historical PR search: ${response.status} ${response.statusText}`);
      break;
    }
    const body = await response.json() as {
      items: Array<{ number: number; repository_url: string }>;
    };
    for (const item of body.items) {
      const marker = "/repos/";
      const index = item.repository_url.indexOf(marker);
      if (index >= 0) refs.push({ repo: item.repository_url.slice(index + marker.length), number: item.number });
    }
    url = nextPageUrl(response);
  }
  return refs;
};

const MAX_RETRIES = 3;
const REQUEST_DELAY_MS = 100;
const DEFAULT_RETRY_DELAY_MS = 5_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const parseRetryDelay = (response: Response): number => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) return seconds * 1000;
  }
  return DEFAULT_RETRY_DELAY_MS;
};

const readErrorBody = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? "";
  } catch {
    return "";
  }
};

const nextPageUrl = (response: Response): string | null => {
  const link = response.headers.get("link");
  return link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
};

const fetchPages = async <T>(token: string, startUrl: string): Promise<T[]> => {
  const items: T[] = [];
  let url: string | null = startUrl;
  while (url) {
    const response = await fetch(url, { headers: GITHUB_HEADERS(token) });
    if (!response.ok) {
      console.warn(`  Failed paginated PR fetch: ${response.status} ${response.statusText}`);
      break;
    }
    items.push(...await response.json() as T[]);
    url = nextPageUrl(response);
  }
  return items;
};

const inRange = (timestamp: string | null | undefined, range: DateRange): boolean => {
  if (!timestamp) return false;
  const time = new Date(timestamp).getTime();
  return time >= range.from.getTime() && time <= range.to.getTime();
};

const fetchPRWork = async (
  token: string,
  ref: PRRef,
  range: DateRange,
): Promise<{ timestamps: string[]; additions: number; deletions: number }> => {
  const commits = await fetchPages<{
    sha: string;
    commit: { author?: { date?: string | null }; committer?: { date?: string | null } };
  }>(token, `https://api.github.com/repos/${ref.repo}/pulls/${ref.number}/commits?per_page=100`);
  const relevant = commits.map((item) => ({
    sha: item.sha,
    timestamp: item.commit.author?.date ?? item.commit.committer?.date ?? null,
  })).filter((item): item is { sha: string; timestamp: string } => inRange(item.timestamp, range));
  let additions = 0;
  let deletions = 0;
  for (const commit of relevant) {
    const response = await fetch(`https://api.github.com/repos/${ref.repo}/commits/${commit.sha}`, {
      headers: GITHUB_HEADERS(token),
    });
    if (!response.ok) continue;
    const detail = await response.json() as { stats?: { additions?: number; deletions?: number } };
    additions += detail.stats?.additions ?? 0;
    deletions += detail.stats?.deletions ?? 0;
  }
  return { timestamps: relevant.map((item) => item.timestamp), additions, deletions };
};

/** Enumerate authored PRs that already existed by a historical report day. */
export const fetchAuthoredPRRefsForBackfill = async (
  token: string,
  username: string,
  repos: string[],
  range: DateRange,
): Promise<PRRef[]> => {
  const lower = username.toLowerCase();
  const refs: PRRef[] = [];
  await runWithConcurrency(repos, async (repo) => {
    const pulls = await fetchPages<{
      number: number;
      created_at: string;
      user: { login: string } | null;
    }>(token, `https://api.github.com/repos/${repo}/pulls?state=all&sort=created&direction=desc&per_page=100`);
    pulls
      .filter((pr) => pr.user?.login.toLowerCase() === lower)
      .filter((pr) => new Date(pr.created_at).getTime() <= range.to.getTime())
      .forEach((pr) => refs.push({ repo, number: pr.number }));
  });
  return refs;
};

const toPullRequest = (pr: RawPR, repo: string): PullRequest => ({
  title: pr.title,
  body: cleanBody(pr.body),
  url: pr.html_url,
  repository: repo,
  state: mapState(pr.state, pr.merged_at),
  labels: pr.labels.map((l) => l.name),
  additions: pr.additions,
  deletions: pr.deletions,
  changedFiles: pr.changed_files,
  author: pr.user?.login ?? "unknown",
  createdAt: pr.created_at,
  updatedAt: pr.updated_at,
  closedAt: pr.closed_at,
  mergedAt: pr.merged_at,
});

const fetchSinglePR = async (
  token: string,
  ref: PRRef,
  activityRange?: DateRange,
): Promise<PullRequest | null> => {
  const url = `https://api.github.com/repos/${ref.repo}/pulls/${ref.number}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, { headers: GITHUB_HEADERS(token) });

    if (response.ok) {
      const pullRequest = toPullRequest((await response.json()) as RawPR, ref.repo);
      if (activityRange) {
        const work = await fetchPRWork(token, ref, activityRange);
        pullRequest.workTimestamps = work.timestamps;
        pullRequest.workAdditions = work.additions;
        pullRequest.workDeletions = work.deletions;
      }
      return pullRequest;
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const delay = parseRetryDelay(response);
      console.warn(`  ${ref.repo}#${ref.number}: 429, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      continue;
    }

    const message = await readErrorBody(response);
    console.warn(`  Failed to fetch PR ${ref.repo}#${ref.number}: ${response.status} ${response.statusText}`);
    if (message) console.warn(`    ${message}`);
    return null;
  }

  return null;
};

const CONCURRENCY = 5;

const runWithConcurrency = async <T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
): Promise<void> => {
  const queue = [...items];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) {
        await fn(item);
        await sleep(REQUEST_DELAY_MS);
      }
    }
  });
  await Promise.all(workers);
};

export const fetchPRsByRefs = async (
  token: string,
  refs: PRRef[],
  activityRange?: DateRange,
): Promise<PullRequest[]> => {
  const unique = new Map<string, PRRef>();
  refs.forEach((ref) => {
    const key = `${ref.repo}#${ref.number}`;
    if (!unique.has(key)) unique.set(key, ref);
  });

  const prs: PullRequest[] = [];
  let failed = 0;

  await runWithConcurrency([...unique.values()], async (ref) => {
    const pr = await fetchSinglePR(token, ref, activityRange);
    if (pr) prs.push(pr);
    else failed++;
  });

  if (failed > 0) {
    console.warn(`Warning: ${failed} of ${unique.size} PRs could not be fetched.`);
  }

  return prs;
};
