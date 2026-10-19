import { describe, it, expect } from "vitest";
import {
  buildEstimateCalibration, percentile, sizeBand, workingDaysBetween, estimateKind,
} from "./estimate-calibration.js";
import { DEFAULT_ALLOCATION_CONFIG } from "./allocation.js";
import type { PullRequest, WeeklyReportData } from "../types.js";

const commit = (d: string) => ({ sha: "a", message: "m", url: "u", authoredAt: `${d}T10:00:00Z` });
const pr = (n: number, title: string, over: Partial<PullRequest> = {}): PullRequest => ({
  title, body: null, url: `https://github.com/o/r/pull/${n}`, repository: "o/r", state: "open", labels: [],
  additions: 40, deletions: 5, changedFiles: 2, author: "me", createdAt: "2026-09-01T09:00:00Z", mergedAt: null,
  workCommits: [commit("2026-09-01")], workAdditions: 40, workDeletions: 5, workFiles: ["a.ts", "b.ts"],
  ...over,
});
const report = (prs: PullRequest[]): WeeklyReportData =>
  ({ pullRequests: prs, prsInProgress: [] }) as unknown as WeeklyReportData;

describe("helpers", () => {
  it("computes nearest-rank percentiles", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([], 50)).toBe(0);
  });
  it("bands file counts", () => {
    expect([1, 3, 4, 10, 11, 30, 31].map(sizeBand)).toEqual(["S", "S", "M", "M", "L", "L", "XL"]);
  });
  it("counts working days inclusively, min 1", () => {
    expect(workingDaysBetween("2026-09-04", "2026-09-08")).toBe(3); // Fri, Mon, Tue
    expect(workingDaysBetween("2026-09-05", "2026-09-06")).toBe(1); // weekend
    expect(workingDaysBetween("2026-09-07", "2026-09-07")).toBe(1);
  });
  it("maps work types to kinds", () => {
    expect(estimateKind("fix: crash", [])).toBe("bug-fix");
    expect(estimateKind("docs: readme", [])).toBe("change");
    expect(estimateKind("feat: add tiers", [])).toBe("feature");
  });
});

describe("buildEstimateCalibration", () => {
  const merged = (n: number, title: string, mergedAt: string, extra: Partial<PullRequest> = {}) =>
    pr(n, title, { state: "merged", mergedAt, ...extra });

  it("dedupes a PR across days and measures turnaround from first activity", () => {
    const days = new Map<string, WeeklyReportData>([
      ["2026-09-01", report([pr(1, "feat: add widget")])],
      ["2026-09-02", report([pr(1, "feat: add widget", { workCommits: [commit("2026-09-02")], workFiles: ["c.ts"] })])],
      ["2026-09-03", report([merged(1, "feat: add widget", "2026-09-03T12:00:00Z", { workCommits: [commit("2026-09-03")] })])],
    ]);
    const cal = buildEstimateCalibration(days, DEFAULT_ALLOCATION_CONFIG);
    expect(cal.sampleSize).toBe(1);
    expect(cal.asOf).toBe("2026-09-03");
    expect(cal.since).toBe("2026-09");
    const g = cal.groups.find((x) => x.kind === "feature" && x.size === "S")!;
    // files: a, b, c -> S; Tue..Thu = 3 working days; 3 active days
    expect(g.n).toBe(1);
    expect(g.turnaroundDays.p50).toBe(3);
    expect(g.activeDays.p50).toBe(3);
    expect(g.effortDays.p50).toBeGreaterThan(0);
  });

  it("counts a PR present in both daily lists once and keeps its merged state", () => {
    const work = pr(30, "feat: duplicate daily snapshot");
    const mergedSnapshot = merged(30, work.title, "2026-09-01T12:00:00Z", { workCommits: [], workAdditions: 0, workFiles: [] });
    const duplicate = report([mergedSnapshot]);
    duplicate.prsInProgress = [work];
    const single = buildEstimateCalibration(new Map([["2026-09-01", report([merged(30, work.title, "2026-09-01T12:00:00Z")])]]), DEFAULT_ALLOCATION_CONFIG);
    const deduped = buildEstimateCalibration(new Map([["2026-09-01", duplicate]]), DEFAULT_ALLOCATION_CONFIG);
    const group = deduped.groups.find((x) => x.kind === "feature" && x.size === "S")!;
    expect(group.effortDays).toEqual(single.groups.find((x) => x.kind === "feature" && x.size === "S")!.effortDays);
    expect(group.activeDays.p50).toBe(1);
    expect(deduped.sampleSize).toBe(1);
  });

  it("does not double-count effort for a work-bearing PR listed in both daily lists", () => {
    const opened = merged(31, "feat: opened and worked today", "2026-09-01T12:00:00Z");
    const both = report([opened]);
    both.prsInProgress = [opened];
    const once = buildEstimateCalibration(new Map([["2026-09-01", report([opened])]]), DEFAULT_ALLOCATION_CONFIG);
    const twice = buildEstimateCalibration(new Map([["2026-09-01", both]]), DEFAULT_ALLOCATION_CONFIG);
    const effort = (c: typeof once) => c.groups.find((x) => x.kind === "feature" && x.size === "S")!.effortDays;
    expect(effort(twice)).toEqual(effort(once));
    expect(twice.sampleSize).toBe(1);
  });

  it("starts turnaround at first work even when the PR was created earlier", () => {
    const cal = buildEstimateCalibration(new Map([["2026-08-17", report([
      merged(20, "feat: delayed work", "2026-08-19T12:00:00Z", {
        createdAt: "2026-08-03T09:00:00Z", workCommits: [commit("2026-08-17")],
      }),
    ])]]), DEFAULT_ALLOCATION_CONFIG);
    expect(cal.groups.find((x) => x.kind === "feature" && x.size === "S")!.turnaroundDays.p50).toBe(3);
  });

  it("uses the report day for a merge observed after UTC midnight", () => {
    const cal = buildEstimateCalibration(new Map([["2026-09-01", report([
      merged(21, "feat: late local merge", "2026-09-02T02:30:00Z"),
    ])]]), DEFAULT_ALLOCATION_CONFIG);
    expect(cal.groups.find((x) => x.kind === "feature" && x.size === "S")!.turnaroundDays.p50).toBe(1);
  });

  it("does not stretch turnaround when the merge is first seen in a later report", () => {
    // Worked Fri Sep 4, merged Sat Sep 5 (no report that day), first seen merged in Mon Sep 7's report.
    const cal = buildEstimateCalibration(new Map<string, WeeklyReportData>([
      ["2026-09-04", report([pr(22, "feat: weekend merge")])],
      ["2026-09-07", report([merged(22, "feat: weekend merge", "2026-09-05T15:00:00Z", { workCommits: [], workAdditions: 0, workFiles: [] })])],
    ]), DEFAULT_ALLOCATION_CONFIG);
    expect(cal.groups.find((x) => x.kind === "feature" && x.size === "S")!.turnaroundDays.p50).toBe(1);
  });

  it("keeps merge-only snapshots for PRs with prior work, but ignores never-worked PRs", () => {
    const work = pr(10, "feat: merge later");
    const mergeOnly = merged(10, "feat: merge later", "2026-09-03T12:00:00Z", {
      workCommits: [], workAdditions: 0, workFiles: [], changedFiles: 2,
    });
    const neverWorked = merged(11, "feat: idle forever", "2026-09-03T12:00:00Z", {
      workCommits: [], workAdditions: 0, workFiles: [],
    });
    const days = new Map<string, WeeklyReportData>([
      ["2026-09-01", report([work])],
      ["2026-09-03", report([mergeOnly, neverWorked])],
    ]);
    const cal = buildEstimateCalibration(days, DEFAULT_ALLOCATION_CONFIG);
    expect(cal.sampleSize).toBe(1);
    const g = cal.groups.find((x) => x.kind === "feature" && x.size === "S")!;
    expect(g.n).toBe(1);
    expect(g.turnaroundDays.p50).toBe(3);
    expect(g.activeDays.p50).toBe(1);
    expect(g.effortDays.p50).toBeGreaterThan(0);
  });

  it("ignores unmerged PRs and PRs without work, and flags thin groups with pooling", () => {
    const days = new Map<string, WeeklyReportData>();
    const prs: PullRequest[] = [pr(100, "feat: open one")];
    for (let i = 0; i < 6; i++) prs.push(merged(i, `fix: bug ${i}`, "2026-09-02T12:00:00Z"));
    prs.push(merged(50, "feat: idle", "2026-09-02T12:00:00Z", { workCommits: [], workAdditions: 0 }));
    days.set("2026-09-01", report(prs));
    const cal = buildEstimateCalibration(days, DEFAULT_ALLOCATION_CONFIG);
    expect(cal.sampleSize).toBe(6);
    const bugS = cal.groups.find((g) => g.kind === "bug-fix" && g.size === "S")!;
    expect(bugS).toMatchObject({ n: 6, thin: false, poolN: 6 });
    expect(bugS.pooled).toBeUndefined();
    const bugM = cal.groups.find((g) => g.kind === "bug-fix" && g.size === "M")!;
    expect(bugM).toMatchObject({ n: 0, thin: true, pooled: "adjacent", poolN: 6 });
    const feat = cal.groups.find((g) => g.kind === "feature" && g.size === "S")!;
    expect(feat).toMatchObject({ thin: true, pooled: "all", poolN: 6 });
  });

  it("builds initiative stats for initiatives with at least 8 active days", () => {
    const days = new Map<string, WeeklyReportData>();
    for (let d = 1; d <= 9; d++) {
      const day = `2026-09-${String(d).padStart(2, "0")}`;
      days.set(day, report([
        pr(1, "feat: hub thing", { labels: ["app: hub"], workCommits: [commit(day)] }),
        ...(d === 1 ? [pr(2, "feat: tiny", { labels: ["app: pricing"] })] : []),
      ]));
    }
    const config = { ...DEFAULT_ALLOCATION_CONFIG, initiatives: { "app: hub": "Hub", "app: pricing": "Pricing" } };
    const cal = buildEstimateCalibration(days, config);
    expect(cal.apps.initiatives).toHaveLength(1);
    expect(cal.apps.initiatives[0]).toMatchObject({ name: "Hub", activeDays: 9, spanWeeks: 1, mergedPrs: 0 });
    expect(cal.apps.activeDays.p50).toBe(9);
    expect(JSON.stringify(cal)).not.toContain("github.com");
  });
});
