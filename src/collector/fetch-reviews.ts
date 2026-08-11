// Fetch code reviews and review comments for the reporting user,
// and count Codex/Cursor reviews done (submissions, comments, PRs; Fixed is secondary).

import { cleanBody } from "./clean-body.js";
import {
  countAiReviewActivity,
  emptyAiReviewActivity,
  type AiReviewActivity,
  type AiReviewSubmissionInput,
  type ReviewCommentThreadInput,
} from "./ai-review-fixes.js";
import type { DateRange } from "./date-range.js";
import type { CodeReview, ReviewComment } from "../types.js";

const GITHUB_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "worklog",
});

const MAX_RETRIES = 3;
const REQUEST_DELAY_MS = 100;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const CONCURRENCY = 5;
/** Max PRs per repo updated between the report start and collection to inspect for scheduled runs. */
const MAX_PRS_PER_REPO = 100;
/** Allow delayed scheduled runs without making historical backfills scan to today. */
const MAX_COLLECTION_LAG_MS = 12 * 60 * 60 * 1000;

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

type RawReview = {
  user: { login: string } | null;
  state: string;
  body: string | null;
  submitted_at: string | null;
  html_url: string;
  pull_request_url: string;
};

type RawComment = {
  id: number;
  in_reply_to_id: number | null;
  user: { login: string } | null;
  body: string;
  html_url: string;
  path: string | null;
  created_at: string;
  pull_request_url: string;
};

const inRange = (iso: string | null, range: DateRange): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
};

const fetchJsonPages = async <T>(token: string, startUrl: string): Promise<T[]> => {
  const items: T[] = [];
  let url: string | null = startUrl;

  while (url) {
    let page: T[] | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, { headers: GITHUB_HEADERS(token) });
      if (response.ok) {
        page = (await response.json()) as T[];
        url = parseNextUrl(response);
        break;
      }
      if (response.status === 404 || response.status === 403) {
        return items;
      }
      if (response.status === 429 && attempt < MAX_RETRIES) {
        await sleep(parseRetryDelay(response));
        continue;
      }
      console.warn(`  Failed review fetch: ${response.status} ${response.statusText}`);
      return items;
    }
    if (!page) break;
    items.push(...page);
  }

  return items;
};

export type FetchReviewsResult = {
  reviews: CodeReview[];
  comments: ReviewComment[];
  aiReviews: AiReviewActivity;
};

export const fetchReviewsForRepos = async (
  token: string,
  username: string,
  repos: string[],
  range: DateRange,
  collectedAt: Date = new Date(),
  historicalBackfill: boolean = false,
  knownCandidates: Array<{ repo: string; number: number }> = [],
): Promise<FetchReviewsResult> => {
  const reviews: CodeReview[] = [];
  const comments: ReviewComment[] = [];
  const threadInputs: ReviewCommentThreadInput[] = [];
  const aiReviewSubmissions: AiReviewSubmissionInput[] = [];
  const lower = username.toLowerCase();
  const candidateEnd = Math.min(
    collectedAt.getTime(),
    range.to.getTime() + MAX_COLLECTION_LAG_MS,
  );

  const contributionCandidates = new Map<string, Set<number>>();
  if (historicalBackfill) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { ...GITHUB_HEADERS(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){pullRequestReviewContributions(first:100){nodes{pullRequest{number repository{nameWithOwner}}}}}}}`,
        variables: { login: username, from: range.from.toISOString(), to: range.to.toISOString() },
      }),
    });
    if (response.ok) {
      const body = await response.json() as { data?: { user?: { contributionsCollection?: { pullRequestReviewContributions?: { nodes?: Array<{ pullRequest: { number: number; repository: { nameWithOwner: string } } }> } } } } };
      for (const node of body.data?.user?.contributionsCollection?.pullRequestReviewContributions?.nodes ?? []) {
        const repo = node.pullRequest.repository.nameWithOwner;
        const set = contributionCandidates.get(repo) ?? new Set<number>();
        set.add(node.pullRequest.number);
        contributionCandidates.set(repo, set);
      }
    }
  }

  await runWithConcurrency(repos, async (repo) => {
    // Include PRs changed after the report day but before collection. Their
    // individual reviews/comments are still filtered to the exact report range.
    const params = new URLSearchParams({
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: "50",
    });
    type CandidatePR = {
      number: number;
      title: string;
      html_url: string;
      created_at: string;
      updated_at: string;
    };
    let prs: CandidatePR[];
    if (historicalBackfill) {
      const numbers = new Set<number>([
        ...knownCandidates.filter((candidate) => candidate.repo === repo).map((candidate) => candidate.number),
        ...(contributionCandidates.get(repo) ?? []),
      ]);
      const activityComments = await fetchJsonPages<RawComment>(
        token,
        `https://api.github.com/repos/${repo}/pulls/comments?since=${encodeURIComponent(range.from.toISOString())}&per_page=100`,
      );
      for (const comment of activityComments.filter((comment) => inRange(comment.created_at, range))) {
        const number = Number(comment.pull_request_url.split("/").at(-1));
        if (Number.isInteger(number)) numbers.add(number);
      }
      prs = (await Promise.all([...numbers].map(async (number) => {
        const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, {
          headers: GITHUB_HEADERS(token),
        });
        return response.ok ? await response.json() as CandidatePR : null;
      }))).filter((pr): pr is CandidatePR => pr !== null);
    } else {
      prs = await fetchJsonPages<CandidatePR>(token, `https://api.github.com/repos/${repo}/pulls?${params}`);
    }

    const relevant = historicalBackfill
      ? prs
      : prs.filter((pr) => {
        const updated = new Date(pr.updated_at).getTime();
        return updated >= range.from.getTime() && updated <= candidateEnd;
      }).slice(0, MAX_PRS_PER_REPO);

    for (const pr of relevant) {
      const rawReviews = await fetchJsonPages<RawReview>(
        token,
        `https://api.github.com/repos/${repo}/pulls/${pr.number}/reviews`,
      );

      for (const r of rawReviews) {
        const login = r.user?.login ?? "";
        if (r.submitted_at) {
          aiReviewSubmissions.push({
            authorLogin: login,
            submittedAt: r.submitted_at,
            repository: repo,
            prNumber: pr.number,
            state: r.state,
          });
        }
      }

      rawReviews
        .filter((r) => r.user?.login.toLowerCase() === lower)
        .filter((r) => inRange(r.submitted_at, range))
        .forEach((r) => {
          reviews.push({
            repository: repo,
            prNumber: pr.number,
            prTitle: pr.title,
            prUrl: pr.html_url,
            state: r.state.toLowerCase(),
            submittedAt: r.submitted_at ?? "",
            body: cleanBody(r.body),
          });
        });

      const rawComments = await fetchJsonPages<RawComment>(
        token,
        `https://api.github.com/repos/${repo}/pulls/${pr.number}/comments`,
      );

      // Keep the full thread graph so AI parents of in-range fix replies are visible.
      for (const c of rawComments) {
        threadInputs.push({
          id: c.id,
          inReplyToId: c.in_reply_to_id ?? null,
          authorLogin: c.user?.login ?? "",
          body: c.body ?? "",
          createdAt: c.created_at,
          repository: repo,
          prNumber: pr.number,
        });
      }

      rawComments
        .filter((c) => c.user?.login.toLowerCase() === lower)
        .filter((c) => inRange(c.created_at, range))
        .forEach((c) => {
          comments.push({
            repository: repo,
            prNumber: pr.number,
            prUrl: pr.html_url,
            url: c.html_url,
            body: cleanBody(c.body)?.slice(0, 500) ?? "",
            path: c.path,
            createdAt: c.created_at,
          });
        });
    }
  });

  const aiReviews =
    threadInputs.length === 0 && aiReviewSubmissions.length === 0
      ? emptyAiReviewActivity()
      : countAiReviewActivity(threadInputs, aiReviewSubmissions, {
          username,
          inRange: (iso) => inRange(iso, range),
        });

  return { reviews, comments, aiReviews };
};
