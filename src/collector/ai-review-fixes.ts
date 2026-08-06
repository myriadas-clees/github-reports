// Count Codex/Cursor review activity from GitHub PR review data.
//
// Primary metric — reviews **done** this work week (not Fixed/Addressed):
// - reviews:  PR review submissions by the bot in-range
// - comments: root review comments by the bot in-range (≈ line-level findings)
// - prsReviewed: distinct PRs that received ≥1 of the above in-range
//
// Secondary (optional / buried):
// - fixed: AI root comments that later got a Fixed/Addressed reply from the reporter
//
// "Done" for display = reviews when present, else comments; chips also show PRs.
// "Fixed" rule: a reply whose body starts with "Fixed", "Fixed in …", or "Addressed".
// Each AI root comment is counted at most once for fixed.

import type { AiReviewActivity, AiReviewerStats, AiReviewFixCounts } from "../types.js";

export type AiReviewerId = "codex" | "cursor";

export type { AiReviewActivity, AiReviewerStats, AiReviewFixCounts };

/** Extensible login/name patterns (case-insensitive) for AI review bots. */
export const AI_REVIEWER_PATTERNS: ReadonlyArray<{
  id: AiReviewerId;
  label: string;
  /** Matched against the GitHub login (and optional display name). */
  pattern: RegExp;
}> = [
  {
    id: "codex",
    label: "Codex",
    // chatgpt-codex-connector[bot], codex[bot], openai-codex, etc.
    pattern: /chatgpt-codex|codex-connector|openai-codex|\bcodex(\[bot\])?\b/i,
  },
  {
    id: "cursor",
    label: "Cursor",
    // cursor[bot], cursor
    pattern: /^cursor(\[bot\])?$/i,
  },
];

export const emptyAiReviewerStats = (): AiReviewerStats => ({
  prsReviewed: 0,
  comments: 0,
  reviews: 0,
  fixed: 0,
});

export const emptyAiReviewActivity = (): AiReviewActivity => ({
  codex: emptyAiReviewerStats(),
  cursor: emptyAiReviewerStats(),
  prsReviewed: 0,
  comments: 0,
  reviews: 0,
  fixed: 0,
});

/** @deprecated Prefer emptyAiReviewActivity; kept for legacy fixed-only callers. */
export const emptyAiReviewFixCounts = (): AiReviewFixCounts => ({
  codex: 0,
  cursor: 0,
  total: 0,
});

/** True when any bot did review work (or legacy fixed-only data remains). */
export const hasAiReviewActivity = (activity: AiReviewActivity): boolean =>
  activity.comments > 0 ||
  activity.reviews > 0 ||
  activity.prsReviewed > 0 ||
  activity.fixed > 0;

/**
 * Primary “done” count for a bot: review submissions when present, else root comments.
 * Fixed/Addressed replies are intentionally excluded.
 */
export const aiReviewsDone = (stats: AiReviewerStats): number =>
  stats.reviews > 0 ? stats.reviews : stats.comments;

/**
 * Chip / summary text emphasizing reviews done (not Fixed).
 * Examples: "5 reviews · 20 comments · 8 PRs", "4 comments · 2 PRs", "3 reviews".
 */
export const summarizeAiReviewerDone = (stats: AiReviewerStats): string => {
  const parts: string[] = [];
  if (stats.reviews > 0) {
    parts.push(`${stats.reviews} review${stats.reviews === 1 ? "" : "s"}`);
  }
  if (stats.comments > 0) {
    parts.push(`${stats.comments} comment${stats.comments === 1 ? "" : "s"}`);
  }
  if (stats.prsReviewed > 0) {
    parts.push(`${stats.prsReviewed} PR${stats.prsReviewed === 1 ? "" : "s"}`);
  }
  // Legacy / incomplete YAML that only stored Fixed counts: treat as findings done.
  if (parts.length === 0 && stats.fixed > 0) {
    parts.push(`${stats.fixed} comment${stats.fixed === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
};

export const identifyAiReviewer = (
  login: string | null | undefined,
): AiReviewerId | null => {
  if (!login) return null;
  const trimmed = login.trim();
  for (const entry of AI_REVIEWER_PATTERNS) {
    if (entry.pattern.test(trimmed)) return entry.id;
  }
  return null;
};

/**
 * True when a reply body signals the parent review was fixed/addressed.
 * Leading whitespace/markdown emphasis is ignored.
 */
export const isFixedReply = (body: string | null | undefined): boolean => {
  if (!body) return false;
  const normalized = body
    .trim()
    .replace(/^[*_~`]+/, "")
    .trim();
  return /^(fixed(\s+in)?|addressed)\b/i.test(normalized);
};

export type ReviewCommentThreadInput = {
  id: number;
  inReplyToId: number | null;
  authorLogin: string;
  body: string;
  createdAt: string;
  repository?: string;
  prNumber?: number;
};

export type AiReviewSubmissionInput = {
  authorLogin: string;
  submittedAt: string;
  repository: string;
  prNumber: number;
  /** GitHub review state; PENDING reviews are ignored. */
  state?: string;
};

export type CountAiReviewActivityOptions = {
  /** When set, only count fix replies authored by this user. */
  username?: string;
  /** When set, only count events whose timestamps pass the predicate. */
  inRange?: (iso: string) => boolean;
};

const prKey = (repository: string, prNumber: number): string =>
  `${repository}#${prNumber}`;

const rollupTotals = (activity: AiReviewActivity): void => {
  activity.prsReviewed = activity.codex.prsReviewed + activity.cursor.prsReviewed;
  activity.comments = activity.codex.comments + activity.cursor.comments;
  activity.reviews = activity.codex.reviews + activity.cursor.reviews;
  activity.fixed = activity.codex.fixed + activity.cursor.fixed;
};

/**
 * Count Codex/Cursor review activity from PR review submissions + comment threads.
 */
export const countAiReviewActivity = (
  comments: ReviewCommentThreadInput[],
  reviews: AiReviewSubmissionInput[] = [],
  options: CountAiReviewActivityOptions = {},
): AiReviewActivity => {
  const activity = emptyAiReviewActivity();
  const username = options.username?.toLowerCase();
  const inRange = options.inRange ?? (() => true);

  const prsByReviewer: Record<AiReviewerId, Set<string>> = {
    codex: new Set(),
    cursor: new Set(),
  };

  for (const review of reviews) {
    if ((review.state ?? "").toUpperCase() === "PENDING") continue;
    if (!inRange(review.submittedAt)) continue;
    const reviewer = identifyAiReviewer(review.authorLogin);
    if (!reviewer) continue;
    activity[reviewer].reviews += 1;
    prsByReviewer[reviewer].add(prKey(review.repository, review.prNumber));
  }

  const byId = new Map(comments.map((c) => [c.id, c]));

  for (const comment of comments) {
    if (comment.inReplyToId != null) continue;
    if (!inRange(comment.createdAt)) continue;
    const reviewer = identifyAiReviewer(comment.authorLogin);
    if (!reviewer) continue;
    activity[reviewer].comments += 1;
    if (comment.repository != null && comment.prNumber != null) {
      prsByReviewer[reviewer].add(prKey(comment.repository, comment.prNumber));
    }
  }

  const countedParents = new Set<number>();
  for (const comment of comments) {
    if (comment.inReplyToId == null) continue;
    if (!isFixedReply(comment.body)) continue;
    if (username && comment.authorLogin.toLowerCase() !== username) continue;
    if (!inRange(comment.createdAt)) continue;

    const parentId = comment.inReplyToId;
    if (countedParents.has(parentId)) continue;

    const parent = byId.get(parentId);
    if (!parent) continue;

    const reviewer = identifyAiReviewer(parent.authorLogin);
    if (!reviewer) continue;

    countedParents.add(parentId);
    activity[reviewer].fixed += 1;
  }

  for (const id of ["codex", "cursor"] as const) {
    activity[id].prsReviewed = prsByReviewer[id].size;
  }
  rollupTotals(activity);
  return activity;
};

/**
 * Count AI root review comments that received a Fixed/Addressed reply.
 * @deprecated Prefer countAiReviewActivity; retained for focused fixed-only tests.
 */
export const countAiReviewFixes = (
  comments: ReviewCommentThreadInput[],
  options: CountAiReviewActivityOptions = {},
): AiReviewFixCounts => {
  const activity = countAiReviewActivity(comments, [], options);
  return {
    codex: activity.codex.fixed,
    cursor: activity.cursor.fixed,
    total: activity.fixed,
  };
};

/**
 * When YAML only has Fixed counts (incomplete fetch), promote fixed → comments
 * so UI can show “done” findings instead of emphasizing Fixed/Addressed.
 */
const promoteFixedToCommentsIfIncomplete = (stats: AiReviewerStats): AiReviewerStats => {
  if (stats.comments === 0 && stats.reviews === 0 && stats.prsReviewed === 0 && stats.fixed > 0) {
    return { ...stats, comments: stats.fixed };
  }
  return stats;
};

/**
 * Normalize stored YAML shapes: prefer `aiReviews`, fall back to legacy `aiReviewFixes`.
 * Incomplete fixed-only records are promoted to comments for “done” display.
 */
export const normalizeAiReviewActivity = (
  activity?: AiReviewActivity | null,
  legacyFixes?: AiReviewFixCounts | null,
): AiReviewActivity => {
  if (activity?.codex && activity?.cursor) {
    const out: AiReviewActivity = {
      codex: promoteFixedToCommentsIfIncomplete({
        prsReviewed: activity.codex.prsReviewed ?? 0,
        comments: activity.codex.comments ?? 0,
        reviews: activity.codex.reviews ?? 0,
        fixed: activity.codex.fixed ?? 0,
      }),
      cursor: promoteFixedToCommentsIfIncomplete({
        prsReviewed: activity.cursor.prsReviewed ?? 0,
        comments: activity.cursor.comments ?? 0,
        reviews: activity.cursor.reviews ?? 0,
        fixed: activity.cursor.fixed ?? 0,
      }),
      prsReviewed: 0,
      comments: 0,
      reviews: 0,
      fixed: 0,
    };
    rollupTotals(out);
    return out;
  }

  if (legacyFixes) {
    const out = emptyAiReviewActivity();
    // Legacy YAML only stored Fixed/Addressed. Treat as a lower-bound on findings done.
    out.codex.comments = legacyFixes.codex ?? 0;
    out.cursor.comments = legacyFixes.cursor ?? 0;
    out.codex.fixed = legacyFixes.codex ?? 0;
    out.cursor.fixed = legacyFixes.cursor ?? 0;
    rollupTotals(out);
    return out;
  }

  return emptyAiReviewActivity();
};
