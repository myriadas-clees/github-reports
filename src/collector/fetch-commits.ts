// Fetch commit messages per repository via GitHub REST + Commit Search.
// REST: GET /repos/{owner}/{repo}/commits?author=&since=&until= (default branch)
// Search: GET /search/commits?q=author:+author-date:+repo: (all branches)

import { toISODate, type DateRange } from "./date-range.js";
import { throwOnGitHubAccessError } from "./github-api-error.js";
import type { CommitDetail, PullRequest, RepoCommitMessages } from "../types.js";

type RawCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { date: string } | null;
  };
};

type SearchCommitItem = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { date?: string | null } | null;
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

const timestampInRange = (authoredAt: string, range: DateRange): boolean => {
  const time = new Date(authoredAt).getTime();
  if (Number.isNaN(time)) return false;
  return time >= range.from.getTime() && time <= range.to.getTime();
};

const toCommitDetail = (sha: string, message: string, url: string, authoredAt: string): CommitDetail => ({
  sha,
  message: firstLine(message),
  url,
  authoredAt,
});

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
    if (response.status === 404) return null;

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const delay = parseRetryDelay(response);
      console.warn(`  429, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      continue;
    }

    throwOnGitHubAccessError(response, "Commit fetch failed");

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
      commits.push(toCommitDetail(
        c.sha,
        c.commit.message,
        c.html_url,
        c.commit.author?.date ?? "",
      ));
    });
    url = result.nextUrl;
  }

  return commits;
};

/** All-branch author commits via Search (includes work not yet on the default branch). */
const searchRepoCommits = async (
  token: string,
  repo: string,
  author: string,
  range: DateRange,
  timezone: string,
): Promise<CommitDetail[]> => {
  const fromDate = toISODate(range.from, timezone);
  const toDate = toISODate(range.to, timezone);
  const query = `author:${author} author-date:${fromDate}..${toDate} repo:${repo}`;
  let url: string | null =
    `https://api.github.com/search/commits?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}`;
  const commits: CommitDetail[] = [];

  while (url) {
    let page: { items: SearchCommitItem[]; nextUrl: string | null } | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, { headers: GITHUB_HEADERS(token) });

      if (response.ok) {
        const body = (await response.json()) as { items?: SearchCommitItem[] };
        page = { items: body.items ?? [], nextUrl: parseNextUrl(response) };
        break;
      }

      if (response.status === 422 || response.status === 404) {
        return commits;
      }

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const delay = parseRetryDelay(response);
        console.warn(
          `  commit search 429, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await sleep(delay);
        continue;
      }

      console.warn(
        `  Failed to search commits for ${repo}: ${response.status} ${response.statusText}`,
      );
      return commits;
    }

    if (!page) return commits;

    for (const item of page.items) {
      const authoredAt = item.commit.author?.date ?? "";
      if (!authoredAt || !timestampInRange(authoredAt, range)) continue;
      commits.push(toCommitDetail(item.sha, item.commit.message, item.html_url, authoredAt));
    }
    url = page.nextUrl;
  }

  return commits;
};

const fetchCommitStats = async (
  token: string,
  repo: string,
  sha: string,
): Promise<{ additions?: number; deletions?: number; filesChanged?: number } | null> => {
  const url = `https://api.github.com/repos/${repo}/commits/${sha}`;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, { headers: GITHUB_HEADERS(token) });
    if (response.ok) {
      const detail = await response.json() as {
        stats?: { additions?: number; deletions?: number };
        files?: unknown[];
      };
      return {
        additions: detail.stats?.additions,
        deletions: detail.stats?.deletions,
        filesChanged: detail.files?.length,
      };
    }
    if (response.status === 404) return null;
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const delay = parseRetryDelay(response);
      console.warn(
        `  commit stats 429, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(delay);
      continue;
    }
    console.warn(`  Failed to fetch commit stats for ${repo}@${sha}: ${response.status} ${response.statusText}`);
    return null;
  }
  return null;
};

const enrichCommitStats = async (
  token: string,
  repo: string,
  commits: CommitDetail[],
): Promise<CommitDetail[]> => {
  await runWithConcurrency(commits, async (commit) => {
    const stats = await fetchCommitStats(token, repo, commit.sha);
    if (!stats) return;
    commit.additions = stats.additions;
    commit.deletions = stats.deletions;
    commit.filesChanged = stats.filesChanged;
  });
  return commits;
};

const mergeCommitsBySha = (
  restCommits: CommitDetail[],
  searchCommits: CommitDetail[],
): CommitDetail[] => {
  const bySha = new Map<string, CommitDetail>();
  for (const commit of searchCommits) bySha.set(commit.sha, commit);
  // Prefer REST fields when the same commit appears in both sources.
  for (const commit of restCommits) bySha.set(commit.sha, commit);
  return [...bySha.values()].sort((a, b) => a.authoredAt.localeCompare(b.authoredAt));
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
  timezone: string = "UTC",
): Promise<RepoCommitMessages[]> => {
  const results: RepoCommitMessages[] = [];

  await runWithConcurrency(repos, async (repo) => {
    if (!repo) return;
    const restCommits = await fetchRepoCommits(token, repo, username, range);
    const searchCommits = await searchRepoCommits(token, repo, username, range, timezone);
    const commits = await enrichCommitStats(
      token,
      repo,
      mergeCommitsBySha(restCommits, searchCommits),
    );
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
