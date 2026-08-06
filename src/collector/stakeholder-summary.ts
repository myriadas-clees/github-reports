// Week framing for reports without an LLM.
// Metrics live in chips / activity sections — avoid restating them in a prose dump.
// Hero subtitle already carries the theme line from buildWeekThemeLine.

import type {
  AIContent,
  PullRequest,
  WeeklyReportData,
  WeeklyStats,
  RepositoryActivity,
  CodeReview,
  HoursEstimate,
  AiReviewActivity,
  AiReviewFixCounts,
} from "../types.js";
import {
  hasAiReviewActivity,
  normalizeAiReviewActivity,
  summarizeAiReviewerDone,
} from "./ai-review-fixes.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact range for titles when dates already appear in page meta. */
export const formatShortWeekTitle = (from: string, to: string): string => {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return `Week of ${from}`;
  const fromLabel = `${MONTHS[fm - 1]} ${fd}`;
  if (fy === ty && fm === tm) return `${fromLabel}-${td}`;
  if (fy === ty) return `${fromLabel}-${MONTHS[tm - 1]} ${td}`;
  return `${fromLabel}, ${fy}-${MONTHS[tm - 1]} ${td}, ${ty}`;
};

/** One-line theme from conventional-commit scopes / short PR titles. */
export const buildWeekThemeLine = (pullRequests: PullRequest[]): string => {
  const stop = new Set([
    "add", "fix", "update", "improve", "refactor", "remove", "make", "set",
    "the", "a", "an", "to", "for", "and", "with", "from", "into", "on", "in",
  ]);
  const counts = new Map<string, number>();
  for (const pr of pullRequests) {
    const scope = /\(([a-z0-9/_-]+)\)/i.exec(pr.title)?.[1]?.toLowerCase();
    let key = scope ?? "";
    if (!key) {
      const stripped = pr.title
        .replace(/^(feat|fix|chore|docs|refactor|test|ci|build|perf|revert)(\(.+?\))?:\s*/i, "")
        .trim();
      const tokens = stripped
        .toLowerCase()
        .replace(/[^a-z0-9\s/-]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !stop.has(t));
      key = tokens.slice(0, 2).join(" ");
    }
    if (!key || key.length < 2) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([k]) => k);
  if (top.length === 0) return "Weekly status";
  if (top.length === 1) return top[0];
  if (top.length === 2) return `${top[0]} & ${top[1]}`;
  return `${top[0]}, ${top[1]} & ${top[2]}`;
};

const repoList = (repos: RepositoryActivity[], limit = 5): string => {
  const names = repos.slice(0, limit).map((r) => r.name);
  if (names.length === 0) return "no repositories";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
};

/**
 * Optional prose blurb above Activity detail.
 * Default is empty: chips, Overview, and Highlights already carry the numbers,
 * and the hero subtitle carries the week theme. Set a custom string in YAML
 * only when you want an explicit narrative without an LLM.
 */
export const buildStakeholderSummary = (_data: {
  username: string;
  dateRange: { from: string; to: string };
  stats: WeeklyStats;
  repositories: RepositoryActivity[];
  pullRequests: PullRequest[];
  prsInProgress?: PullRequest[];
  codeReviews?: CodeReview[];
  aiReviews?: AiReviewActivity;
  /** @deprecated Prefer aiReviews. */
  aiReviewFixes?: AiReviewFixCounts;
  hoursEstimate?: HoursEstimate;
}): string => "";

export const buildFallbackAIContent = (data: WeeklyReportData): AIContent => {
  const merged = data.pullRequests.filter((pr) => pr.state === "merged").slice(0, 5);
  const inProgress = (data.prsInProgress ?? data.pullRequests.filter((pr) => pr.state === "open")).slice(0, 3);

  const highlights = [
    ...merged.map((pr) => ({
      type: "pr" as const,
      title: pr.title,
      repo: pr.repository,
      meta: `merged · +${pr.additions} −${pr.deletions}`,
      body: pr.body?.slice(0, 200) || "Merged pull request.",
      url: pr.url,
    })),
    ...inProgress.map((pr) => ({
      type: "pr" as const,
      title: pr.title,
      repo: pr.repository,
      meta: `in progress · +${pr.additions} −${pr.deletions}`,
      body: "Still open at the end of the reporting window.",
      url: pr.url,
    })),
  ].slice(0, 5);

  const summaries = [
    {
      type: "repo-summary",
      heading: "Projects worked on",
      body:
        data.repositories.length > 0
          ? `Activity spanned ${repoList(data.repositories)}.`
          : "No repository activity recorded.",
      chips: data.repositories.slice(0, 6).map((r) => ({
        label: r.name,
        value: `${r.prsOpened} PRs`,
      })),
    },
    {
      type: "commit-summary",
      heading: "Commits and line changes",
      body: `${data.stats.totalCommits} commits with +${data.stats.totalAdditions.toLocaleString()} / −${data.stats.totalDeletions.toLocaleString()} lines.`,
      chips: [
        { label: "Commits", value: String(data.stats.totalCommits), color: "green" as const },
        { label: "Additions", value: `+${data.stats.totalAdditions.toLocaleString()}`, color: "green" as const },
        { label: "Deletions", value: `−${data.stats.totalDeletions.toLocaleString()}`, color: "red" as const },
      ],
    },
    ...(data.stats.prsReviewed > 0 || (data.codeReviews?.length ?? 0) > 0
      ? [
          {
            type: "review-summary",
            heading: "Reviews",
            body: `${data.stats.prsReviewed} reviews` +
              (data.stats.reviewComments > 0
                ? ` with ${data.stats.reviewComments} comments.`
                : "."),
            chips: [
              { label: "Reviews", value: String(data.stats.prsReviewed) },
              ...(data.stats.reviewComments > 0
                ? [{ label: "Comments", value: String(data.stats.reviewComments) }]
                : []),
            ],
          },
        ]
      : []),
    ...(hasAiReviewActivity(normalizeAiReviewActivity(data.aiReviews, data.aiReviewFixes))
      ? [
          (() => {
            const ai = normalizeAiReviewActivity(data.aiReviews, data.aiReviewFixes);
            const chips: { label: string; value: string }[] = [];
            for (const [label, statsForBot] of [
              ["Codex", ai.codex],
              ["Cursor", ai.cursor],
            ] as const) {
              const summary = summarizeAiReviewerDone(statsForBot);
              if (summary) chips.push({ label, value: summary });
            }
            const bodyParts = chips.map((c) => `${c.label}: ${c.value.replace(/ · /g, ", ")}`);
            return {
              type: "review-summary" as const,
              heading: "AI code reviews",
              body:
                `Codex/Cursor reviews done this week (from GitHub PR data): ` +
                `${bodyParts.join("; ") || "activity recorded"}.`,
              chips,
            };
          })(),
        ]
      : []),
  ];

  if ((data.hoursEstimate?.hours ?? data.stats.estimatedHours) > 0) {
    summaries.push({
      type: "activity-pattern",
      heading: "Estimated hours",
      body: data.hoursEstimate?.note ??
        "Estimated from GitHub activity timestamps. Not tracked time.",
      chips: [
        {
          label: "Estimated hours",
          value: `~${data.hoursEstimate?.hours ?? data.stats.estimatedHours}h`,
        },
        {
          label: "Sessions",
          value: String(data.hoursEstimate?.sessions ?? "—"),
        },
      ],
    });
  }

  return {
    title: formatShortWeekTitle(data.dateRange.from, data.dateRange.to),
    subtitle: buildWeekThemeLine([
      ...data.pullRequests,
      ...(data.prsInProgress ?? []),
    ]),
    // Overview is omitted when it would duplicate a custom stakeholder blurb.
    overview: "",

    summaries,
    highlights,
    ticker: merged.slice(0, 5).map((pr) => ({
      label: "SHIPPED",
      text: `@${data.username} merged "${pr.title}" in ${pr.repository}`,
    })),
  };
};
