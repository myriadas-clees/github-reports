// Weekly report data types

import type { HoursInputs } from "./collector/estimate-hours.js";

export type { HoursInputs };

export type DailyCommitCount = {
  date: string; // ISO date string (YYYY-MM-DD)
  count: number;
};

export type RepositoryActivity = {
  name: string; // owner/repo
  commits: number;
  prsOpened: number;
  prsMerged: number;
  issuesOpened: number;
  issuesClosed: number;
  url: string;
};

export type PullRequest = {
  title: string;
  body: string | null;
  url: string;
  repository: string;
  state: "open" | "merged" | "closed";
  labels: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  author: string;
  createdAt: string;
  updatedAt?: string;
  workTimestamps?: string[];
  /** Reporting user's commits on the PR branch during the report window. */
  workCommits?: CommitDetail[];
  workAdditions?: number;
  workDeletions?: number;
  /** Unique files touched by the reporting user's commits in the report window. */
  workFiles?: string[];
  closedAt?: string | null;
  mergedAt: string | null;
};

export type Issue = {
  title: string;
  body: string | null;
  url: string;
  repository: string;
  state: "open" | "closed";
  labels: string[];
  author: string;
  createdAt: string;
  closedAt: string | null;
};

export type GitHubEvent = {
  id: string;
  type: string;
  repo: string;
  createdAt: string;
  payload: EventPayload;
};

export type EventPayload =
  | PushEventPayload
  | PullRequestReviewEventPayload
  | ReleaseEventPayload
  | PullRequestEventPayload
  | IssuesEventPayload
  | GenericEventPayload;

export type PushEventPayload = {
  kind: "push";
  ref: string;
  commits: string[];
};

export type PullRequestReviewEventPayload = {
  kind: "review";
  action: string;
  prNumber: number;
  prTitle: string;
  state: string; // approved, changes_requested, commented
};

export type ReleaseEventPayload = {
  kind: "release";
  action: string;
  tag: string;
  name: string;
};

export type PullRequestEventPayload = {
  kind: "pull_request";
  action: string;
  number: number;
  title: string;
};

export type IssuesEventPayload = {
  kind: "issues";
  action: string;
  number: number;
  title: string;
};

export type GenericEventPayload = {
  kind: "generic";
  action: string;
};

export type WeeklyStats = {
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  prsOpened: number;
  prsMerged: number;
  prsInProgress: number;
  prsReviewed: number;
  reviewComments: number;
  issuesOpened: number;
  issuesClosed: number;
  /** Estimated conventional engineering effort — not tracked, elapsed, or billed time. */
  estimatedHours: number;
};

export type ExternalContribution = {
  repo: string;
  events: GitHubEvent[];
  pullRequests: PullRequest[];
};

export type UserProfile = {
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers: number;
  following: number;
  publicRepos: number;
};

export type CommitDetail = {
  sha: string;
  message: string;
  url: string;
  authoredAt: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
};

export type RepoCommitMessages = {
  repo: string;
  messages: string[];
  commits?: CommitDetail[];
};

export type CodeReview = {
  repository: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  state: string;
  submittedAt: string;
  body: string | null;
};

export type ReviewComment = {
  repository: string;
  prNumber: number;
  prUrl: string;
  url: string;
  body: string;
  path: string | null;
  createdAt: string;
};

/**
 * Per-bot Codex/Cursor review stats from GitHub PR data (not Analytics).
 * Primary = reviews **done** (reviews + comments + PRs), not Fixed/Addressed.
 */
export type AiReviewerStats = {
  /** Distinct PRs with ≥1 in-range AI review or root comment. */
  prsReviewed: number;
  /** In-range AI root review comments (line-level findings) — part of “done”. */
  comments: number;
  /** In-range AI PR review submissions — primary “done” count when present. */
  reviews: number;
  /** Threads Fixed/Addressed by the reporter in-range (secondary; often omitted in UI). */
  fixed: number;
};

/** Aggregated Codex + Cursor review activity for the work week. */
export type AiReviewActivity = {
  codex: AiReviewerStats;
  cursor: AiReviewerStats;
  prsReviewed: number;
  comments: number;
  reviews: number;
  fixed: number;
};

/**
 * @deprecated Legacy fixed-only counts. Prefer AiReviewActivity / aiReviews.
 * Still accepted when reading older github-data.yaml files.
 */
export type AiReviewFixCounts = {
  codex: number;
  cursor: number;
  total: number;
};

export type HoursEstimate = {
  /** Formula identifier so archived estimates remain reproducible. */
  version?: string;
  hours: number;
  sessions: number;
  /** Hours from timestamp session clustering alone. */
  sessionHours?: number;
  /** Hours from PR size / reviews / commits. */
  volumeHours?: number;
  gapMinutes: number;
  maxSessionHours: number;
  note: string;
};

export type Release = {
  repo: string;
  tag: string;
  name: string;
  body: string | null;
  url: string;
  publishedAt: string;
};

export type WeeklyReportData = {
  username: string;
  avatarUrl: string;
  profile?: UserProfile;
  dateRange: { from: string; to: string };
  stats: WeeklyStats;
  dailyCommits: DailyCommitCount[];
  repositories: RepositoryActivity[];
  pullRequests: PullRequest[];
  /** PRs still open / in progress at end of the week. */
  prsInProgress?: PullRequest[];
  issues: Issue[];
  events: GitHubEvent[];
  commitMessages: RepoCommitMessages[];
  releases: Release[];
  externalContributions: ExternalContribution[];
  codeReviews?: CodeReview[];
  reviewComments?: ReviewComment[];
  /** Codex/Cursor reviews done this week (submissions, comments, PRs; fixed is secondary). */
  aiReviews?: AiReviewActivity;
  /**
   * @deprecated Prefer aiReviews. Kept so older YAML still loads.
   */
  aiReviewFixes?: AiReviewFixCounts;
  /** Inputs for estimateHours — recompute without refetch when the formula changes. */
  hoursInputs?: HoursInputs;
  hoursEstimate?: HoursEstimate;
  /** Plain-English summary for non-technical stakeholders. */
  stakeholderSummary?: string;
  aiContent: AIContent;
};

// LLM structured output

// Predefined types get special visuals, custom types render with chips only
export type SummaryType = string;

export type HighlightType = "pr" | "release" | "issue" | "discussion";

export type DataChip = {
  label: string;
  value: string;
  color?: "green" | "red" | "default";
};

export type SummarySection = {
  type: SummaryType;
  heading: string;
  body: string;
  chips?: DataChip[];
};

export type HighlightSection = {
  type: HighlightType;
  title: string;
  repo: string;
  meta: string;
  body: string;
  url?: string; // resolved from PR/Issue data, not from LLM
};

export type TickerItem = {
  label: string; // short punchy badge label (e.g. "SHIPPED!", "CODE PURGE")
  text: string;  // headline text (e.g. "@user ships JWT to production")
};

export type AIContent = {
  title: string;
  subtitle: string;
  overview: string; // multi-paragraph long-form text
  summaries: SummarySection[];
  highlights: HighlightSection[];
  ticker?: TickerItem[]; // headline items for animated SVG news ticker card
};

// Configuration types

export type Theme = "brutalist" | "minimal" | "editorial" | "swiss";

export type LLMProvider = "openai" | "anthropic" | "gemini" | "openrouter" | "groq" | "grok";

export type Language =
  | "en"
  | "ja"
  | "zh-CN"
  | "zh-TW"
  | "ko"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "ru";

export type ReportConfig = {
  githubToken: string;
  llmProvider: LLMProvider | null;
  llmApiKey: string | null;
  llmModel: string | null;
  language: Language;
  timezone: string; // IANA timezone (e.g. "Asia/Tokyo", "UTC")
  repositories?: string[];
};

// Effort allocation (stakeholder "where is the time going")
// Computed at render time from stored github-data.yaml — no GitHub refetch needed.

export type WorkType =
  | "new-capability"
  | "quality"
  | "maintenance"
  | "documentation"
  | "team-support"
  | "unlogged";

export type AllocationItem = {
  kind: "pr" | "review" | "commits" | "manual";
  title: string;
  url?: string;
  repository?: string;
  state?: "open" | "merged" | "closed";
  /** Scaled engineer-hour estimate for this PR (PR items only). Never shown as hours. */
  effortHours?: number;
  /** Stakeholder-facing impact badge derived from effort size or labels. */
  impact?: "major" | "notable";
};

export type AllocationBucket = {
  /** Stakeholder-facing initiative / product name. */
  initiative: string;
  hours: number;
  /** 0–1 share of the period's total hours. */
  share: number;
  byWorkType: Partial<Record<WorkType, number>>;
  shipped: AllocationItem[];
  inProgress: AllocationItem[];
  /** Other items (reviews, direct commits, manual entries). */
  other: AllocationItem[];
};

export type WorkTypeShare = {
  workType: WorkType;
  label: string;
  hours: number;
  share: number;
};

export type Allocation = {
  version: string;
  totalHours: number;
  /** Sorted by hours desc. */
  initiatives: AllocationBucket[];
  /** Sorted by hours desc; zero-hour types omitted. */
  workTypes: WorkTypeShare[];
  /** Self-reported hours included in totalHours. */
  manualHours: number;
  note: string;
};

export type AllocationPeriod = {
  /** e.g. "2026-10-01" (Thursday that starts the Thu–Wed work week). */
  id: string;
  label: string;
  from: string;
  to: string;
  /** Number of daily reports merged into this period. */
  days: number;
  allocation: Allocation;
};

export type AllocationTrend = {
  /** Union of initiative names across periods, ordered by total hours desc. */
  initiatives: string[];
  /** Chronological, oldest first. */
  periods: AllocationPeriod[];
};

export type ManualTimeEntry = {
  date: string; // YYYY-MM-DD
  initiative: string;
  hours: number;
  workType?: WorkType;
  note?: string;
};

export type AllocationConfig = {
  /**
   * Map from a classifier key to a stakeholder-facing initiative name. Keys:
   *   - exact PR label, e.g. "app: hub"
   *   - "scope:<conventional-commit scope>", e.g. "scope:pricing"
   *   - "repo:<owner/name>", e.g. "repo:org/app"
   */
  initiatives: Record<string, string>;
  /** Labels starting with this prefix name an initiative (default "app:"). */
  labelPrefix: string;
  /** Fallback initiative when nothing matches (default: humanized repo name). */
  defaultInitiative: string | null;
  /** Number of Thu–Wed weeks in the trend (default 8). */
  trendWeeks: number;
};
