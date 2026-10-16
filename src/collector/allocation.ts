// Effort allocation: split estimated hours into stakeholder initiatives and work types.
// Hours are an estimate distributed by delivered scope; self-reported time is added unscaled.

import { estimateDailyPrWorkHours, estimatePrHours } from "./estimate-hours.js";
import { formatShortWeekTitle } from "./stakeholder-summary.js";
import type {
  Allocation,
  AllocationBucket,
  AllocationItem,
  AllocationPeriod,
  PullRequest,
  WorkTypeShare,
  AllocationConfig,
  AllocationTrend,
  ManualTimeEntry,
  WeeklyReportData,
  WorkType,
} from "../types.js";

export const ALLOCATION_VERSION = "1.0";

export const DEFAULT_ALLOCATION_CONFIG: AllocationConfig = {
  initiatives: {},
  labelPrefix: "app:",
  defaultInitiative: null,
  trendWeeks: 8,
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  "new-capability": "New capability",
  quality: "Quality & bug fixes",
  maintenance: "Maintenance & tooling",
  documentation: "Documentation",
  "team-support": "Supporting the team",
  unlogged: "Meetings & unlogged (self-reported)",
};

const ALLOCATION_NOTE =
  "Work delivered is an estimate of how long a typical engineer would need to build the same changes, split across initiatives by delivered scope; it is not tracked time.";

/** Effort (engineer-hours) at or above which a PR is badged "major" (3 engineer-days). */
export const MAJOR_IMPACT_HOURS = 24;
/** Effort (engineer-hours) at or above which a PR is badged "notable" (1 engineer-day). */
export const NOTABLE_IMPACT_HOURS = 12;
const IMPACT_UP_LABEL_RE = /^(?:(?:impact|priority|severity)\s*:\s*(?:major|high|critical|p0|p1)|major|critical)$/i;
const IMPACT_DOWN_LABEL_RE = /^(?:impact|priority|severity)\s*:\s*(?:minor|low)$/i;

type Impact = NonNullable<AllocationItem["impact"]>;

/** Impact badge for a PR from its (scaled) effort and labels; a "minor"/"low" label forces none. */
export const deriveImpact = (effortHours: number | undefined, labels: string[] = []): Impact | undefined => {
  const trimmed = labels.map((label) => label.trim());
  if (trimmed.some((label) => IMPACT_DOWN_LABEL_RE.test(label))) return undefined;
  if (trimmed.some((label) => IMPACT_UP_LABEL_RE.test(label))) return "major";
  const hours = effortHours ?? 0;
  if (hours >= MAJOR_IMPACT_HOURS) return "major";
  if (hours >= NOTABLE_IMPACT_HOURS) return "notable";
  return undefined;
};

const IMPACT_RANK: Record<Impact, number> = { notable: 1, major: 2 };
const maxImpact = (a: Impact | undefined, b: Impact | undefined): Impact | undefined =>
  (a ? IMPACT_RANK[a] : 0) >= (b ? IMPACT_RANK[b] : 0) ? a : b;

/** Stable sort by effortHours desc, items without effort last. */
const byEffortDesc = (items: AllocationItem[]): AllocationItem[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.effortHours ?? -1) - (a.item.effortHours ?? -1) || a.index - b.index)
    .map(({ item }) => item);
const REVIEW_HOURS = 0.75;
const REVIEW_COMMENT_HOURS = 0.25;
const COMMIT_NO_STATS_HOURS = 0.5;
const FALLBACK_INITIATIVE = "General engineering";
const TEST_FILE_RE = /(^|\/)(__tests__|tests?)(\/|$)|\.(test|spec)\.[^/]+$/i;
const CONVENTIONAL_RE = /^\s*([a-z]+)(?:\(([^)]*)\))?!?:/i;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const day = (value: string): string => value.slice(0, 10);

const PREFIX_TYPES: Record<string, WorkType> = {
  feat: "new-capability",
  feature: "new-capability",
  fix: "quality",
  perf: "quality",
  revert: "quality",
  test: "quality",
  tests: "quality",
  refactor: "maintenance",
  chore: "maintenance",
  ci: "maintenance",
  build: "maintenance",
  style: "maintenance",
  deps: "maintenance",
  docs: "documentation",
};

const QUALITY_RE = /\b(fix(es|ed)?|bugs?|errors?|crash(es|ed)?|broken|regressions?)\b/i;
const DOCS_RE = /\b(docs?|readme|documentation)\b/i;
const MAINTENANCE_RE = /\b(bump|upgrade|refactor|clean ?up|ci|dependabot|deps|workflow)\b/i;
const FEATURE_RE = /\b(add|new|implement|introduce|build|create|redesign)\b/i;

/**
 * Classify a PR title / commit message into a work type.
 * A conventional prefix wins; else keywords (quality, docs, maintenance); else labels
 * as a tiebreaker (bug, documentation unless the title sounds like feature work, dependencies/chore);
 * otherwise new-capability.
 */
export const classifyWorkType = (text: string, labels: string[] = []): WorkType => {
  const prefix = CONVENTIONAL_RE.exec(text)?.[1]?.toLowerCase();
  if (prefix && PREFIX_TYPES[prefix]) return PREFIX_TYPES[prefix];
  if (QUALITY_RE.test(text)) return "quality";
  if (DOCS_RE.test(text)) return "documentation";
  if (MAINTENANCE_RE.test(text)) return "maintenance";
  const lower = labels.map((label) => label.trim().toLowerCase());
  if (lower.includes("bug")) return "quality";
  if (lower.includes("documentation") && !FEATURE_RE.test(text)) return "documentation";
  if (lower.some((label) => ["dependencies", "chore", "maintenance"].includes(label))) return "maintenance";
  return "new-capability";
};

const humanize = (value: string): string =>
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const lookup = (map: Record<string, string>, key: string): string | undefined => {
  if (map[key]) return map[key];
  const lower = key.toLowerCase();
  const found = Object.keys(map).find((candidate) => candidate.toLowerCase() === lower);
  return found ? map[found] : undefined;
};

/** Resolve the stakeholder initiative for a PR / commit. */
export const classifyInitiative = (
  input: { title: string; labels?: string[]; repository: string },
  config: AllocationConfig,
): string => {
  const labels = input.labels ?? [];
  const prefix = config.labelPrefix.toLowerCase();
  if (prefix) {
    for (const label of labels) {
      if (!label.toLowerCase().startsWith(prefix)) continue;
      const mapped = lookup(config.initiatives, label);
      if (mapped) return mapped;
      const suffix = label.slice(prefix.length).trim();
      if (suffix) return humanize(suffix);
    }
  }
  for (const label of labels) {
    const mapped = lookup(config.initiatives, label);
    if (mapped) return mapped;
  }
  const scopeText = CONVENTIONAL_RE.exec(input.title)?.[2];
  if (scopeText) {
    for (const scope of scopeText.split(",")) {
      const mapped = config.initiatives[`scope:${scope.trim().toLowerCase()}`];
      if (mapped) return mapped;
    }
  }
  // Unlabeled titles often name the product ("Fix Northstar brief retries").
  const named = [...new Set(Object.values(config.initiatives))]
    .sort((a, b) => b.length - a.length)
    .find((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(input.title));
  if (named) return named;
  const byRepo = config.initiatives[`repo:${input.repository}`];
  if (byRepo) return byRepo;
  if (config.defaultInitiative) return config.defaultInitiative;
  return humanize(input.repository.split("/").pop() ?? input.repository) || FALLBACK_INITIATIVE;
};

type Section = "shipped" | "inProgress" | "other";
type Entry = { initiative: string; workType: WorkType; weight: number };
type Placed = { initiative: string; section: Section; item: AllocationItem };
type Acc = { hours: number; byWorkType: Partial<Record<WorkType, number>>; shipped: AllocationItem[]; inProgress: AllocationItem[]; other: AllocationItem[] };

const emptyAcc = (): Acc => ({ hours: 0, byWorkType: {}, shipped: [], inProgress: [], other: [] });

const finalize = (accs: Map<string, Acc>, manualHours: number): Allocation => {
  const total = [...accs.values()].reduce((sum, acc) => sum + acc.hours, 0);
  const typeTotals = new Map<WorkType, number>();
  const initiatives: AllocationBucket[] = [...accs.entries()].map(([initiative, acc]) => {
    const byWorkType: Partial<Record<WorkType, number>> = {};
    for (const [type, hours] of Object.entries(acc.byWorkType) as [WorkType, number][]) {
      typeTotals.set(type, (typeTotals.get(type) ?? 0) + hours);
      if (round1(hours) > 0) byWorkType[type] = round1(hours);
    }
    return {
      initiative,
      hours: round1(acc.hours),
      share: total > 0 ? acc.hours / total : 0,
      byWorkType,
      shipped: byEffortDesc(acc.shipped),
      inProgress: byEffortDesc(acc.inProgress),
      other: acc.other,
    };
  });
  initiatives.sort((a, b) => b.hours - a.hours || a.initiative.localeCompare(b.initiative));
  const workTypes: WorkTypeShare[] = [...typeTotals.entries()]
    .filter(([, hours]) => hours > 0)
    .map(([workType, hours]) => ({
      workType,
      label: WORK_TYPE_LABELS[workType],
      hours: round1(hours),
      share: total > 0 ? hours / total : 0,
    }))
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
  return {
    version: ALLOCATION_VERSION,
    totalHours: round1(total),
    initiatives,
    workTypes,
    manualHours: round1(manualHours),
    note: ALLOCATION_NOTE,
  };
};

const addHours = (accs: Map<string, Acc>, initiative: string, workType: WorkType, hours: number): void => {
  const acc = accs.get(initiative) ?? emptyAcc();
  acc.hours += hours;
  acc.byWorkType[workType] = (acc.byWorkType[workType] ?? 0) + hours;
  accs.set(initiative, acc);
};

const placeItem = (accs: Map<string, Acc>, placed: Placed): void => {
  const acc = accs.get(placed.initiative) ?? emptyAcc();
  acc[placed.section].push(placed.item);
  accs.set(placed.initiative, acc);
};

const prWeight = (pr: PullRequest): number => {
  const hasDailyWork = (pr.workCommits?.length ?? 0) > 0 || pr.workAdditions != null;
  if (!hasDailyWork) return estimatePrHours(pr.additions ?? 0, pr.deletions ?? 0);
  const files = pr.workFiles ?? [];
  return estimateDailyPrWorkHours({
    additions: pr.workAdditions ?? 0,
    deletions: pr.workDeletions ?? 0,
    state: pr.state,
    dailyWork: true,
    filesChanged: files.length,
    testFilesChanged: files.filter((file) => TEST_FILE_RE.test(file)).length,
    commitCount: pr.workCommits?.length ?? 0,
  });
};

/** Allocate one report's estimated hours (data.hoursEstimate.hours / stats.estimatedHours). */
export const computeAllocation = (
  data: Pick<
    WeeklyReportData,
    "dateRange" | "stats" | "hoursEstimate" | "pullRequests" | "prsInProgress" | "commitMessages" | "codeReviews" | "reviewComments"
  >,
  config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG,
  manualTime: ManualTimeEntry[] = [],
): Allocation => {
  const target = Math.max(0, data.hoursEstimate?.hours ?? data.stats?.estimatedHours ?? 0);
  const entries: Entry[] = [];
  const placed: Placed[] = [];
  const prEffort: { item: AllocationItem; weight: number; labels: string[] }[] = [];

  const prs = new Map<string, PullRequest>();
  for (const pr of [...(data.pullRequests ?? []), ...(data.prsInProgress ?? [])]) {
    if (!prs.has(pr.url)) prs.set(pr.url, pr);
  }
  const workShas = new Set<string>();
  for (const pr of prs.values()) {
    const labels = pr.labels ?? [];
    entries.push({
      initiative: classifyInitiative({ title: pr.title, labels, repository: pr.repository }, config),
      workType: classifyWorkType(pr.title, labels),
      weight: prWeight(pr),
    });
    const initiative = entries[entries.length - 1].initiative;
    const section: Section = pr.state === "merged" ? "shipped" : pr.state === "open" ? "inProgress" : "other";
    const item: AllocationItem = { kind: "pr", title: pr.title, url: pr.url, repository: pr.repository, state: pr.state };
    placed.push({ initiative, section, item });
    prEffort.push({ item, weight: entries[entries.length - 1].weight, labels });
    for (const commit of pr.workCommits ?? []) workShas.add(commit.sha);
  }

  const prByRepoNumber = (repository: string, prNumber: number): PullRequest | undefined =>
    [...prs.values()].find((pr) => pr.repository === repository && pr.url.endsWith(`/pull/${prNumber}`));
  const reviewInitiative = (repository: string, title: string, url: string): string =>
    classifyInitiative({ title, labels: prs.get(url)?.labels ?? [], repository }, config);

  const reviewTitles = new Map<string, { title: string; url: string }>();
  const reviewedItems = new Set<string>();
  for (const review of data.codeReviews ?? []) {
    const initiative = reviewInitiative(review.repository, review.prTitle, review.prUrl);
    entries.push({ initiative, workType: "team-support", weight: REVIEW_HOURS });
    reviewTitles.set(`${review.repository}#${review.prNumber}`, { title: review.prTitle, url: review.prUrl });
    const key = `${initiative}|${review.prUrl}`;
    if (!reviewedItems.has(key)) {
      reviewedItems.add(key);
      placed.push({
        initiative,
        section: "other",
        item: { kind: "review", title: `Reviewed: ${review.prTitle}`, url: review.prUrl, repository: review.repository },
      });
    }
  }
  for (const comment of data.reviewComments ?? []) {
    const known = reviewTitles.get(`${comment.repository}#${comment.prNumber}`);
    const pr = prByRepoNumber(comment.repository, comment.prNumber);
    const initiative = known
      ? reviewInitiative(comment.repository, known.title, known.url)
      : pr
      ? reviewInitiative(comment.repository, pr.title, pr.url)
      : classifyInitiative({ title: "", labels: [], repository: comment.repository }, config);
    entries.push({ initiative, workType: "team-support", weight: REVIEW_COMMENT_HOURS });
  }

  type Group = { initiative: string; workType: WorkType; count: number; additions: number; deletions: number; withStats: number; repos: Set<string> };
  const groups = new Map<string, Group>();
  for (const repo of data.commitMessages ?? []) {
    const commits = repo.commits?.length
      ? repo.commits
      : (repo.messages ?? []).map((message) => ({ sha: "", message, additions: undefined, deletions: undefined }));
    for (const commit of commits) {
      if (commit.sha && workShas.has(commit.sha)) continue;
      const message = (commit.message ?? "").split("\n")[0];
      const initiative = classifyInitiative({ title: message, labels: [], repository: repo.repo }, config);
      const workType = classifyWorkType(message);
      const key = `${initiative}|${workType}`;
      const group = groups.get(key) ?? { initiative, workType, count: 0, additions: 0, deletions: 0, withStats: 0, repos: new Set() };
      group.count += 1;
      group.repos.add(repo.repo);
      if (commit.additions != null || commit.deletions != null) {
        group.withStats += 1;
        group.additions += commit.additions ?? 0;
        group.deletions += commit.deletions ?? 0;
      }
      groups.set(key, group);
    }
  }
  const commitCounts = new Map<string, { count: number; repos: Set<string> }>();
  for (const group of groups.values()) {
    entries.push({
      initiative: group.initiative,
      workType: group.workType,
      weight: group.withStats > 0 ? estimatePrHours(group.additions, group.deletions) : group.count * COMMIT_NO_STATS_HOURS,
    });
    const tally = commitCounts.get(group.initiative) ?? { count: 0, repos: new Set<string>() };
    tally.count += group.count;
    for (const repo of group.repos) tally.repos.add(repo);
    commitCounts.set(group.initiative, tally);
  }
  for (const [initiative, tally] of commitCounts) {
    placed.push({
      initiative,
      section: "other",
      item: {
        kind: "commits",
        title: `${tally.count} direct commit${tally.count === 1 ? "" : "s"}`,
        ...(tally.repos.size === 1 ? { repository: [...tally.repos][0] } : {}),
      },
    });
  }

  const accs = new Map<string, Acc>();
  const weightSum = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (weightSum > 0) {
    for (const entry of entries) addHours(accs, entry.initiative, entry.workType, (entry.weight / weightSum) * target);
  } else if (target > 0) {
    addHours(accs, config.defaultInitiative ?? FALLBACK_INITIATIVE, "maintenance", target);
  }
  if (weightSum > 0) {
    for (const { item, weight, labels } of prEffort) {
      item.effortHours = round1((weight / weightSum) * target);
      const impact = deriveImpact(item.effortHours, labels);
      if (impact) item.impact = impact;
    }
  }
  for (const item of placed) placeItem(accs, item);

  const from = day(data.dateRange?.from ?? "");
  const to = day(data.dateRange?.to ?? "");
  let manualHours = 0;
  for (const entry of manualTime) {
    const date = day(entry.date);
    if (date < from || date > to || !(entry.hours > 0)) continue;
    addHours(accs, entry.initiative, entry.workType ?? "unlogged", entry.hours);
    placeItem(accs, {
      initiative: entry.initiative,
      section: "other",
      item: { kind: "manual", title: entry.note ?? "Self-reported time" },
    });
    manualHours += entry.hours;
  }
  return finalize(accs, manualHours);
};

const itemKey = (item: AllocationItem): string => `${item.kind}|${item.url ?? item.title}`;

/** Merge several allocations (e.g. days in a week) into one. */
export const mergeAllocations = (allocations: Allocation[]): Allocation => {
  const accs = new Map<string, Acc>();
  const seen = new Map<string, AllocationItem>();
  const commitItems = new Map<string, { item: AllocationItem; count: number }>();
  let manualHours = 0;
  for (const allocation of allocations) {
    manualHours += allocation.manualHours;
    for (const bucket of allocation.initiatives) {
      const acc = accs.get(bucket.initiative) ?? emptyAcc();
      acc.hours += bucket.hours;
      for (const [type, hours] of Object.entries(bucket.byWorkType) as [WorkType, number][]) {
        acc.byWorkType[type] = (acc.byWorkType[type] ?? 0) + hours;
      }
      accs.set(bucket.initiative, acc);
      for (const section of ["shipped", "inProgress", "other"] as const) {
        for (const item of bucket[section]) {
          if (item.kind === "manual") {
            acc[section].push(item);
            continue;
          }
          if (item.kind === "commits") {
            const key = bucket.initiative;
            const count = Number.parseInt(item.title, 10) || 0;
            const existing = commitItems.get(key);
            if (existing) {
              existing.count += count;
              if (existing.item.repository !== item.repository) delete existing.item.repository;
            } else {
              const copy = { ...item };
              commitItems.set(key, { item: copy, count });
              acc[section].push(copy);
            }
            continue;
          }
          const key = `${bucket.initiative}|${section}|${itemKey(item)}`;
          const prior = seen.get(key);
          if (prior) {
            // Same PR on another day: effort accumulates; impact never drops (labels are not on items).
            if (item.effortHours != null) prior.effortHours = round1((prior.effortHours ?? 0) + item.effortHours);
            if (item.kind === "pr") {
              prior.impact = maxImpact(maxImpact(prior.impact, item.impact), deriveImpact(prior.effortHours));
              if (!prior.impact) delete prior.impact;
            }
            continue;
          }
          const copy = { ...item };
          seen.set(key, copy);
          acc[section].push(copy);
        }
      }
    }
  }
  for (const { item, count } of commitItems.values()) {
    item.title = `${count} direct commit${count === 1 ? "" : "s"}`;
  }
  // A PR shipped later in the period supersedes its in-progress appearances.
  const shippedUrls = new Set<string>();
  for (const acc of accs.values()) for (const item of acc.shipped) if (item.url) shippedUrls.add(item.url);
  for (const acc of accs.values()) {
    acc.inProgress = acc.inProgress.filter((item) => !item.url || !shippedUrls.has(item.url));
  }
  return finalize(accs, manualHours);
};

const DAY_MS = 86_400_000;
const parseUtc = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const formatUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Thursday on or before a YYYY-MM-DD date (work week starts Thursday). */
const weekStart = (date: string): string => {
  const ms = parseUtc(date);
  const back = (new Date(ms).getUTCDay() - 4 + 7) % 7;
  return formatUtc(ms - back * DAY_MS);
};

/** Group daily reports into Thu–Wed work weeks ending at `endDate`, last `config.trendWeeks` weeks. */
export const buildAllocationTrend = (
  reports: { date: string; data: Parameters<typeof computeAllocation>[0] }[],
  endDate: string,
  config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG,
  manualTime: ManualTimeEntry[] = [],
): AllocationTrend => {
  const end = day(endDate);
  const lastStart = parseUtc(weekStart(end));
  const weeks = Math.max(1, Math.floor(config.trendWeeks));
  const periods: AllocationPeriod[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const startMs = lastStart - i * 7 * DAY_MS;
    const from = formatUtc(startMs);
    const to = formatUtc(startMs + 6 * DAY_MS);
    const inWeek = reports.filter((report) => {
      const date = day(report.date);
      return date >= from && date <= to && date <= end;
    });
    const allocations = inWeek.map((report) => computeAllocation(report.data, config, manualTime));
    const covered = (date: string): boolean =>
      inWeek.some((report) =>
        day(report.date) === date ||
        (day(report.data.dateRange?.from ?? "") <= date && date <= day(report.data.dateRange?.to ?? ""))
      );
    const extra = manualTime.filter((entry) => {
      const date = day(entry.date);
      return date >= from && date <= to && date <= end && !covered(date);
    });
    if (extra.length > 0) {
      allocations.push(computeAllocation(
        {
          dateRange: { from, to },
          stats: { estimatedHours: 0 } as WeeklyReportData["stats"],
          pullRequests: [],
          commitMessages: [],
        },
        config,
        extra,
      ));
    }
    periods.push({
      id: from,
      label: formatShortWeekTitle(from, to),
      from,
      to,
      days: inWeek.length,
      allocation: mergeAllocations(allocations),
    });
  }
  const totals = new Map<string, number>();
  for (const period of periods) {
    for (const bucket of period.allocation.initiatives) {
      totals.set(bucket.initiative, (totals.get(bucket.initiative) ?? 0) + bucket.hours);
    }
  }
  const initiatives = [...totals.keys()].sort((a, b) => totals.get(b)! - totals.get(a)! || a.localeCompare(b));
  return { initiatives, periods };
};
