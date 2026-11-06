// Effort allocation: split estimated hours into stakeholder initiatives and work types.
// Hours are an estimate distributed by delivered scope; self-reported time is added unscaled.

import { buildCommitUnits, estimateCommitUnitHours, estimateDailyPrWorkHours, estimatePrHours, groupCommitUnitIndexes } from "./estimate-hours.js";
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
  "no-activity": "No GitHub activity",
};

const ALLOCATION_NOTE =
  "Work delivered is a modeled estimate of the manual engineering effort for one engineer to deliver the same changes without AI assistance, split across initiatives by delivered scope. It is not actual hours worked or measured time saved.";

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

/** Stable sort by effortHours desc, items without effort last. */
const byEffortDesc = (items: AllocationItem[]): AllocationItem[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.effortHours ?? -1) - (a.item.effortHours ?? -1) || a.index - b.index)
    .map(({ item }) => item);
const REVIEW_HOURS = 0.75;
const REVIEW_COMMENT_HOURS = 0.25;
const FALLBACK_INITIATIVE = "General engineering";
export const NO_ACTIVITY_INITIATIVE = "No GitHub activity (minimum day)";
export const TEST_FILE_RE = /(^|\/)(__tests__|tests?)(\/|$)|\.(test|spec)\.[^/]+$/i;
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

/** Resolve initiative by label prefix, exact label, scope, repo, title name, default, then repo name. */
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
  const byRepo = lookup(config.initiatives, `repo:${input.repository}`);
  if (byRepo) return byRepo;
  // Unmapped repositories may still name the product ("Fix Northstar brief retries").
  const named = [...new Set(Object.values(config.initiatives))]
    .sort((a, b) => b.length - a.length)
    .find((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(input.title));
  if (named) return named;
  if (config.defaultInitiative) return config.defaultInitiative;
  return humanize(input.repository.split("/").pop() ?? input.repository) || FALLBACK_INITIATIVE;
};

type Section = "shipped" | "inProgress" | "other";
type Entry = { initiative: string; workType: WorkType; weight: number };
type Placed = { initiative: string; section: Section; item: AllocationItem };
type Acc = { hours: number; byWorkType: Partial<Record<WorkType, number>>; shipped: AllocationItem[]; inProgress: AllocationItem[]; other: AllocationItem[] };

const emptyAcc = (): Acc => ({ hours: 0, byWorkType: {}, shipped: [], inProgress: [], other: [] });

// Keep full precision while daily allocations are merged in memory. Serialized
// allocations still use their rounded public values as a fallback.
const allocationPrecision = new WeakMap<Allocation, { accs: Map<string, Acc>; prHours: WeakMap<AllocationItem, number> }>();

const finalize = (accs: Map<string, Acc>, manualHours: number, aiFindingsAddressed = 0): Allocation => {
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
    ...(aiFindingsAddressed > 0 ? { aiFindingsAddressed } : {}),
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

export const prWeight = (pr: PullRequest): number => {
  const hasDailyWork = (pr.workCommits?.length ?? 0) > 0 || (pr.workAdditions ?? 0) + (pr.workDeletions ?? 0) > 0;
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
    "dateRange" | "stats" | "hoursEstimate" | "pullRequests" | "prsInProgress" | "prsWorkedOnClosed" | "commitMessages" | "codeReviews" | "reviewComments"
  > & Partial<Pick<WeeklyReportData, "aiReviews">>,
  config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG,
  manualTime: ManualTimeEntry[] = [],
): Allocation => {
  const target = Math.max(0, data.hoursEstimate?.hours ?? data.stats?.estimatedHours ?? 0);
  const entries: Entry[] = [];
  const placed: Placed[] = [];
  const prEffort: { item: AllocationItem; weight: number; labels: string[] }[] = [];
  const precisePrHours = new WeakMap<AllocationItem, number>();

  const prs = new Map<string, PullRequest>();
  for (const pr of [...(data.pullRequests ?? []), ...(data.prsInProgress ?? []), ...(data.prsWorkedOnClosed ?? [])]) {
    if (!prs.has(pr.url)) prs.set(pr.url, pr);
  }
  const workShas = new Set<string>();
  // Mirror the hours estimator: it counts PRs with the reporting user's work in the window
  // plus PRs opened/merged in it (`pullRequests`). An in-progress PR listed only because
  // someone else updated it stays visible but must not pull the day's hours toward it.
  const reportUrls = new Set([...(data.pullRequests ?? []), ...(data.prsWorkedOnClosed ?? [])].map((pr) => pr.url));
  const countsTowardEstimate = (pr: PullRequest): boolean =>
    reportUrls.has(pr.url) || (pr.workCommits?.length ?? 0) > 0 || (pr.workAdditions ?? 0) + (pr.workDeletions ?? 0) > 0;
  for (const pr of prs.values()) {
    // PRs merged/closed inside the window are in `pullRequests` with their state as of the
    // window (the fetcher classifies by the report timezone). A merged/closed snapshot that is
    // only in `prsInProgress` is the PR's current state, reached after this window (e.g. a
    // backfilled day), so on this day it was still open. No timestamp math: dateRange is a
    // local date and a UTC comparison would misfile evening merges behind UTC.
    const state = pr.state !== "open" && !reportUrls.has(pr.url) ? "open" : pr.state;
    const labels = pr.labels ?? [];
    entries.push({
      initiative: classifyInitiative({ title: pr.title, labels, repository: pr.repository }, config),
      workType: classifyWorkType(pr.title, labels),
      weight: countsTowardEstimate(pr) ? prWeight(pr) : 0,
    });
    const initiative = entries[entries.length - 1].initiative;
    const section: Section = state === "merged" ? "shipped" : state === "open" ? "inProgress" : "other";
    const item: AllocationItem = {
      kind: "pr",
      title: pr.title,
      url: pr.url,
      repository: pr.repository,
      state,
      ...(labels.length > 0 ? { labels: [...labels] } : {}),
      ...(pr.workFiles?.length ? { files: [...pr.workFiles] } : {}),
    };
    placed.push({ initiative, section, item });
    prEffort.push({ item, weight: entries[entries.length - 1].weight, labels });
    for (const commit of pr.workCommits ?? []) workShas.add(commit.sha);
  }

  const prByRepoNumber = (repository: string, prNumber: number): PullRequest | undefined =>
    [...prs.values()].find((pr) => pr.repository === repository && pr.url.endsWith(`/pull/${prNumber}`));
  const reviewInitiative = (repository: string, title: string, url: string, labels?: string[]): string =>
    classifyInitiative({ title, labels: prs.get(url)?.labels ?? labels ?? [], repository }, config);

  const commentMetadata = new Map<string, NonNullable<WeeklyReportData["reviewComments"]>[number]>();
  for (const comment of data.reviewComments ?? []) {
    const key = `${comment.repository}#${comment.prNumber}`;
    if (!commentMetadata.has(key) && (comment.prTitle != null || comment.prLabels != null)) commentMetadata.set(key, comment);
  }
  const reviewInitiatives = new Map<string, string>();
  const reviewedItems = new Set<string>();
  for (const review of data.codeReviews ?? []) {
    const key = `${review.repository}#${review.prNumber}`;
    const initiative = reviewInitiatives.get(key) ?? reviewInitiative(review.repository, review.prTitle, review.prUrl, commentMetadata.get(key)?.prLabels);
    entries.push({ initiative, workType: "team-support", weight: REVIEW_HOURS });
    reviewInitiatives.set(key, initiative);
    const itemKey = `${initiative}|${review.prUrl}`;
    if (!reviewedItems.has(itemKey)) {
      reviewedItems.add(itemKey);
      placed.push({
        initiative,
        section: "other",
        item: { kind: "review", title: `Reviewed: ${review.prTitle}`, url: review.prUrl, repository: review.repository },
      });
    }
  }
  for (const comment of data.reviewComments ?? []) {
    const known = reviewInitiatives.get(`${comment.repository}#${comment.prNumber}`);
    const pr = prByRepoNumber(comment.repository, comment.prNumber);
    const initiative = known !== undefined
      ? known
      : comment.prTitle != null || comment.prLabels != null
      ? classifyInitiative({ title: comment.prTitle ?? pr?.title ?? "", labels: comment.prLabels ?? pr?.labels, repository: comment.repository }, config)
      : pr
      ? reviewInitiative(comment.repository, pr.title, pr.url)
      : classifyInitiative({ title: "", labels: [], repository: comment.repository }, config);
    entries.push({ initiative, workType: "team-support", weight: REVIEW_COMMENT_HOURS });
  }

  type Group = { initiative: string; workType: WorkType; count: number; repos: Set<string> };
  type DirectCommit = { repo: string; message: string; additions?: number; deletions?: number; filesChanged?: number; key: string };
  const groups = new Map<string, Group>();
  const directCommits: DirectCommit[] = [];
  for (const repo of data.commitMessages ?? []) {
    const commits = repo.commits?.length
      ? repo.commits
      : (repo.messages ?? []).map((message) => ({ sha: "", message, additions: undefined, deletions: undefined, filesChanged: undefined }));
    for (const commit of commits) {
      if (commit.sha && workShas.has(commit.sha)) continue;
      const message = (commit.message ?? "").split("\n")[0];
      const initiative = classifyInitiative({ title: message, labels: [], repository: repo.repo }, config);
      const workType = classifyWorkType(message);
      const key = `${initiative}|${workType}`;
      const group = groups.get(key) ?? { initiative, workType, count: 0, repos: new Set() };
      group.count += 1;
      group.repos.add(repo.repo);
      groups.set(key, group);
      directCommits.push({
        repo: repo.repo,
        message,
        additions: commit.additions,
        deletions: commit.deletions,
        filesChanged: commit.filesChanged,
        key,
      });
    }
  }
  // Weight direct commits with the same work units the hours estimate uses
  // (repo + scope), then split each unit's hours across the initiative|workType
  // groups of its member commits by commit count.
  const groupWeights = new Map<string, number>();
  for (const members of groupCommitUnitIndexes(directCommits)) {
    const [unit] = buildCommitUnits(members.map((index) => directCommits[index]));
    const hours = estimateCommitUnitHours(unit);
    for (const index of members) {
      const key = directCommits[index].key;
      groupWeights.set(key, (groupWeights.get(key) ?? 0) + hours / members.length);
    }
  }
  const commitCounts = new Map<string, { count: number; repos: Set<string> }>();
  for (const [key, group] of groups) {
    entries.push({
      initiative: group.initiative,
      workType: group.workType,
      weight: groupWeights.get(key) ?? 0,
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
    // Session-only time is real uncategorized activity. Without session time, a positive
    // target can be only the daily minimum (including zero-weight PR snapshots).
    if ((data.hoursEstimate?.sessionHours ?? 0) > 0) {
      addHours(accs, config.defaultInitiative ?? FALLBACK_INITIATIVE, "maintenance", target);
    } else {
      addHours(accs, NO_ACTIVITY_INITIATIVE, "no-activity", target);
    }
  }
  if (weightSum > 0) {
    for (const { item, weight, labels } of prEffort) {
      const hours = (weight / weightSum) * target;
      precisePrHours.set(item, hours);
      item.effortHours = round1(hours);
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
  const fixed = data.aiReviews?.fixed ?? 0;
  const allocation = finalize(accs, manualHours, fixed > 0 ? fixed : 0);
  allocationPrecision.set(allocation, { accs, prHours: precisePrHours });
  return allocation;
};

const itemKey = (item: AllocationItem): string => `${item.kind}|${item.url ?? item.title}`;

/**
 * Fold another appearance into `target`: effort sums, files union, and PR metadata stays current.
 */
const absorbPrItem = (target: AllocationItem, other: AllocationItem, otherIsLatest: boolean): void => {
  if (other.effortHours != null) target.effortHours = round1((target.effortHours ?? 0) + other.effortHours);
  if (target.kind !== "pr") return;
  if (other.files?.length) target.files = [...new Set([...(target.files ?? []), ...other.files])];
  if (otherIsLatest) {
    target.title = other.title;
    if (other.labels) target.labels = [...other.labels];
    else delete target.labels;
  }
  const derived = deriveImpact(target.effortHours, target.labels ?? []);
  if (derived) target.impact = derived;
  else delete target.impact;
};

const moveItemEffort = (from: Acc, to: Acc, contributions: Partial<Record<WorkType, number>>): void => {
  for (const [type, hours] of Object.entries(contributions) as [WorkType, number][]) {
    from.hours -= hours;
    from.byWorkType[type] = (from.byWorkType[type] ?? 0) - hours;
    to.hours += hours;
    to.byWorkType[type] = (to.byWorkType[type] ?? 0) + hours;
  }
};

/** Merge several allocations (e.g. days in a week) into one. */
export const mergeAllocations = (allocations: Allocation[]): Allocation => {
  const accs = new Map<string, Acc>();
  const seen = new Map<string, AllocationItem>();
  const commitItems = new Map<string, { item: AllocationItem; count: number }>();
  const appearanceIndex = new WeakMap<AllocationItem, number>();
  const contributions = new WeakMap<AllocationItem, Partial<Record<WorkType, number>>>();
  let manualHours = 0;
  let aiFindingsAddressed = 0;
  for (const [allocationIndex, allocation] of allocations.entries()) {
    const precision = allocationPrecision.get(allocation);
    manualHours += allocation.manualHours;
    aiFindingsAddressed += allocation.aiFindingsAddressed ?? 0;
    for (const bucket of allocation.initiatives) {
      const preciseBucket = precision?.accs.get(bucket.initiative);
      // Item and bucket hours are rounded independently. Reconcile all PRs in this
      // daily bucket together so moving several of them cannot spend the same hours.
      const prItems = [...bucket.shipped, ...bucket.inProgress, ...bucket.other].filter((item) => item.kind === "pr");
      const prTypeHours: Partial<Record<WorkType, number>> = {};
      for (const item of prItems) {
        const type = classifyWorkType(item.title, item.labels);
        prTypeHours[type] = (prTypeHours[type] ?? 0) + (precision?.prHours.get(item) ?? item.effortHours ?? 0);
      }
      const prContributions = new Map(prItems.map((item) => {
        const type = classifyWorkType(item.title, item.labels);
        const sum = prTypeHours[type] ?? 0;
        const scale = sum > 0 ? Math.min(1, ((preciseBucket?.byWorkType ?? bucket.byWorkType)[type] ?? 0) / sum) : 0;
        return [item, (precision?.prHours.get(item) ?? item.effortHours ?? 0) * scale] as const;
      }));
      const prHours = [...prContributions.values()].reduce((sum, hours) => sum + hours, 0);
      const bucketScale = prHours > 0 ? Math.min(1, (preciseBucket?.hours ?? bucket.hours) / prHours) : 0;
      const acc = accs.get(bucket.initiative) ?? emptyAcc();
      acc.hours += preciseBucket?.hours ?? bucket.hours;
      for (const [type, hours] of Object.entries(preciseBucket?.byWorkType ?? bucket.byWorkType) as [WorkType, number][]) {
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
            absorbPrItem(prior, item, true);
            if (item.kind === "pr") {
              const type = classifyWorkType(item.title, item.labels);
              const amounts = contributions.get(prior)!;
              amounts[type] = (amounts[type] ?? 0) + prContributions.get(item)! * bucketScale;
              appearanceIndex.set(prior, allocationIndex);
            }
            continue;
          }
          const copy = { ...item, ...(item.files ? { files: [...item.files] } : {}), ...(item.labels ? { labels: [...item.labels] } : {}) };
          seen.set(key, copy);
          acc[section].push(copy);
          if (item.kind === "pr") {
            contributions.set(copy, { [classifyWorkType(item.title, item.labels)]: prContributions.get(item)! * bucketScale });
            appearanceIndex.set(copy, allocationIndex);
          }
        }
      }
    }
  }
  for (const { item, count } of commitItems.values()) {
    item.title = `${count} direct commit${count === 1 ? "" : "s"}`;
  }
  // Shipped wins; otherwise choose the latest open or closed appearance across initiatives.
  const shippedByUrl = new Map<string, { initiative: string; item: AllocationItem }>();
  for (const [initiative, acc] of accs) for (const item of acc.shipped) {
    if (item.url && !shippedByUrl.has(item.url)) shippedByUrl.set(item.url, { initiative, item });
  }
  const appearancesByUrl = new Map<string, { initiative: string; section: "inProgress" | "other"; item: AllocationItem }[]>();
  for (const [initiative, acc] of accs) {
    for (const [section, items] of [["inProgress", acc.inProgress], ["other", acc.other]] as const) {
      for (const item of items) {
        if (!item.url || !(section === "inProgress" || (item.kind === "pr" && item.state === "closed"))) continue;
        const appearances = appearancesByUrl.get(item.url) ?? [];
        appearances.push({ initiative, section, item });
        appearancesByUrl.set(item.url, appearances);
      }
    }
  }
  for (const [url, appearances] of appearancesByUrl) {
    const shipped = shippedByUrl.get(url);
    const destination = shipped ?? appearances.reduce((latest, current) =>
      (appearanceIndex.get(current.item) ?? -1) > (appearanceIndex.get(latest.item) ?? -1) ? current : latest);
    for (const appearance of appearances) {
      if (appearance.item === destination.item) continue;
      const otherIsLatest = (appearanceIndex.get(appearance.item) ?? -1) > (appearanceIndex.get(destination.item) ?? -1);
      absorbPrItem(destination.item, appearance.item, otherIsLatest);
      if (otherIsLatest) appearanceIndex.set(destination.item, appearanceIndex.get(appearance.item)!);
      if (appearance.initiative !== destination.initiative) {
        moveItemEffort(accs.get(appearance.initiative)!, accs.get(destination.initiative)!, contributions.get(appearance.item)!);
      }
      const source = accs.get(appearance.initiative)!;
      source[appearance.section] = source[appearance.section].filter((item) => item !== appearance.item);
    }
  }
  for (const [initiative, acc] of accs) {
    const hasItems = acc.shipped.length + acc.inProgress.length + acc.other.length > 0;
    if (!hasItems && acc.hours <= 0.000001) accs.delete(initiative);
  }
  return finalize(accs, manualHours, aiFindingsAddressed);
};

const DAY_MS = 86_400_000;
const parseUtc = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const formatUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Thursday on or before a YYYY-MM-DD date (work week starts Thursday). */
export const weekStart = (date: string): string => {
  const ms = parseUtc(date);
  const back = (new Date(ms).getUTCDay() - 4 + 7) % 7;
  return formatUtc(ms - back * DAY_MS);
};

/** Wednesday that closes the Thu–Wed work week starting on `from` (YYYY-MM-DD). */
export const weekEnd = (from: string): string => formatUtc(parseUtc(from) + 6 * DAY_MS);

type TrendReport = { date: string; data: Parameters<typeof computeAllocation>[0] };

/** Reuse results only for this fixed snapshot, configuration and manual-time list. */
export const createAllocationTrendBatch = (
  reports: TrendReport[],
  config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG,
  manualTime: ManualTimeEntry[] = [],
) => {
  const daily = new Map<TrendReport, Allocation>();
  const periods = new Map<string, AllocationPeriod>();
  const byDate = new Map(reports.map((report) => [report.date, report]));
  const allocation = (report: TrendReport): Allocation => {
    let value = daily.get(report);
    if (!value) {
      value = computeAllocation(report.data, config, manualTime);
      daily.set(report, value);
    }
    return value;
  };
  return {
    allocationForDate: (date: string): Allocation | undefined => {
      const report = byDate.get(date);
      return report ? allocation(report) : undefined;
    },
    trend: (endDate: string): AllocationTrend => calculateAllocationTrend(reports, endDate, config, manualTime, allocation, periods),
  };
};

/** Group daily reports into Thu–Wed work weeks ending at `endDate`, last `config.trendWeeks` weeks. */
export const buildAllocationTrend = (
  reports: TrendReport[],
  endDate: string,
  config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG,
  manualTime: ManualTimeEntry[] = [],
): AllocationTrend => {
  return calculateAllocationTrend(reports, endDate, config, manualTime, (report) => computeAllocation(report.data, config, manualTime), new Map());
};

const calculateAllocationTrend = (
  reports: TrendReport[],
  endDate: string,
  config: AllocationConfig,
  manualTime: ManualTimeEntry[],
  allocationFor: (report: TrendReport) => Allocation,
  cache: Map<string, AllocationPeriod>,
): AllocationTrend => {
  const end = day(endDate);
  const lastStart = parseUtc(weekStart(end));
  const weeks = Math.max(1, Math.floor(config.trendWeeks));
  const periods: AllocationPeriod[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const startMs = lastStart - i * 7 * DAY_MS;
    const from = formatUtc(startMs);
    const to = formatUtc(startMs + 6 * DAY_MS);
    const key = `${from}/${end < to ? end : to}`;
    const cached = cache.get(key);
    if (cached) {
      periods.push(cached);
      continue;
    }
    const inWeek = reports.filter((report) => {
      const date = day(report.date);
      return date >= from && date <= to && date <= end;
    });
    const allocations = inWeek.map(allocationFor);
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
    const period = {
      id: from,
      label: formatShortWeekTitle(from, to),
      from,
      to,
      days: inWeek.length,
      allocation: mergeAllocations(allocations),
    };
    cache.set(key, period);
    periods.push(period);
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
