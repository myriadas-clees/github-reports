// Main report renderer: compiles Handlebars templates into a self-contained HTML file

import Handlebars from "handlebars";
import type {
  WeeklyReportData,
  Language,
  Theme,
  DailyCommitCount,
  RepositoryActivity,
  RepoCommitMessages,
  CommitDetail,
  PullRequest,
  AiReviewerStats,
} from "../types.js";
import { getLocale } from "../i18n/index.js";
import { loadTheme, readThemeTemplate } from "./themes/index.js";
import { registerHelpers } from "./helpers.js";
import {
  hasAiReviewActivity,
  normalizeAiReviewActivity,
  summarizeAiReviewerDone,
} from "../collector/ai-review-fixes.js";

const PARTIAL_NAMES = [
  "header",
  "overview",
  "activity",
  "summaries",
  "highlights",
  "footer",
  "github-mark",
] as const;

type DailyCommitWithLevel = DailyCommitCount & { level: number };

const PR_NUM_IN_MESSAGE = /\(#(\d+)\)/;
const PR_NUM_IN_URL = /\/pull\/(\d+)(?:\/|$|\?|#)/;

/** Extract PR number from a GitHub pull-request URL. */
export const extractPrNumberFromUrl = (url: string): number | null => {
  const m = url.match(PR_NUM_IN_URL);
  return m ? Number(m[1]) : null;
};

/** Extract `(#N)` PR reference from a commit message. */
export const extractPrNumberFromMessage = (message: string): number | null => {
  const m = message.match(PR_NUM_IN_MESSAGE);
  return m ? Number(m[1]) : null;
};

/** Normalize titles/messages for fuzzy PR ↔ commit matching. */
export const normalizeActivityTitle = (text: string): string =>
  text
    .replace(/\(#\d+\)/g, "")
    .replace(/\[skip ci\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export type CommitListView = {
  commitDetails: CommitDetail[];
  commitTexts: string[];
};

/** PR nested under a repository in the activity section. */
export type PullRequestActivityView = {
  number: number | null;
  title: string;
  url: string;
  state: PullRequest["state"];
  additions: number;
  deletions: number;
  commitDetails: CommitDetail[];
  commitTexts: string[];
};

/** Repository row with nested PRs → commits for the activity section. */
export type RepositoryActivityView = RepositoryActivity & {
  pullRequests: PullRequestActivityView[];
  /** Commits that could not be associated with a PR. */
  otherCommits: CommitListView;
  hasOtherCommits: boolean;
  /** True when the row should render as expandable `<details>`. */
  expandable: boolean;
};

export type EnrichRepositoriesResult = {
  repositories: RepositoryActivityView[];
  /** PRs whose repository could not be nested (should be rare). */
  orphanPullRequests: PullRequest[];
};

const emptyCommitList = (): CommitListView => ({
  commitDetails: [],
  commitTexts: [],
});

const toPrView = (pr: PullRequest): PullRequestActivityView => ({
  number: extractPrNumberFromUrl(pr.url),
  title: pr.title,
  url: pr.url,
  state: pr.state,
  additions: pr.additions,
  deletions: pr.deletions,
  commitDetails: [],
  commitTexts: [],
});

const assignCommitsToPrs = (
  cm: RepoCommitMessages | undefined,
  prViews: PullRequestActivityView[],
): CommitListView => {
  const other = emptyCommitList();
  if (!cm) return other;

  const byNumber = new Map<number, PullRequestActivityView>();
  const byTitle = new Map<string, PullRequestActivityView>();
  for (const pr of prViews) {
    if (pr.number != null) byNumber.set(pr.number, pr);
    const key = normalizeActivityTitle(pr.title);
    if (key && !byTitle.has(key)) byTitle.set(key, pr);
  }

  const place = (message: string, detail?: CommitDetail): void => {
    const num = extractPrNumberFromMessage(message);
    let pr = num != null ? byNumber.get(num) : undefined;
    if (!pr) pr = byTitle.get(normalizeActivityTitle(message));
    if (pr) {
      if (detail) pr.commitDetails.push(detail);
      pr.commitTexts.push(message);
      return;
    }
    if (detail) other.commitDetails.push(detail);
    other.commitTexts.push(message);
  };

  const details = cm.commits ?? [];
  if (details.length > 0) {
    for (const c of details) place(c.message, c);
  } else {
    for (const message of cm.messages ?? []) place(message);
  }

  return other;
};

const stubRepo = (name: string): RepositoryActivity => ({
  name,
  commits: 0,
  prsOpened: 0,
  prsMerged: 0,
  issuesOpened: 0,
  issuesClosed: 0,
  url: `https://github.com/${name}`,
});

/**
 * Nest activity as Repo → PR → Commits.
 * Commits match a PR via `(#N)` in the message, else normalized title match.
 * Unmatched commits land in `otherCommits` ("Direct commits") under the repo.
 */
export const enrichRepositoriesWithCommits = (
  repositories: RepositoryActivity[],
  commitMessages: RepoCommitMessages[],
  pullRequests: PullRequest[] = [],
): EnrichRepositoriesResult => {
  const commitsByRepo = new Map(commitMessages.map((cm) => [cm.repo, cm]));
  const prsByRepo = new Map<string, PullRequest[]>();
  for (const pr of pullRequests) {
    const key = pr.repository;
    const list = prsByRepo.get(key);
    if (list) list.push(pr);
    else prsByRepo.set(key, [pr]);
  }

  const seen = new Set<string>();

  const enrich = (repo: RepositoryActivity): RepositoryActivityView => {
    seen.add(repo.name);
    const prViews = (prsByRepo.get(repo.name) ?? []).map(toPrView);
    const otherCommits = assignCommitsToPrs(commitsByRepo.get(repo.name), prViews);
    const hasOtherCommits =
      otherCommits.commitDetails.length > 0 || otherCommits.commitTexts.length > 0;
    return {
      ...repo,
      pullRequests: prViews,
      otherCommits,
      hasOtherCommits,
      expandable: prViews.length > 0 || hasOtherCommits,
    };
  };

  const result = repositories.map(enrich);

  for (const cm of commitMessages) {
    if (seen.has(cm.repo)) continue;
    result.push(enrich({
      ...stubRepo(cm.repo),
      commits: cm.commits?.length || cm.messages.length,
    }));
  }

  for (const [repoName, prs] of prsByRepo) {
    if (seen.has(repoName)) continue;
    const opened = prs.filter((p) => p.state === "open").length;
    const merged = prs.filter((p) => p.state === "merged").length;
    result.push(enrich({
      ...stubRepo(repoName),
      prsOpened: opened,
      prsMerged: merged,
    }));
  }

  const orphanPullRequests = pullRequests.filter((pr) => !seen.has(pr.repository));

  return { repositories: result, orphanPullRequests };
};

export type AiReviewerView = AiReviewerStats & {
  hasActivity: boolean;
  summary: string;
};

export type AiReviewActivityView = {
  codex: AiReviewerView;
  cursor: AiReviewerView;
  hasActivity: boolean;
  prsReviewed: number;
  comments: number;
  reviews: number;
  fixed: number;
};

const toAiReviewerView = (stats: AiReviewerStats): AiReviewerView => {
  const summary = summarizeAiReviewerDone(stats);
  return {
    ...stats,
    hasActivity: summary.length > 0,
    summary,
  };
};

/** Build template-friendly AI review chips from aiReviews or legacy aiReviewFixes. */
export const buildAiReviewActivityView = (
  data: Pick<WeeklyReportData, "aiReviews" | "aiReviewFixes">,
): AiReviewActivityView => {
  const activity = normalizeAiReviewActivity(data.aiReviews, data.aiReviewFixes);
  return {
    codex: toAiReviewerView(activity.codex),
    cursor: toAiReviewerView(activity.cursor),
    hasActivity: hasAiReviewActivity(activity),
    prsReviewed: activity.prsReviewed,
    comments: activity.comments,
    reviews: activity.reviews,
    fixed: activity.fixed,
  };
};

export const computeHeatmapLevels = (dailyCommits: DailyCommitCount[]): DailyCommitWithLevel[] => {
  const days = [...dailyCommits].sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(...days.map((d) => d.count), 1);
  return days.map((d) => {
    if (d.count === 0) return { ...d, level: 0 };
    const ratio = d.count / max;
    if (ratio <= 0.25) return { ...d, level: 1 };
    if (ratio <= 0.5) return { ...d, level: 2 };
    if (ratio <= 0.75) return { ...d, level: 3 };
    return { ...d, level: 4 };
  });
};

export type RenderOptions = {
  language?: Language;
  timezone?: string;
  baseUrl?: string;
  weekPath?: string;
  rootPrefix?: string;
  siteTitle?: string;
  prevWeek?: string;
  nextWeek?: string;
  theme?: Theme;
};

const createInstance = (language: Language, timezone: string, theme: ReturnType<typeof loadTheme>): typeof Handlebars => {
  const hbs = Handlebars.create();
  registerHelpers(hbs, { language, timezone });

  PARTIAL_NAMES.forEach((name) => {
    hbs.registerPartial(name, readThemeTemplate(theme, `partials/${name}.hbs`));
  });

  return hbs;
};

/** Render a daily report as a self-contained HTML string. */
export const renderReport = (
  data: WeeklyReportData,
  options: RenderOptions = {},
): string => {
  const language = options.language ?? "en";
  const timezone = options.timezone ?? "UTC";
  const locale = getLocale(language);
  const theme = loadTheme(options.theme ?? "brutalist");

  const hbs = createInstance(language, timezone, theme);
  const template = hbs.compile(readThemeTemplate(theme, "report.hbs"));

  const baseUrl = options.baseUrl?.replace(/\/+$/, "") ?? "";
  const weekPath = options.weekPath ?? "";
  const rootPrefix = options.rootPrefix ?? "../".repeat(weekPath.split("/").filter(Boolean).length);
  const canonicalUrl = baseUrl && weekPath ? `${baseUrl}/${weekPath}/` : undefined;
  const ogImageUrl = baseUrl && weekPath ? `${baseUrl}/${weekPath}/og.png` : "og.png";

  const siteTitle = (options.siteTitle ?? "Dev\nPulse").replace(/\\n/g, "\n");
  const siteTitleInline = siteTitle.replace(/\n/g, " ");

  const enriched = enrichRepositoriesWithCommits(
    data.repositories,
    data.commitMessages,
    data.pullRequests,
  );

  return template({
    ...data,
    repositories: enriched.repositories,
    // Nested under repos; only orphans remain as a flat list.
    pullRequests: enriched.orphanPullRequests,
    aiReviews: buildAiReviewActivityView(data),
    dailyCommits: computeHeatmapLevels(data.dailyCommits),
    css: theme.buildCSS(language),
    lang: language,
    i18n: locale,
    baseUrl,
    canonicalUrl,
    ogImageUrl,
    siteTitle,
    siteTitleInline,
    rootPrefix,
    themeColor: theme.colors.bg,
    themeInitScript: theme.themeInitScript ?? "",
    themeToggleScript: theme.themeToggleScript ?? "",
    prevWeek: options.prevWeek,
    nextWeek: options.nextWeek,
  });
};
