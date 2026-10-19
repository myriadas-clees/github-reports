// Planning-range calibration from the engineer's own merged work history.
// Output is small, JSON-serializable data (no PR titles, urls or secrets) that powers
// the static "How long would it take?" calculator on the index page.

import { classifyInitiative, classifyWorkType, prWeight } from "./allocation.js";
import type { AllocationConfig, PullRequest, WeeklyReportData } from "../types.js";

export const ESTIMATE_CALIBRATION_VERSION = "1.0";
export const THIN_SAMPLE = 5;
export const MIN_SAMPLE_SIZE = 5;
export const MIN_INITIATIVE_ACTIVE_DAYS = 8;
const HOURS_PER_DAY = 8;

export type EstimateKind = "bug-fix" | "change" | "feature";
export type EstimateSize = "S" | "M" | "L" | "XL";
export const ESTIMATE_KINDS: EstimateKind[] = ["bug-fix", "change", "feature"];
export const ESTIMATE_SIZES: EstimateSize[] = ["S", "M", "L", "XL"];

export type Percentiles = { p50: number; p90: number };

export type EstimateGroup = {
  kind: EstimateKind;
  size: EstimateSize;
  /** Merged PRs in exactly this kind x size band. */
  n: number;
  /** True when n < 5: the stats below were pooled from a wider set. */
  thin: boolean;
  /** How the stats were pooled when thin. */
  pooled?: "adjacent" | "kind" | "all";
  /** Sample size behind the stats below. */
  poolN: number;
  /** Working days from first activity to merge. */
  turnaroundDays: Percentiles;
  /** Days with commits on the PR. */
  activeDays: Percentiles;
  /** Equivalent effort for a typical engineer, in engineer-days. */
  effortDays: Percentiles;
};

export type InitiativeStat = {
  name: string;
  activeDays: number;
  spanWeeks: number;
  effortDays: number;
  mergedPrs: number;
};

export type EstimateCalibration = {
  version: string;
  asOf: string;
  /** First month of history used, "YYYY-MM". */
  since: string;
  /** Merged PRs used. */
  sampleSize: number;
  groups: EstimateGroup[];
  apps: {
    initiatives: InitiativeStat[];
    activeDays: Percentiles;
    spanWeeks: Percentiles;
    effortDays: Percentiles;
  };
};

/** Nearest-rank percentile on an unsorted list. */
export const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1]!;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
const pct = (values: number[]): Percentiles => ({
  p50: round2(percentile(values, 50)),
  p90: round2(percentile(values, 90)),
});

export const sizeBand = (files: number): EstimateSize =>
  files <= 3 ? "S" : files <= 10 ? "M" : files <= 30 ? "L" : "XL";

export const estimateKind = (title: string, labels: string[]): EstimateKind => {
  const type = classifyWorkType(title, labels);
  if (type === "quality") return "bug-fix";
  if (type === "new-capability") return "feature";
  return "change";
};

const dayMs = 86_400_000;
const toUtcDay = (iso: string): number => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / dayMs);
};

/** Mon-Fri days from `from` to `to`, inclusive, minimum 1. */
export const workingDaysBetween = (from: string, to: string): number => {
  const a = toUtcDay(from);
  const b = toUtcDay(to);
  let count = 0;
  for (let d = a; d <= b; d++) {
    const dow = new Date(d * dayMs).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return Math.max(1, count);
};

type PrAcc = {
  title: string;
  labels: string[];
  repository: string;
  state: PullRequest["state"];
  mergedAt: string | null;
  createdAt: string;
  files: Set<string>;
  changedFiles: number;
  hours: number;
  days: Set<string>;
  latestDay: string;
  mergeDay: string | null;
};

/**
 * True when `day` (a local report-day key) is the day this snapshot saw the merge. The UTC
 * merge date differs from the local day by at most one (timezone skew); a merged snapshot first
 * seen later than that (no report on the merge day) must not stretch turnaround.
 */
const observedMergeDay = (pr: PullRequest, day: string): boolean =>
  pr.state === "merged" && (!pr.mergedAt || Math.abs(toUtcDay(pr.mergedAt.slice(0, 10)) - toUtcDay(day)) <= 1);

// Keep this predicate aligned with prWeight in allocation.ts: either churn direction is work.
const hasWork = (pr: PullRequest): boolean =>
  (pr.workCommits?.length ?? 0) > 0 || (pr.workAdditions ?? 0) + (pr.workDeletions ?? 0) > 0;

export const buildEstimateCalibration = (
  dailyReports: Map<string, WeeklyReportData>,
  config: AllocationConfig,
): EstimateCalibration => {
  const days = [...dailyReports.keys()].sort();
  const prs = new Map<string, PrAcc>();
  for (const day of days) {
    const report = dailyReports.get(day)!;
    const reportUrls = new Set((report.pullRequests ?? []).map((pr) => pr.url));
    const daily = new Map<string, PullRequest>();
    for (const pr of [...(report.pullRequests ?? []), ...(report.prsInProgress ?? [])]) {
      const previous = daily.get(pr.url);
      if (!previous) {
        daily.set(pr.url, pr);
      } else {
        const work = hasWork(pr) && !hasWork(previous) ? pr : previous;
        // Match computeAllocation: pullRequests is the as-of-window state. A terminal copy
        // only in prsInProgress is current state reached after this day, so normalize it open.
        const asOfWindow = reportUrls.has(pr.url)
          ? (report.pullRequests ?? []).find((candidate) => candidate.url === pr.url)!
          : { ...pr, state: "open" as const, mergedAt: null };
        daily.set(pr.url, {
          ...work,
          state: asOfWindow.state,
          mergedAt: asOfWindow.mergedAt,
          changedFiles: Math.max(pr.changedFiles ?? 0, previous.changedFiles ?? 0),
        });
      }
    }
    // A single prsInProgress-only snapshot also represents the current state, not this day's.
    for (const [url, pr] of daily) {
      if (!reportUrls.has(url) && pr.state !== "open") {
        daily.set(url, { ...pr, state: "open", mergedAt: null });
      }
    }
    for (const pr of daily.values()) {
      let acc = prs.get(pr.url);
      if (!hasWork(pr)) {
        if (acc) {
          // A later snapshot can carry the merge transition without new authored work.
          acc.title = pr.title;
          acc.labels = pr.labels ?? acc.labels;
          acc.state = pr.state;
          acc.changedFiles = pr.changedFiles ?? acc.changedFiles;
          if (pr.mergedAt) acc.mergedAt = pr.mergedAt;
          if (!acc.mergeDay && observedMergeDay(pr, day)) acc.mergeDay = day;
          acc.latestDay = day;
        }
        continue;
      }
      if (!acc) {
        acc = {
          title: pr.title, labels: pr.labels ?? [], repository: pr.repository, state: pr.state, mergedAt: null,
          createdAt: pr.createdAt, files: new Set(), changedFiles: pr.changedFiles ?? 0, hours: 0,
          days: new Set(), latestDay: "", mergeDay: observedMergeDay(pr, day) ? day : null,
        };
        prs.set(pr.url, acc);
      }
      acc.hours += prWeight(pr);
      acc.days.add(day);
      for (const f of pr.workFiles ?? []) acc.files.add(f);
      // Days are iterated ascending, so the last write is the latest state.
      acc.title = pr.title;
      acc.labels = pr.labels ?? acc.labels;
      acc.state = pr.state;
      acc.changedFiles = pr.changedFiles ?? acc.changedFiles;
      if (pr.mergedAt) acc.mergedAt = pr.mergedAt;
      if (!acc.mergeDay && observedMergeDay(pr, day)) acc.mergeDay = day;
      acc.latestDay = day;
    }
  }

  type Merged = { kind: EstimateKind; size: EstimateSize; turnaround: number; active: number; effort: number };
  const merged: Merged[] = [];
  for (const acc of prs.values()) {
    if (acc.state !== "merged" || !acc.mergedAt) continue;
    const workDays = [...acc.days].sort();
    const first = workDays[0] ?? acc.createdAt?.slice(0, 10);
    if (!first) continue;
    const files = acc.files.size > 0 ? acc.files.size : acc.changedFiles;
    merged.push({
      kind: estimateKind(acc.title, acc.labels),
      size: sizeBand(files),
      turnaround: workingDaysBetween(first, acc.mergeDay ?? acc.mergedAt.slice(0, 10)),
      active: acc.days.size,
      effort: acc.hours / HOURS_PER_DAY,
    });
  }

  const stats = (set: Merged[]) => ({
    turnaroundDays: pct(set.map((m) => m.turnaround)),
    activeDays: pct(set.map((m) => m.active)),
    effortDays: pct(set.map((m) => m.effort)),
  });

  const groups: EstimateGroup[] = [];
  for (const kind of ESTIMATE_KINDS) {
    for (const [i, size] of ESTIMATE_SIZES.entries()) {
      const own = merged.filter((m) => m.kind === kind && m.size === size);
      const base = { kind, size, n: own.length, thin: own.length < THIN_SAMPLE };
      let pool = own;
      let pooled: EstimateGroup["pooled"];
      if (base.thin) {
        const near = new Set([ESTIMATE_SIZES[i - 1], size, ESTIMATE_SIZES[i + 1]]);
        pool = merged.filter((m) => m.kind === kind && near.has(m.size));
        pooled = "adjacent";
        if (pool.length < THIN_SAMPLE) { pool = merged.filter((m) => m.kind === kind); pooled = "kind"; }
        if (pool.length < THIN_SAMPLE) { pool = merged; pooled = "all"; }
      }
      groups.push({ ...base, ...(pooled ? { pooled } : {}), poolN: pool.length, ...stats(pool) });
    }
  }

  // Initiative (app / product) history across all PRs with work, merged or not.
  type InitAcc = { days: Set<string>; hours: number; merged: number };
  const inits = new Map<string, InitAcc>();
  for (const acc of prs.values()) {
    const name = classifyInitiative({ title: acc.title, labels: acc.labels, repository: acc.repository }, config);
    const i = inits.get(name) ?? { days: new Set<string>(), hours: 0, merged: 0 };
    acc.days.forEach((d) => i.days.add(d));
    i.hours += acc.hours;
    if (acc.state === "merged") i.merged++;
    inits.set(name, i);
  }
  const initiatives: InitiativeStat[] = [...inits.entries()]
    .filter(([, i]) => i.days.size >= MIN_INITIATIVE_ACTIVE_DAYS)
    .map(([name, i]) => {
      const sorted = [...i.days].sort();
      const span = (toUtcDay(sorted.at(-1)!) - toUtcDay(sorted[0]!) + 1) / 7;
      return {
        name,
        activeDays: i.days.size,
        spanWeeks: Math.max(1, Math.round(span)),
        effortDays: round2(i.hours / HOURS_PER_DAY),
        mergedPrs: i.merged,
      };
    })
    .sort((a, b) => b.activeDays - a.activeDays || a.name.localeCompare(b.name));

  return {
    version: ESTIMATE_CALIBRATION_VERSION,
    asOf: days.at(-1) ?? "",
    since: (days[0] ?? "").slice(0, 7),
    sampleSize: merged.length,
    groups,
    apps: {
      initiatives,
      activeDays: pct(initiatives.map((i) => i.activeDays)),
      spanWeeks: pct(initiatives.map((i) => i.spanWeeks)),
      effortDays: pct(initiatives.map((i) => i.effortDays)),
    },
  };
};
