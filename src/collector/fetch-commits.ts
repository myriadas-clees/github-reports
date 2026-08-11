// Fetch commit messages per repository via GitHub REST API
// GET /repos/{owner}/{repo}/commits?author={username}&since={from}&until={to}

import type { DateRange } from "./date-range.js";
import type { CommitDetail, PullRequest, RepoCommitMessages } from "../types.js";

type RawCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { date: string } | null;
  };
};

const PER_PAGE = 100;
const MAX_MESSAGE_LENGTH = 200;
const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5_000;

const GITHUB_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "worklog",
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const parseRetryDelay = (response: Response): number => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) return seconds * 1000;
  }
  return DEFAULT_RETRY_DELAY_MS;
};

const parseNextUrl = (response: Response): string | null => {
  const link = response.headers.get("link");
  if (!link) return null;
  const match = link.match(/<([^>]+)>;\s*rel="next"/);
  return match?.[1] ?? null;
};

const firstLine = (message: string): string => {
  const subject = message.split("\n")[0]?.trim() ?? message.trim();
  return subject.length > MAX_MESSAGE_LENGTH
    ? `${subject.slice(0, MAX_MESSAGE_LENGTH)}...`
    : subject;
};

const fetchPage = async (
  token: string,
  url: string,
): Promise<{ commits: RawCommit[]; nextUrl: string | null } | null> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, { headers: GITHUB_HEADERS(token) });

    if (response.ok) {
      const commits = (await response.json()) as RawCommit[];
      return { commits, nextUrl: parseNextUrl(response) };
    }

    if (response.status === 409) return null; // Empty repository
    if (response.status === 403 || response.status === 404) return null;

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const delay = parseRetryDelay(response);
      console.warn(`  429, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      continue;
    }

    console.warn(`  Failed to fetch commits: ${response.status} ${response.statusText}`);
    return null;
  }

  return null;
};

const fetchRepoCommits = async (
  token: string,
  repo: string,
  author: string,
  range: DateRange,
): Promise<CommitDetail[]> => {
  const params = new URLSearchParams({
    author,
    since: range.from.toISOString(),
    until: range.to.toISOString(),
    per_page: String(PER_PAGE),
  });
  let url: string | null = `https://api.github.com/repos/${repo}/commits?${params}`;
  const commits: CommitDetail[] = [];

  while (url) {
    const result = await fetchPage(token, url);
    if (!result) break;
    result.commits.forEach((c) => {
      commits.push({
        sha: c.sha,
        message: firstLine(c.commit.message),
        url: c.html_url,
        authoredAt: c.commit.author?.date ?? "",
      });
    });
    url = result.nextUrl;
  }

  return commits;
};

const CONCURRENCY = 5;
const REQUEST_DELAY_MS = 100;

const runWithConcurrency = async <T>(
  items: T[],
  fn: (item: T) => Promise<void>,
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

export type RepoCommits = RepoCommitMessages;

/** Merge default-branch commits with reporting-user commits found on PR branches. */
export const mergeCommitMessagesWithPRs = (
  base: RepoCommitMessages[],
  pullRequests: PullRequest[],
): RepoCommitMessages[] => {
  const byRepo = new Map<string, { legacyMessages: string[]; commits: Map<string, CommitDetail> }>();
  const ensureRepo = (repo: string) => {
    const existing = byRepo.get(repo);
    if (existing) return existing;
    const created = { legacyMessages: [] as string[], commits: new Map<string, CommitDetail>() };
    byRepo.set(repo, created);
    return created;
  };

  for (const repo of base) {
    const target = ensureRepo(repo.repo);
    if (repo.commits) {
      for (const commit of repo.commits) target.commits.set(commit.sha, commit);
    } else {
      target.legacyMessages.push(...repo.messages);
    }
  }
  for (const pr of pullRequests) {
    const target = ensureRepo(pr.repository);
    for (const commit of pr.workCommits ?? []) {
      if (!target.commits.has(commit.sha)) target.commits.set(commit.sha, commit);
    }
  }

  return [...byRepo.entries()].flatMap(([repo, value]) => {
    const commits = [...value.commits.values()].sort((a, b) => a.authoredAt.localeCompare(b.authoredAt));
    const messages = [...value.legacyMessages, ...commits.map((commit) => commit.message)];
    return messages.length > 0 ? [{ repo, messages, commits }] : [];
  });
};

export const fetchCommitMessages = async (
  token: string,
  username: string,
  repos: string[],
  range: DateRange,
): Promise<RepoCommitMessages[]> => {
  const results: RepoCommitMessages[] = [];

  await runWithConcurrency(repos, async (repo) => {
    const commits = await fetchRepoCommits(token, repo, username, range);
    if (commits.length > 0) {
      results.push({
        repo,
        messages: commits.map((c) => c.message),
        commits,
      });
    }
  });

  return results;
};
