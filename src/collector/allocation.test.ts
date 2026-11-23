import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  ALLOCATION_VERSION,
  DEFAULT_ALLOCATION_CONFIG,
  MAJOR_IMPACT_HOURS,
  NOTABLE_IMPACT_HOURS,
  NO_ACTIVITY_INITIATIVE,
  deriveImpact,
  buildAllocationTrend,
  createAllocationTrendBatch,
  classifyInitiative,
  classifyWorkType,
  computeAllocation,
  withAllocationMetadata,
  mergeAllocations,
  prWeight,
} from "./allocation.js";
import { estimatePrHours } from "./estimate-hours.js";
import { summarizeVerification } from "./readiness.js";
import type { AllocationConfig, ManualTimeEntry, PullRequest } from "../types.js";

type Data = Parameters<typeof computeAllocation>[0];

const cfg = (over: Partial<AllocationConfig> = {}): AllocationConfig => ({ ...DEFAULT_ALLOCATION_CONFIG, ...over });

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  title: "Redesign Proforma recruit intake",
  body: null,
  url: "https://github.com/o/app/pull/1",
  repository: "o/app",
  state: "merged",
  labels: [],
  additions: 100,
  deletions: 10,
  changedFiles: 3,
  author: "me",
  createdAt: "2026-10-01T00:00:00Z",
  mergedAt: "2026-10-02T00:00:00Z",
  ...over,
});

const data = (over: Partial<Data> = {}, hours = 10): Data => ({
  dateRange: { from: "2026-10-07", to: "2026-10-07" },
  stats: { estimatedHours: hours } as Data["stats"],
  hoursEstimate: undefined,
  pullRequests: [],
  prsInProgress: [],
  commitMessages: [],
  codeReviews: [],
  reviewComments: [],
  ...over,
});

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe("classifyWorkType", () => {
  it.each([
    ["feat: add thing", "new-capability"],
    ["feat(pricing): add thing", "new-capability"],
    ["feat!: breaking", "new-capability"],
    ["fix(ui): overlap", "quality"],
    ["perf: faster", "quality"],
    ["revert: x", "quality"],
    ["test: cover", "quality"],
    ["refactor(core): tidy", "maintenance"],
    ["chore: x", "maintenance"],
    ["ci: x", "maintenance"],
    ["build: x", "maintenance"],
    ["style: x", "maintenance"],
    ["deps: x", "maintenance"],
    ["docs(brand): describe", "documentation"],
    ["feat: fix the world", "new-capability"],
    ["Fix crash on save", "quality"],
    ["Update README", "documentation"],
    ["Bump lodash", "maintenance"],
    ["Cleanup old code", "maintenance"],
    ["Clean up old code", "maintenance"],
    ["Redesign Proforma recruit intake", "new-capability"],
    ["Add group-managed SWA role access", "new-capability"],
  ])("%s -> %s", (text, expected) => {
    expect(classifyWorkType(text)).toBe(expected);
  });

  it("uses labels only as a tiebreaker", () => {
    expect(classifyWorkType("Adjust totals", ["bug"])).toBe("quality");
    expect(classifyWorkType("Adjust totals", ["documentation"])).toBe("documentation");
    expect(classifyWorkType("Add pricing calculator", ["documentation"])).toBe("new-capability");
    expect(classifyWorkType("feat: x", ["bug"])).toBe("new-capability");
  });

  it("does not match keywords inside other words", () => {
    expect(classifyWorkType("Specification screen")).toBe("new-capability");
    expect(classifyWorkType("Prefix handling")).toBe("new-capability");
  });
});

describe("app allocation from monorepo paths", () => {
  const config = cfg({ sharedInitiative: "Shared platform", paths: { hub: "Hub", compass: "Compass", packages: "Shared platform" }, initiatives: { "scope:hub": "Hub", "scope:compass": "Compass", "repo:o/monorepo": "Unassigned app work" } });
  it("identifies apps by directory with segment boundaries", () => {
    expect(classifyInitiative({ title: "Update settings", repository: "o/monorepo", files: ["hub/src/settings.ts", "bun.lock"] }, config)).toBe("Hub");
    expect(classifyInitiative({ title: "Update settings", repository: "o/monorepo", files: ["hub-old/src/settings.ts"] }, config)).toBe("Unassigned app work");
  });
  it("uses shared work for multiple apps or shared-only changes", () => {
    for (const files of [["hub/src/a.ts", "compass/src/b.ts"], ["packages/ui/src/a.ts"]]) {
      expect(classifyInitiative({ title: "feat(hub): update", repository: "o/monorepo", files }, config)).toBe(files.length > 1 ? "Shared platform" : "Hub");
    }
    expect(classifyInitiative({ title: "Update shared UI", repository: "o/monorepo", files: ["packages/ui/src/a.ts"] }, config)).toBe("Shared platform");
    expect(classifyInitiative({ title: "feat(hub,compass): update", repository: "o/monorepo" }, config)).toBe("Shared platform");
    expect(classifyInitiative({ title: "Update", labels: ["app: hub", "app: compass"], repository: "o/monorepo" }, config)).toBe("Shared platform");
  });
  it("preserves total estimated effort while reclassifying by app", () => {
    const input = data({ pullRequests: [pr({ title: "Update settings", repository: "o/monorepo", workFiles: ["compass/src/settings.ts"] })] }, 12);
    const result = computeAllocation(input, config);
    expect(result.totalHours).toBe(12);
    expect(result.initiatives[0]).toMatchObject({ initiative: "Compass", hours: 12 });
  });
  it("uses complete cached PR metadata without changing daily effort weights or source data", () => {
    const input = data({ pullRequests: [pr({ title: "Update", repository: "o/monorepo", url: "p", workFiles: [] })], codeReviews: [{ repository: "o/monorepo", prNumber: 1, prUrl: "p", prTitle: "Update", state: "APPROVED", submittedAt: "", body: null }] }, 12);
    const evidence = { prs: { p: { files: ["hub/src/a.ts", "hub/src/b.ts"] } } } as unknown as import("../types.js").EvidenceLedger;
    const enriched = withAllocationMetadata(input as Data & import("../types.js").WeeklyReportData, evidence);
    expect(enriched.pullRequests[0].workFiles).toEqual([]);
    expect(input.pullRequests[0].allocationFiles).toBeUndefined();
    expect(prWeight(enriched.pullRequests[0])).toBe(prWeight(input.pullRequests[0]));
    expect(computeAllocation(enriched, config).initiatives.map((bucket) => bucket.initiative)).toEqual(["Hub"]);
    evidence.prs.p.incomplete = { files: true };
    expect(withAllocationMetadata(input as Data & import("../types.js").WeeklyReportData, evidence).pullRequests[0].allocationFiles).toBeUndefined();
  });
  it("attributes confirmed empty repository coordination to shared work", () => {
    const input = data({ commitMessages: [{ repo: "o/monorepo", messages: ["Merge release"], commits: [{ sha: "empty", message: "Merge release", url: "commit", authoredAt: "", files: [] }] }] }, 8);
    expect(computeAllocation(input, config).initiatives[0]).toMatchObject({ initiative: "Shared platform", hours: 8 });
    const missing = data({ commitMessages: [{ repo: "o/monorepo", messages: ["Unknown activity"] }] }, 8);
    expect(computeAllocation(missing, config).initiatives[0].initiative).toBe("Unassigned app work");
  });
});

describe("classifyInitiative", () => {
  const base = { repository: "Org/ohcpwm-apps" };
  it("prefers the label prefix, mapped or humanized", () => {
    const c = cfg({ initiatives: { "app: hub": "Hub Portal" } });
    expect(classifyInitiative({ ...base, title: "x", labels: ["App: Hub"] }, c)).toBe("Hub Portal");
    expect(classifyInitiative({ ...base, title: "x", labels: ["bug", "app:pto-tracker"] }, cfg())).toBe("Pto Tracker");
  });
  it("falls back to exactly mapped labels", () => {
    const c = cfg({ initiatives: { billing: "Billing" } });
    expect(classifyInitiative({ ...base, title: "x", labels: ["billing"] }, c)).toBe("Billing");
  });
  it("maps conventional scopes and ignores unmapped ones", () => {
    const c = cfg({ initiatives: { "scope:pricing": "Pricing" } });
    expect(classifyInitiative({ ...base, title: "feat(Pricing): x" }, c)).toBe("Pricing");
    expect(classifyInitiative({ ...base, title: "fix(ui): x" }, c)).toBe("Ohcpwm Apps");
  });
  it("uses repo mapping, default initiative, then humanized repo", () => {
    expect(classifyInitiative({ ...base, title: "x" }, cfg({ initiatives: { "repo:Org/ohcpwm-apps": "OHC" } }))).toBe("OHC");
    expect(classifyInitiative({ ...base, title: "x" }, cfg({ defaultInitiative: "Platform" }))).toBe("Platform");
    expect(classifyInitiative({ ...base, title: "x" }, cfg())).toBe("Ohcpwm Apps");
  });
  it("prefers repo mapping over another initiative named in the title", () => {
    const c = cfg({ initiatives: {
      "repo:Org/ohcpwm-apps": "Platform",
      "app: hub": "Hub",
    } });
    expect(classifyInitiative({ ...base, title: "Fix Hub integration", labels: [] }, c)).toBe("Platform");
  });
  it("label precedence beats scope and repo", () => {
    const c = cfg({ initiatives: { "scope:a": "A", "repo:Org/ohcpwm-apps": "R" } });
    expect(classifyInitiative({ ...base, title: "feat(a): x", labels: ["app: z"] }, c)).toBe("Z");
  });
});

describe("computeAllocation", () => {
  it("keeps a PR in progress before its later merge, then folds effort into shipped", () => {
    const historical = computeAllocation(data({
      dateRange: { from: "2026-09-01", to: "2026-09-01" },
      prsInProgress: [pr({ url: "p", state: "merged", mergedAt: "2026-09-05T12:00:00Z", workAdditions: 20 })],
    }, 10));
    expect(historical.initiatives[0]!.inProgress[0]).toMatchObject({ state: "open", url: "p" });
    // Merged inside the window: the fetcher lists it in pullRequests (and may also in prsInProgress).
    const mergedWithin = computeAllocation(data({
      dateRange: { from: "2026-09-01", to: "2026-09-05" },
      pullRequests: [pr({ url: "p", state: "merged", mergedAt: "2026-09-05T12:00:00Z", workAdditions: 20 })],
      prsInProgress: [pr({ url: "p", state: "merged", mergedAt: "2026-09-05T12:00:00Z", workAdditions: 20 })],
    }, 10));
    expect(mergedWithin.initiatives[0]!.shipped[0]).toMatchObject({ state: "merged", url: "p" });
    const later = computeAllocation(data({
      dateRange: { from: "2026-09-05", to: "2026-09-05" },
      pullRequests: [pr({ url: "p", state: "merged", mergedAt: "2026-09-05T12:00:00Z" })],
    }, 10));
    const combined = mergeAllocations([historical, later]).initiatives[0]!;
    expect(combined.shipped).toHaveLength(1);
    expect(combined.shipped[0]!.effortHours).toBe(20);
  });
  it("keeps an evening merge shipped on its local report day even when its UTC date is the next day", () => {
    // America/New_York day 2026-10-07, merged 21:00 local = 01:00Z on 2026-10-08.
    const evening = pr({ url: "e", state: "merged", mergedAt: "2026-10-08T01:00:00Z", workAdditions: 20 });
    const a = computeAllocation(data({
      dateRange: { from: "2026-10-07", to: "2026-10-07" },
      pullRequests: [evening],
      prsInProgress: [evening],
    }, 10));
    expect(a.initiatives[0]!.shipped[0]).toMatchObject({ state: "merged", url: "e" });
    expect(a.initiatives[0]!.inProgress).toEqual([]);
  });
  it("scales GitHub weights to the target", () => {
    const d = data({
      pullRequests: [
        pr({ url: "u1", labels: ["app: a"], additions: 500 }),
        pr({ url: "u2", labels: ["app: b"], additions: 60, title: "fix: bug" }),
      ],
    }, 20);
    const a = computeAllocation(d);
    expect(a.version).toBe(ALLOCATION_VERSION);
    expect(a.totalHours).toBeCloseTo(20, 1);
    expect(sum(a.initiatives.map((i) => i.share))).toBeCloseTo(1, 5);
    expect(a.initiatives[0].initiative).toBe("A");
    expect(a.initiatives[0].hours).toBeGreaterThan(a.initiatives[1].hours);
    expect(a.workTypes.map((w) => w.workType).sort()).toEqual(["new-capability", "quality"]);
    expect(a.manualHours).toBe(0);
  });

  it("prefers hoursEstimate over stats and handles zero target", () => {
    const d = data({ hoursEstimate: { hours: 5 } as Data["hoursEstimate"], pullRequests: [pr()] }, 99);
    expect(computeAllocation(d).totalHours).toBe(5);
    const z = computeAllocation(data({ pullRequests: [pr()] }, 0));
    expect(z.totalHours).toBe(0);
    expect(z.initiatives.every((i) => i.share === 0)).toBe(true);
  });

  it("excludes an idle daily minimum from attributed work", () => {
    const a = computeAllocation(data({ hoursEstimate: { hours: 8, sessionHours: 0 } as Data["hoursEstimate"] }, 8));
    expect(a.initiatives).toEqual([]);
    expect(a.workTypes).toEqual([]);
    expect(a.totalHours).toBe(0);
  });

  it("keeps session-only time in the general maintenance fallback", () => {
    const a = computeAllocation(data({ hoursEstimate: { hours: 8, sessionHours: 1 } as Data["hoursEstimate"] }, 8));
    expect(a.totalHours).toBe(8);
    expect(a.initiatives).toHaveLength(1);
    expect(a.initiatives[0]).toMatchObject({ initiative: "General engineering", hours: 8, byWorkType: { maintenance: 8 } });
    expect(a.workTypes[0]).toMatchObject({ workType: "maintenance", label: "Maintenance & tooling" });
  });

  it("sections PRs by state and dedupes across pullRequests and prsInProgress", () => {
    const open = pr({ url: "o", state: "open", title: "Open one" });
    const a = computeAllocation(data({
      pullRequests: [pr({ url: "m" }), open, pr({ url: "c", state: "closed", title: "Closed" })],
      prsInProgress: [open],
    }));
    const b = a.initiatives[0];
    expect(b.shipped.map((i) => i.url)).toEqual(["m"]);
    expect(b.inProgress.map((i) => i.url)).toEqual(["o"]);
    expect(b.other.map((i) => i.title)).toEqual(["Closed"]);
  });

  it("uses daily work signals when present", () => {
    const withWork = pr({ url: "w", workAdditions: 5, workDeletions: 0, workFiles: ["a.ts"], workCommits: [] });
    const big = pr({ url: "b", additions: 5000, deletions: 0, labels: ["app: big"] });
    const a = computeAllocation(data({ pullRequests: [withWork, big] }, 10));
    const w = a.initiatives.find((i) => i.initiative === "App")!;
    const bg = a.initiatives.find((i) => i.initiative === "Big")!;
    expect(bg.hours).toBeGreaterThan(w.hours);
  });

  it("uses lifetime churn for merge-only PRs with zero daily additions", () => {
    const mergeOnly = pr({ workAdditions: 0, workDeletions: 0, workCommits: [], additions: 500, deletions: 50 });
    const daily = pr({ url: "daily", workAdditions: 5, workDeletions: 0, workCommits: [], workFiles: ["a.ts"] });
    expect(prWeight(mergeOnly)).toBe(estimatePrHours(500, 50));
    expect(prWeight(mergeOnly)).toBeGreaterThan(prWeight(daily));
    const allocation = computeAllocation(data({ pullRequests: [mergeOnly, daily] }, 10));
    expect(allocation.initiatives.find((i) => i.initiative === "App")!.hours)
      .toBeGreaterThan(allocation.initiatives.find((i) => i.initiative === "Daily")?.hours ?? 0);
  });

  it("does not give weight to an in-progress-only PR with zero daily additions", () => {
    const inProgress = pr({ url: "progress", state: "open", workAdditions: 0, workDeletions: 0, workCommits: [] });
    const a = computeAllocation(data({ prsInProgress: [inProgress] }, 10));
    expect(a.totalHours).toBe(0);
    expect(a.initiatives.find((i) => i.initiative === "App")?.hours ?? 0).toBe(0);
    expect(a.initiatives.find((i) => i.initiative === NO_ACTIVITY_INITIATIVE)?.hours).toBeUndefined();
  });

  it("attributes reviews and comments as team-support, one item per PR", () => {
    const review = {
      repository: "o/app", prNumber: 7, prTitle: "feat(pricing): tiers", prUrl: "https://github.com/o/app/pull/7",
      state: "commented", submittedAt: "", body: null,
    };
    const comment = {
      repository: "o/app", prNumber: 7, prUrl: review.prUrl, url: "c1", body: "x", path: null, createdAt: "",
    };
    const stray = { ...comment, repository: "o/other", prNumber: 9, prUrl: "z", url: "c2" };
    const a = computeAllocation(
      data({ codeReviews: [review, review], reviewComments: [comment, stray] }, 10),
      cfg({ initiatives: { "scope:pricing": "Pricing" } }),
    );
    const pricing = a.initiatives.find((i) => i.initiative === "Pricing")!;
    const other = a.initiatives.find((i) => i.initiative === "Other")!;
    expect(pricing.byWorkType["team-support"]).toBeGreaterThan(0);
    expect(pricing.other.filter((i) => i.kind === "review")).toEqual([
      { kind: "review", title: "Reviewed: feat(pricing): tiers", url: review.prUrl, repository: "o/app" },
    ]);
    // 1.5 + 0.25 vs 0.25
    expect(pricing.hours / other.hours).toBeCloseTo(7, 0);
    expect(a.workTypes).toHaveLength(1);
    expect(a.workTypes[0].workType).toBe("team-support");
  });

  it("classifies comment-only reviews using retained PR metadata and supports older reports", () => {
    const comment = { repository: "o/app", prNumber: 7, prUrl: "p", url: "c", body: "x", path: null, createdAt: "" };
    const config = cfg({ initiatives: { "scope:pricing": "Pricing" } });
    for (const metadata of [{ prTitle: "feat(pricing): tiers" }, { prTitle: "Other", prLabels: ["app: pricing"] }]) {
      const allocation = computeAllocation(data({ reviewComments: [{ ...comment, ...metadata }] }), config);
      expect(allocation.initiatives[0]).toMatchObject({ initiative: "Pricing", byWorkType: { "team-support": 10 } });
    }
    expect(computeAllocation(data({ reviewComments: [comment] }), config).initiatives[0]!.initiative).toBe("App");
  });

  it("keeps reviews and inline comments on a teammate's labelled PR in the same initiative", () => {
    const review = { repository: "o/app", prNumber: 7, prUrl: "https://github.com/o/app/pull/7", prTitle: "Tweak pricing", state: "APPROVED", body: "", submittedAt: "", url: "review" };
    const comment = { repository: "o/app", prNumber: 7, prUrl: review.prUrl, prTitle: review.prTitle, prLabels: ["app: northstar"], url: "comment", body: "x", path: null, createdAt: "" };
    const allocation = computeAllocation(data({ codeReviews: [review], reviewComments: [comment] }, 2));
    expect(allocation.initiatives).toHaveLength(1);
    expect(allocation.initiatives[0]).toMatchObject({ initiative: "Northstar", hours: 2, byWorkType: { "team-support": 2 }, other: [{ title: "Reviewed: Tweak pricing" }] });
  });

  it("excludes PR work commits from direct commits", () => {
    const shared = { sha: "s1", message: "feat: a", url: "", authoredAt: "", additions: 10, deletions: 0 };
    const direct = { sha: "s2", message: "fix: b\n\nbody", url: "", authoredAt: "", additions: 10, deletions: 0 };
    const a = computeAllocation(data({
      pullRequests: [pr({ workCommits: [shared], workAdditions: 10, workDeletions: 0, workFiles: ["a.ts"] })],
      commitMessages: [{ repo: "o/app", messages: ["feat: a", "fix: b"], commits: [shared, direct] }],
    }));
    const items = a.initiatives[0].other.filter((i) => i.kind === "commits");
    expect(items).toEqual([{ kind: "commits", title: "1 direct commit", repository: "o/app" }]);
    expect(a.workTypes.map((w) => w.workType).sort()).toEqual(["new-capability", "quality"]);
  });

  it("weights commits: 0.5 each without stats, churn band with stats; messages-only repos work", () => {
    const noStats = computeAllocation(data({
      commitMessages: [
        { repo: "o/a", messages: ["feat: 1", "feat: 2"] },
        { repo: "o/b", messages: ["feat: 3", "feat: 4", "feat: 5", "feat: 6"] },
      ],
    }, 6));
    expect(noStats.initiatives[0]).toMatchObject({ initiative: "B", hours: 4 });
    expect(noStats.initiatives[0].other[0].title).toBe("4 direct commits");
    const stats = computeAllocation(data({
      commitMessages: [{ repo: "o/a", messages: [], commits: [
        { sha: "1", message: "feat: x", url: "", authoredAt: "", additions: 5000, deletions: 0 },
      ] }, { repo: "o/b", messages: ["feat: y"] }],
    }, 10));
    expect(stats.initiatives[0].initiative).toBe("A");
  });

  it("weights direct commits per scope unit, consistent with the hours estimate", () => {
    const commit = (sha: string, message: string, additions: number) =>
      ({ sha, message, url: "", authoredAt: "", additions, deletions: 0 });
    // Two scope units in o/a (pricing x2, ui x1) vs one lumped band before.
    const a = computeAllocation(data({
      commitMessages: [{ repo: "o/a", messages: [], commits: [
        commit("1", "feat(pricing): a", 100),
        commit("2", "fix(pricing): b", 100),
        commit("3", "feat(ui): c", 100),
      ] }],
    }, 10));
    expect(a.initiatives[0].other[0].title).toBe("3 direct commits");
    expect(sum(a.initiatives.map((i) => i.hours))).toBeCloseTo(10, 1);
  });

  it("adds manual time unscaled, within the date range only", () => {
    const manual: ManualTimeEntry[] = [
      { date: "2026-10-07", initiative: "Ops", hours: 2, note: "Planning" },
      { date: "2026-10-07T12:00:00Z", initiative: "Ops", hours: 1, workType: "team-support" },
      { date: "2026-10-06", initiative: "Ops", hours: 5 },
      { date: "2026-10-08", initiative: "Ops", hours: 5 },
    ];
    const a = computeAllocation(
      data({ pullRequests: [pr()], dateRange: { from: "2026-10-07T00:00:00Z", to: "2026-10-07T23:59:59Z" } }, 10),
      cfg(),
      manual,
    );
    expect(a.totalHours).toBe(13);
    expect(a.manualHours).toBe(3);
    const ops = a.initiatives.find((i) => i.initiative === "Ops")!;
    expect(ops.hours).toBe(3);
    expect(ops.byWorkType).toEqual({ unlogged: 2, "team-support": 1 });
    expect(ops.other.map((i) => i.title)).toEqual(["Planning", "Self-reported time"]);
    expect(a.workTypes.find((w) => w.workType === "unlogged")!.label).toContain("self-reported");
    expect(sum(a.initiatives.map((i) => i.share))).toBeCloseTo(1, 5);
    expect(a.note).toMatch(/estimate/);
  });

  it("is deterministic and tolerates legacy data", () => {
    const legacy = {
      dateRange: { from: "2026-10-07", to: "2026-10-07" },
      stats: { estimatedHours: 4 },
      pullRequests: [{ title: "Old PR", url: "u", repository: "o/old-repo", state: "merged", additions: 10, deletions: 1 }],
      commitMessages: [{ repo: "o/old-repo", messages: ["fix: x"] }],
    } as unknown as Data;
    const a = computeAllocation(legacy);
    expect(a).toEqual(computeAllocation(legacy));
    expect(a.totalHours).toBe(4);
    expect(a.initiatives[0].initiative).toBe("Old Repo");
    expect(() => computeAllocation({ dateRange: { from: "a", to: "b" }, stats: {} } as unknown as Data)).not.toThrow();
  });

  it("sorts ties by name", () => {
    const a = computeAllocation(data({
      pullRequests: [pr({ url: "1", labels: ["app: zed"] }), pr({ url: "2", labels: ["app: alpha"] })],
    }));
    expect(a.initiatives.map((i) => i.initiative)).toEqual(["Alpha", "Zed"]);
  });
});

describe("mergeAllocations", () => {
  it("returns a zero allocation for an empty list", () => {
    const m = mergeAllocations([]);
    expect(m).toMatchObject({ totalHours: 0, initiatives: [], workTypes: [], manualHours: 0 });
    expect(m.version).toBe(ALLOCATION_VERSION);
  });

  it("sums hours, recomputes shares, and dedupes items", () => {
    const d1 = data({ pullRequests: [pr({ url: "a", labels: ["app: x"] })] }, 4);
    const d2 = data({ pullRequests: [pr({ url: "a", labels: ["app: x"] }), pr({ url: "b", labels: ["app: y"] })] }, 6);
    const m = mergeAllocations([computeAllocation(d1), computeAllocation(d2)]);
    expect(m.totalHours).toBe(10);
    expect(sum(m.initiatives.map((i) => i.share))).toBeCloseTo(1, 5);
    expect(m.initiatives.find((i) => i.initiative === "X")!.shipped).toHaveLength(1);
  });

  it("drops in-progress items for PRs that shipped later", () => {
    const day1 = computeAllocation(data({ pullRequests: [pr({ url: "p", state: "open" })] }, 3));
    const day2 = computeAllocation(data({ pullRequests: [pr({ url: "p", state: "merged" })] }, 3));
    const b = mergeAllocations([day1, day2]).initiatives[0];
    expect(b.shipped.map((i) => i.url)).toEqual(["p"]);
    expect(b.inProgress).toEqual([]);
    const onlyOpen = mergeAllocations([day1, day1]).initiatives[0];
    expect(onlyOpen.inProgress).toHaveLength(1);
  });

  it("moves earlier open effort onto a later closed PR appearance", () => {
    const openPr = pr({ url: "p", state: "open", mergedAt: null });
    const open = computeAllocation(data({ pullRequests: [openPr], prsInProgress: [openPr] }, 8));
    const closed = computeAllocation(data({ prsWorkedOnClosed: [pr({ url: "p", state: "closed", mergedAt: null })] }, 4));
    const merged = mergeAllocations([open, closed]);
    const items = merged.initiatives.flatMap((bucket) => [...bucket.inProgress, ...bucket.other]);
    expect(items.filter((item) => item.kind === "pr" && item.url === "p")).toHaveLength(1);
    expect(items).toMatchObject([{ kind: "pr", state: "closed", effortHours: 12 }]);
    expect(merged.totalHours).toBe(12);
    // The closed PR is neither completed nor in review, and is left out of every verification count.
    expect(summarizeVerification(merged)).toMatchObject({ inReview: 0, completed: 0, checksUnknown: 0, checksCollected: 0 });
  });

  it("keeps a later reopened PR in progress and preserves totals", () => {
    const closed = computeAllocation(data({ prsWorkedOnClosed: [pr({ url: "p", state: "closed", mergedAt: null })] }, 4));
    const openPr = pr({ url: "p", state: "open", mergedAt: null });
    // Reopened (and so listed in the report) on the later day, which carries 8h of attributable work.
    const open = computeAllocation(data({ pullRequests: [openPr], prsInProgress: [openPr] }, 8));
    const merged = mergeAllocations([closed, open]);
    const items = merged.initiatives.flatMap((bucket) => [...bucket.inProgress, ...bucket.other]);
    expect(items).toMatchObject([{ kind: "pr", state: "open", effortHours: 12 }]);
    expect(merged.initiatives.flatMap((bucket) => bucket.other)).toEqual([]);
    expect(merged.totalHours).toBe(12);
  });

  it("sums manual hours and direct-commit counts", () => {
    const manual = (date: string): ManualTimeEntry[] => [{ date, initiative: "Ops", hours: 1.5 }];
    const mk = (date: string) =>
      computeAllocation(
        data({ dateRange: { from: date, to: date }, commitMessages: [{ repo: "o/a", messages: ["feat: 1", "feat: 2"] }] }, 2),
        cfg(),
        manual(date),
      );
    const m = mergeAllocations([mk("2026-10-07"), mk("2026-10-08")]);
    expect(m.manualHours).toBe(3);
    const a = m.initiatives.find((i) => i.initiative === "A")!;
    expect(a.other).toEqual([{ kind: "commits", title: "4 direct commits", repository: "o/a" }]);
    expect(m.initiatives.find((i) => i.initiative === "Ops")!.other).toHaveLength(2);
  });
});

describe("buildAllocationTrend", () => {
  const report = (date: string, hours = 4, repo = "o/app") => ({
    date,
    data: data({
      dateRange: { from: date, to: date },
      pullRequests: [pr({ url: `u-${date}`, repository: repo })],
    }, hours),
  });

  it("starts Mon–Fri weeks on Monday and labels them by the first and last available weekday report", () => {
    // 2026-10-02 is a Friday; 2026-10-05 a Monday; 2026-10-09 a Friday.
    const t = buildAllocationTrend(
      [report("2026-10-07"), report("2026-10-05"), report("2026-10-02")],
      "2026-10-07",
      cfg({ trendWeeks: 2 }),
    );
    expect(t.periods.map((p) => [p.id, p.from, p.to, p.days, p.label])).toEqual([
      ["2026-09-28", "2026-09-28", "2026-10-02", 1, "Oct 2"],
      ["2026-10-05", "2026-10-05", "2026-10-09", 2, "Oct 5-7"],
    ]);
    expect(t.periods[1].allocation.totalHours).toBe(8);
  });

  it("produces exactly trendWeeks periods, oldest first, with nominal Mon–Fri gaps", () => {
    const t = buildAllocationTrend([report("2026-10-07")], "2026-10-07", cfg({ trendWeeks: 4 }));
    expect(t.periods).toHaveLength(4);
    expect(t.periods.map((p) => p.id)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"]);
    expect(t.periods[0]).toMatchObject({ days: 0, label: "Sep 14-18", from: "2026-09-14", to: "2026-09-18" });
    expect(t.periods[0].allocation.totalHours).toBe(0);
    expect(t.periods[3].days).toBe(1);
  });

  it("handles year boundaries", () => {
    // 2025-12-29 is a Monday; 2026-01-02 is the Friday of the same week.
    const t = buildAllocationTrend(
      [report("2025-12-26"), report("2025-12-31"), report("2026-01-02")],
      "2026-01-02",
      cfg({ trendWeeks: 2 }),
    );
    expect(t.periods.map((p) => [p.id, p.from, p.to, p.days])).toEqual([
      ["2025-12-22", "2025-12-22", "2025-12-26", 1],
      ["2025-12-29", "2025-12-29", "2026-01-02", 2],
    ]);
    expect(t.periods[1].label).toBe("Dec 31, 2025-Jan 2, 2026");
  });

  it("includes manual entries on days without reports, without double counting", () => {
    const manual: ManualTimeEntry[] = [
      { date: "2026-10-07", initiative: "Ops", hours: 2 }, // has a report
      { date: "2026-10-06", initiative: "Ops", hours: 3 }, // Tuesday, no report
      { date: "2026-10-12", initiative: "Ops", hours: 9 }, // after endDate
      { date: "2026-09-29", initiative: "Ops", hours: 1 }, // previous week, no report
    ];
    const t = buildAllocationTrend([report("2026-10-07")], "2026-10-07", cfg({ trendWeeks: 2 }), manual);
    const [prev, cur] = t.periods;
    expect(prev.allocation.manualHours).toBe(1);
    expect(cur.allocation.manualHours).toBe(5);
    expect(cur.allocation.totalHours).toBe(9);
    expect(cur.days).toBe(1);
  });

  it("orders initiatives by total hours across periods", () => {
    const t = buildAllocationTrend(
      [report("2026-10-01", 2, "o/small"), report("2026-10-08", 10, "o/big"), report("2026-10-09", 1, "o/small")],
      "2026-10-09",
      cfg({ trendWeeks: 2 }),
    );
    expect(t.initiatives).toEqual(["Big", "Small"]);
  });

  it("reuses completed weeks without leaking later reports or manual time into earlier trends", () => {
    const reports = [report("2026-10-01", 3), report("2026-10-03", 5), report("2026-10-08", 7)];
    const config = cfg({ trendWeeks: 2 });
    const manual: ManualTimeEntry[] = [
      { date: "2026-10-02", initiative: "Ops", hours: 2 },
      { date: "2026-10-06", initiative: "Ops", hours: 4 },
    ];
    const batch = createAllocationTrendBatch(reports, config, manual);
    for (const end of ["2026-10-03", "2026-10-08", "2026-10-05", "2026-10-09", "2026-10-03"]) {
      expect(batch.trend(end)).toEqual(buildAllocationTrend(reports, end, config, manual));
    }
    expect(batch.allocationForDate("2026-10-03")).toEqual(computeAllocation(reports[1].data, config, manual));
    expect(batch.allocationForDate("2026-10-04")).toBeUndefined();
  });

  it("counts a weekend once, in the adjacent week with lower modeled effort, keeping its own dates", () => {
    // Fri Oct 9 (2h) < Mon Oct 12 (6h): Sat Oct 10 + Sun Oct 11 join the week of Oct 5.
    const reports = [report("2026-10-09", 2), report("2026-10-10", 3), report("2026-10-11", 1), report("2026-10-12", 6)];
    const t = buildAllocationTrend(reports, "2026-10-12", cfg({ trendWeeks: 2 }));
    expect(t.periods.map((p) => [p.id, p.label, p.days, p.allocation.totalHours])).toEqual([
      ["2026-10-05", "Oct 9", 3, 6],
      ["2026-10-12", "Oct 12", 1, 6],
    ]);
    expect(t.periods[0].weekends).toMatchObject([
      { saturday: "2026-10-10", activeDates: ["2026-10-10", "2026-10-11"], target: "friday", reason: "lower-effort", fridayHours: 2, mondayHours: 6 },
    ]);
    expect(t.periods[1].weekends).toBeUndefined();
  });

  it("compares Friday and Monday with their own self-reported time, before weekend additions", () => {
    // Monday's report is 1h but 4h of self-reported Monday time makes it 5h > Friday's 3h.
    const manual: ManualTimeEntry[] = [
      { date: "2026-10-12", initiative: "Ops", hours: 4 },
      { date: "2026-10-10", initiative: "Ops", hours: 50 }, // weekend time, no report: follows the weekend
    ];
    const t = buildAllocationTrend([report("2026-10-09", 3), report("2026-10-12", 1)], "2026-10-12", cfg({ trendWeeks: 2 }), manual);
    expect(t.periods.map((p) => [p.id, p.allocation.totalHours, p.allocation.manualHours])).toEqual([
      ["2026-10-05", 53, 50],
      ["2026-10-12", 5, 4],
    ]);
  });

  it("adds an explicit weekend period when neither Friday nor Monday has a report", () => {
    const manual: ManualTimeEntry[] = [{ date: "2026-10-11", initiative: "Ops", hours: 2 }];
    const t = buildAllocationTrend([report("2026-10-08"), report("2026-10-10", 3), report("2026-10-13")], "2026-10-13", cfg({ trendWeeks: 2 }), manual);
    expect(t.periods.map((p) => [p.id, p.kind ?? "week", p.label, p.from, p.to, p.days, p.allocation.totalHours])).toEqual([
      ["2026-10-05", "week", "Oct 8", "2026-10-05", "2026-10-09", 1, 4],
      ["2026-10-10", "weekend", "Oct 10 weekend", "2026-10-10", "2026-10-11", 1, 5],
      ["2026-10-12", "week", "Oct 13", "2026-10-12", "2026-10-16", 1, 4],
    ]);
  });

  it("conserves effort: every report and uncovered self-reported entry lands in exactly one period", () => {
    const hours = [5, 2, 3, 1, 4, 6, 2, 7, 1, 3, 2, 8, 2];
    const dates = [
      "2026-09-28", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", // Sat/Sun between Fri 2h and Mon 4h
      "2026-10-09", "2026-10-10", "2026-10-12", // Fri 6h vs Mon 7h
      "2026-10-17", "2026-10-18", // no Fri 16 / Mon 19 -> weekend entry
      "2026-10-21", "2026-10-23", "2026-10-26", // Fri 8h vs Mon 2h; no weekend reports
    ];
    const reports = dates.map((d, i) => report(d, hours[i]));
    const manual: ManualTimeEntry[] = [
      { date: "2026-10-11", initiative: "Ops", hours: 1.5 }, // weekend, no report
      { date: "2026-10-24", initiative: "Ops", hours: 2.5 }, // weekend before the lighter Monday
      { date: "2026-10-07", initiative: "Ops", hours: 0.5 }, // weekday, no report
      { date: "2026-10-12", initiative: "Ops", hours: 1 }, // covered by the Monday report
      { date: "2026-11-02", initiative: "Ops", hours: 9 }, // after the end
    ];
    const config = cfg({ trendWeeks: 6 });
    const t = buildAllocationTrend(reports, "2026-10-26", config, manual);
    const daily = reports.reduce((sum, r) => sum + computeAllocation(r.data, config, manual).totalHours, 0);
    const uncovered = 1.5 + 2.5 + 0.5;
    const total = t.periods.reduce((sum, p) => sum + p.allocation.totalHours, 0);
    expect(total).toBeCloseTo(daily + uncovered, 6);
    expect(t.periods.reduce((sum, p) => sum + p.days, 0)).toBe(reports.length);
    const byId = new Map(t.periods.map((p) => [p.id, p]));
    expect(byId.get("2026-10-17")).toMatchObject({ kind: "weekend", days: 2 });
    expect(byId.get("2026-10-19")).toMatchObject({ days: 2, label: "Oct 21-23" });
    expect(byId.get("2026-10-26")?.allocation.manualHours).toBe(2.5);
    // Sun Oct 11 (1.5h, Fri 6h < Mon 7h + 1h) and Wed Oct 7 (0.5h) both count in the week of Oct 5.
    expect(byId.get("2026-10-05")?.allocation.manualHours).toBe(2);
    expect(byId.get("2026-09-28")).toMatchObject({ days: 4, label: "Sep 28-Oct 2" });
  });

  it("rebuilds a period when a later cutoff moves its weekend, and reuses it otherwise", () => {
    // Sat Oct 10 joins Friday while Monday is unknown, then Monday (lower) claims it.
    const reports = [report("2026-10-09", 6), report("2026-10-10", 3), report("2026-10-12", 2)];
    const config = cfg({ trendWeeks: 2 });
    const batch = createAllocationTrendBatch(reports, config);
    const sat = batch.trend("2026-10-10");
    expect(sat.periods.at(-1)).toMatchObject({ id: "2026-10-05", days: 2 });
    expect(sat.periods.at(-1)!.allocation.totalHours).toBe(9);
    const mon = batch.trend("2026-10-12");
    expect(mon.periods.map((p) => [p.id, p.days, p.allocation.totalHours])).toEqual([
      ["2026-10-05", 1, 6],
      ["2026-10-12", 2, 5],
    ]);
    for (const end of ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-09", "2026-10-10"]) {
      expect(batch.trend(end)).toEqual(buildAllocationTrend(reports, end, config));
    }
    expect(batch.trend("2026-10-10")).toEqual(sat);
    expect(batch.calendar("2026-10-10").groupIdOf("2026-10-10")).toBe("2026-10-05");
    expect(batch.calendar().groupIdOf("2026-10-10")).toBe("2026-10-12");
  });
});

describe("real fixture", () => {
  it("allocates 2026-10-07 to the stored estimate", () => {
    const raw = parse(readFileSync(new URL("../../data/2026/10/07/github-data.yaml", import.meta.url), "utf8")) as Data;
    const a = computeAllocation(raw);
    const stored = raw.hoursEstimate?.hours ?? raw.stats.estimatedHours;
    expect(a.totalHours).toBeCloseTo(stored, 0);
    expect(sum(a.initiatives.map((i) => i.share))).toBeCloseTo(1, 5);
    expect(sum(a.workTypes.map((w) => w.share))).toBeCloseTo(1, 5);
    expect(a.initiatives.length).toBeGreaterThan(1);
  });
});

describe("classifyInitiative title fallback", () => {
  const config = {
    ...DEFAULT_ALLOCATION_CONFIG,
    initiatives: { "scope:northstar": "Northstar", "app: hub": "Hub" },
  };

  it("matches a configured initiative named in an unlabeled title", () => {
    expect(classifyInitiative(
      { title: "Fix Northstar scheduled brief recovery", labels: [], repository: "o/ohcpwm-apps" },
      config,
    )).toBe("Northstar");
  });

  it("uses title fallback before default initiative", () => {
    expect(classifyInitiative(
      { title: "Fix Northstar scheduled brief recovery", labels: [], repository: "o/unmapped" },
      { ...config, defaultInitiative: "Platform" },
    )).toBe("Northstar");
  });

  it("prefers labels over names in the title", () => {
    expect(classifyInitiative(
      { title: "Preload Northstar data", labels: ["app: hub"], repository: "o/r" },
      config,
    )).toBe("Hub");
  });

  it("does not match partial words", () => {
    expect(classifyInitiative(
      { title: "Update hubspot sync", labels: [], repository: "o/ohcpwm-apps" },
      config,
    )).toBe("Ohcpwm Apps");
  });
});

describe("impact badges", () => {
  const only = (hours: number, labels: string[] = []) =>
    computeAllocation(data({ pullRequests: [pr({ labels })] }, hours)).initiatives[0].shipped[0];

  it("exposes the thresholds", () => {
    expect(MAJOR_IMPACT_HOURS).toBe(24);
    expect(NOTABLE_IMPACT_HOURS).toBe(12);
  });

  it("sets effortHours (rounded 0.1) and thresholds impact", () => {
    expect(only(30)).toMatchObject({ effortHours: 30, impact: "major" });
    expect(only(24)).toMatchObject({ impact: "major" });
    expect(only(23.9)).toMatchObject({ impact: "notable" });
    expect(only(12)).toMatchObject({ impact: "notable" });
    const small = only(11.94);
    expect(small.effortHours).toBe(11.9);
    expect(small.impact).toBeUndefined();
  });

  it("splits effort across PRs proportionally", () => {
    const a = computeAllocation(data({
      pullRequests: [pr({ url: "a", additions: 100, deletions: 0 }), pr({ url: "b", additions: 100, deletions: 0 })],
    }, 20));
    expect(a.initiatives[0].shipped.map((i) => i.effortHours)).toEqual([10, 10]);
  });

  it("lets labels raise impact", () => {
    for (const label of ["impact: major", "Priority:High", "severity : critical", "impact: p0", "priority: p1", "major", "Critical"]) {
      expect(only(1, [label]).impact, label).toBe("major");
    }
    expect(only(1, ["impact: nope"]).impact).toBeUndefined();
  });

  it("lets minor/low labels force no badge", () => {
    expect(only(40, ["impact: minor"]).impact).toBeUndefined();
    expect(only(40, ["Impact: Low"]).impact).toBeUndefined();
    expect(only(40, ["impact: low", "impact: major"]).impact).toBeUndefined();
    expect(deriveImpact(40, ["priority: low"])).toBeUndefined();
  });

  it("sorts shipped and in-progress by effort desc, undefined last, stable", () => {
    const a = computeAllocation(data({
      pullRequests: [
        pr({ url: "small", title: "Small", additions: 10, deletions: 0 }),
        pr({ url: "big", title: "Big", additions: 2000, deletions: 0 }),
        pr({ url: "small2", title: "Small2", additions: 10, deletions: 0 }),
        pr({ url: "o1", state: "open", title: "Open small", additions: 10, deletions: 0 }),
        pr({ url: "o2", state: "open", title: "Open big", additions: 2000, deletions: 0 }),
      ],
    }, 50));
    const b = a.initiatives[0];
    expect(b.shipped.map((i) => i.url)).toEqual(["big", "small", "small2"]);
    expect(b.inProgress.map((i) => i.url)).toEqual(["o2", "o1"]);
  });

  it("puts items without effort last", () => {
    const m = mergeAllocations([{
      ...computeAllocation(data({ pullRequests: [pr({ url: "x" })] }, 5)),
    }]);
    const noEffort = { ...m, initiatives: [{ ...m.initiatives[0], shipped: [
      { kind: "pr" as const, title: "none", url: "n" },
      { ...m.initiatives[0].shipped[0] },
    ] }] };
    expect(mergeAllocations([noEffort]).initiatives[0].shipped.map((i) => i.url)).toEqual(["x", "n"]);
  });

  it("sums effort for the same PR across days and recomputes impact", () => {
    const day = (hours: number) => computeAllocation(data({ pullRequests: [pr({ url: "p" })] }, hours));
    const d1 = day(5);
    const m = mergeAllocations([d1, day(5), day(6)]);
    const item = m.initiatives[0].shipped[0];
    expect(item.effortHours).toBe(16);
    expect(item.impact).toBe("notable");
    expect(d1.initiatives[0].shipped[0].effortHours).toBe(5);
    expect(mergeAllocations([day(12), day(13)]).initiatives[0].shipped[0].impact).toBe("major");
  });

  it("keeps a label-derived impact when merging", () => {
    const d = (hours: number) => computeAllocation(data({ pullRequests: [pr({ url: "p", labels: ["impact: critical"] })] }, hours));
    const item = mergeAllocations([d(1), d(1)]).initiatives[0].shipped[0];
    expect(item.effortHours).toBe(2);
    expect(item.impact).toBe("major");
  });
});

describe("PR #4 review fixes", () => {
  it("gives no allocation weight to an in-progress PR without the user's work in the window", () => {
    // Updated by someone else today: listed in prsInProgress, no workCommits, not opened/merged today.
    const touched = pr({ url: "touched", title: "Pricing tiers", state: "open", additions: 30_000, deletions: 0, labels: ["app: pricing"] });
    const worked = pr({ url: "worked", title: "Hub nav", state: "open", labels: ["app: hub"],
      workCommits: [{ sha: "s1", message: "feat: nav", additions: 50, deletions: 0 }] as PullRequest["workCommits"], workAdditions: 50, workDeletions: 0 });
    const a = computeAllocation(data({ prsInProgress: [touched, worked] }, 10));
    const pricing = a.initiatives.find((b) => b.initiative === "Pricing")!;
    const hub = a.initiatives.find((b) => b.initiative === "Hub")!;
    expect(hub.hours).toBe(10);
    expect(pricing.hours).toBe(0);
    // Still listed so the reader sees it is in progress.
    expect(pricing.inProgress.map((i) => i.url)).toEqual(["touched"]);
    expect(pricing.inProgress[0]!.effortHours).toBe(0);
  });

  it("still weights in-progress PRs opened in the window (they are in pullRequests)", () => {
    const opened = pr({ url: "opened", state: "open", labels: ["app: pricing"] });
    const a = computeAllocation(data({ pullRequests: [opened], prsInProgress: [opened] }, 8));
    expect(a.initiatives.find((b) => b.initiative === "Pricing")!.hours).toBe(8);
  });

  it("allocates closed worked-on PRs as other items and excludes their commits from direct work", () => {
    const closed = pr({ url: "closed", title: "fix: pricing validation", state: "closed", labels: ["app: pricing"],
      workCommits: [{ sha: "closed-sha", message: "fix", url: "commit", authoredAt: "2026-10-07T12:00:00Z" }],
      workAdditions: 20, workDeletions: 2, workFiles: ["src/pricing.ts"] });
    const allocation = computeAllocation(data({
      prsWorkedOnClosed: [closed],
      commitMessages: [{ repo: "o/app", messages: ["fix"], commits: [{ sha: "closed-sha", message: "fix", url: "commit", authoredAt: "2026-10-07T12:00:00Z" }] }],
    }, 10));
    const pricing = allocation.initiatives.find((bucket) => bucket.initiative === "Pricing")!;
    expect(pricing.other).toMatchObject([{ url: "closed", state: "closed", effortHours: 10 }]);
    expect(allocation.initiatives.flatMap((bucket) => bucket.other).filter((item) => item.kind === "commits")).toHaveLength(0);
  });

  it("carries in-progress effort into the item once the PR ships later in the period", () => {
    const open = (hours: number) => computeAllocation(data({ prsInProgress: [pr({ url: "p", state: "open", mergedAt: null,
      workCommits: [{ sha: `s${hours}`, message: "feat: x", additions: 100, deletions: 0 }] as PullRequest["workCommits"], workAdditions: 100, workDeletions: 0 })] }, hours));
    const merged = computeAllocation(data({ pullRequests: [pr({ url: "p", state: "merged" })] }, 6));
    const m = mergeAllocations([open(10), open(10), merged]);
    const bucket = m.initiatives[0]!;
    expect(bucket.inProgress).toEqual([]);
    expect(bucket.shipped).toHaveLength(1);
    expect(bucket.shipped[0]).toMatchObject({ url: "p", effortHours: 26, impact: "major" });
  });

  it("moves cross-initiative in-progress totals to the shipped initiative", () => {
    const inProgress = pr({ url: "p", title: "feat: hub", state: "open", mergedAt: null });
    const open = computeAllocation(data({ pullRequests: [inProgress], prsInProgress: [inProgress] }, 10));
    const merged = computeAllocation(data({ pullRequests: [pr({ url: "p", title: "feat: hub", labels: ["app: hub"] })] }, 6));
    const m = mergeAllocations([open, merged]);
    expect(m.totalHours).toBe(16);
    expect(m.initiatives.map((b) => b.initiative)).toEqual(["Hub"]);
    expect(m.initiatives[0]).toMatchObject({ hours: 16, byWorkType: { "new-capability": 16 } });
    expect(m.initiatives[0]!.shipped).toMatchObject([{ url: "p", effortHours: 16 }]);
    expect(m.workTypes).toMatchObject([{ workType: "new-capability", hours: 16, share: 1 }]);
    expect(m.initiatives.reduce((sum, b) => sum + b.share, 0)).toBeCloseTo(1, 5);
  });

  it("moves each daily work type without consuming other PRs' effort", () => {
    const day = (title: string, initiative: string, hours: number, extra = false) => {
      const p = pr({ url: "p", title, state: "open", labels: [`app: ${initiative}`] });
      const prs = extra ? [p, pr({ url: "q", title: "feat: unrelated", state: "open", labels: ["app: a"] })] : [p];
      return computeAllocation(data({ pullRequests: prs }, hours));
    };
    const merged = mergeAllocations([day("feat: original", "a", 4, true), day("fix: updated", "a", 3), day("fix: updated", "b", 5)]);
    expect(merged.initiatives.find((b) => b.initiative === "A")).toMatchObject({ hours: 2, byWorkType: { "new-capability": 2 } });
    expect(merged.initiatives.find((b) => b.initiative === "B")).toMatchObject({ hours: 10, byWorkType: { "new-capability": 2, quality: 8 } });
    expect(merged.workTypes).toEqual(expect.arrayContaining([expect.objectContaining({ workType: "new-capability", hours: 4 }), expect.objectContaining({ workType: "quality", hours: 8 })]));
  });

  it("conserves total hours when rounded PR efforts move to another initiative", () => {
    const day = (initiative: string, state: "open" | "merged", hours: number) => computeAllocation(data({
      pullRequests: ["1", "2", "3"].map((id) => pr({ url: id, title: `feat: ${id}`, state, labels: [`app: ${initiative}`], additions: 1, deletions: 0 })),
    }, hours));
    const merged = mergeAllocations([day("alpha", "open", 0.2), day("beta", "merged", 0.3)]);
    expect(merged.totalHours).toBe(0.5);
    expect(merged.initiatives.reduce((sum, bucket) => sum + bucket.hours, 0)).toBeCloseTo(0.5);
    expect(merged.workTypes.find((type) => type.workType === "new-capability")?.hours).toBe(0.5);
    const serialized = [day("alpha", "open", 0.2), day("beta", "merged", 0.3)].map((allocation) => JSON.parse(JSON.stringify(allocation)) as typeof allocation);
    expect(mergeAllocations(serialized).totalHours).toBe(0.5);
  });

  it("retains unrelated same-type work when rounded PR items move", () => {
    const prs = (initiative: string, state: "open" | "merged") => ["1", "2", "3"].map((url) =>
      pr({ url, title: "feat: work", state, labels: [`app: ${initiative}`], additions: 1, deletions: 0 }));
    const first = computeAllocation(data({
      pullRequests: prs("alpha", "open"),
      commitMessages: [{ repo: "o/alpha", messages: ["feat: unrelated"] }],
    }, 0.3));
    const second = computeAllocation(data({ pullRequests: prs("beta", "merged") }, 0.3));
    const merged = mergeAllocations([first, second]);
    expect(merged.totalHours).toBe(0.6);
    expect(merged.initiatives.find((bucket) => bucket.initiative === "Alpha")).toMatchObject({
      hours: 0.1, byWorkType: { "new-capability": 0.1 },
      other: [expect.objectContaining({ kind: "commits" })],
    });
    expect(merged.initiatives.find((bucket) => bucket.initiative === "Beta")).toMatchObject({
      hours: 0.5, byWorkType: { "new-capability": 0.5 },
    });
  });

  it("shares rounded source effort across multiple moves and keeps unrelated work", () => {
    const item = (url: string, initiative: string, title = "feat: work", state: "open" | "merged" = "open") =>
      pr({ url, title, state, labels: [`app: ${initiative}`], additions: 1, deletions: 0 });
    const allocation = (pullRequests: PullRequest[], hours: number) => computeAllocation(data({ pullRequests }, hours));
    const merged = mergeAllocations([
      allocation([item("1", "alpha"), item("2", "alpha"), item("3", "alpha")], 0.2),
      allocation([item("unrelated", "alpha")], 0.2),
      allocation([item("quality", "alpha", "fix: bug")], 0.2),
      allocation([item("1", "beta"), item("2", "beta"), item("3", "beta")], 0.3),
      allocation([item("1", "gamma", "fix: bug", "merged")], 0.1),
    ]);
    expect(merged.totalHours).toBe(1);
    expect(merged.initiatives.reduce((sum, bucket) => sum + bucket.hours, 0)).toBeCloseTo(1);
    expect(merged.initiatives.find((bucket) => bucket.initiative === "Alpha")).toMatchObject({
      hours: 0.4, byWorkType: { "new-capability": 0.2, quality: 0.2 },
    });
    expect(merged.initiatives.find((bucket) => bucket.initiative === "Beta")).toMatchObject({
      hours: 0.3, byWorkType: { "new-capability": 0.3 },
    });
    expect(merged.initiatives.find((bucket) => bucket.initiative === "Gamma")).toMatchObject({
      hours: 0.3, byWorkType: { "new-capability": 0.2, quality: 0.1 },
    });
    expect(merged.workTypes).toEqual(expect.arrayContaining([
      expect.objectContaining({ workType: "new-capability", hours: 0.7 }),
      expect.objectContaining({ workType: "quality", hours: 0.3 }),
    ]));
  });

  it("uses latest PR title and labels while accumulating effort and files", () => {
    const day = (title: string, labels: string[], file: string, state: "open" | "merged" = "open") =>
      computeAllocation(data({ pullRequests: [pr({ url: "p", title, state, labels, workFiles: [file] })] }, 4));
    const merged = mergeAllocations([
      day("WIP: dashboard", ["app: hub", "impact: low", "prototype"], "old.ts"),
      day("feat: dashboard", ["app: hub"], "new.ts"),
      day("fix: dashboard", ["app: hub"], "last.ts", "merged"),
    ]);
    const item = merged.initiatives[0]!.shipped[0]!;
    expect(item).toMatchObject({ title: "fix: dashboard", labels: ["app: hub"], effortHours: 12, impact: "notable" });
    expect(item.files?.sort()).toEqual(["last.ts", "new.ts", "old.ts"]);
    const openOnly = mergeAllocations([day("WIP: dashboard", ["app: hub", "prototype"], "old.ts"), day("feat: dashboard", ["app: hub"], "new.ts")]);
    expect(openOnly.initiatives[0]!.inProgress[0]).toMatchObject({ title: "feat: dashboard", labels: ["app: hub"], effortHours: 8 });
  });

  it("consolidates an open PR under its latest initiative", () => {
    const open = (initiative: string, hours: number) => {
      const p = pr({ url: "p", title: "feat: hub", state: "open", mergedAt: null, labels: [`app: ${initiative.toLowerCase()}`] });
      return computeAllocation(data({ pullRequests: [p], prsInProgress: [p] }, hours));
    };
    const m = mergeAllocations([open("App", 10), open("Hub", 6)]);
    expect(m.totalHours).toBe(16);
    expect(m.initiatives).toHaveLength(1);
    expect(m.initiatives[0]).toMatchObject({ initiative: "Hub", hours: 16, byWorkType: { "new-capability": 16 } });
    expect(m.initiatives[0]!.inProgress).toMatchObject([{ url: "p", effortHours: 16 }]);
  });

  it("consolidates closed and open copies under the latest initiative", () => {
    const appearance = (initiative: string, state: "open" | "closed", hours: number) => {
      const p = pr({ url: "p", title: "feat: hub", state, mergedAt: null, labels: [`app: ${initiative.toLowerCase()}`] });
      return computeAllocation(state === "open"
        ? data({ pullRequests: [p], prsInProgress: [p] }, hours)
        : data({ prsWorkedOnClosed: [p] }, hours));
    };
    const m = mergeAllocations([appearance("A", "closed", 2), appearance("A", "open", 3), appearance("B", "closed", 5)]);
    expect(m.totalHours).toBe(10);
    expect(m.initiatives).toHaveLength(1);
    expect(m.initiatives[0]).toMatchObject({ initiative: "B", hours: 10, byWorkType: { "new-capability": 10 } });
    expect(m.initiatives[0]!.inProgress).toEqual([]);
    expect(m.initiatives[0]!.other).toMatchObject([{ url: "p", state: "closed", effortHours: 10 }]);
  });

  it("subtracts moved effort from the old initiative while retaining its other work", () => {
    const inProgress = [
      pr({ url: "p", title: "feat: hub", state: "open", mergedAt: null }),
      pr({ url: "q", title: "feat: other", state: "open", mergedAt: null }),
    ];
    const open = computeAllocation(data({ pullRequests: inProgress, prsInProgress: inProgress }, 10));
    const merged = computeAllocation(data({ pullRequests: [pr({ url: "p", title: "feat: hub", labels: ["app: hub"] })] }, 6));
    const m = mergeAllocations([open, merged]);
    const app = m.initiatives.find((b) => b.initiative === "App")!;
    const hub = m.initiatives.find((b) => b.initiative === "Hub")!;
    expect(app).toMatchObject({ hours: 5, byWorkType: { "new-capability": 5 } });
    expect(app.inProgress.map((item) => item.url)).toEqual(["q"]);
    expect(hub).toMatchObject({ hours: 11, byWorkType: { "new-capability": 11 } });
    expect(m.totalHours).toBe(16);
    expect(m.initiatives.reduce((sum, b) => sum + b.share, 0)).toBeCloseTo(1, 5);
  });

  it("keeps an impact: low override when merged days cross the badge threshold", () => {
    const day = () => computeAllocation(data({ pullRequests: [pr({ url: "p", labels: ["impact: low"] })] }, 10));
    const m = mergeAllocations([day(), day(), day()]);
    expect(m.initiatives[0]!.shipped[0]!.effortHours).toBe(30);
    expect(m.initiatives[0]!.shipped[0]!.impact).toBeUndefined();
  });

  it("keeps an impact: minor override when in-progress effort moves onto the shipped item", () => {
    const labels = ["impact: minor"];
    const open = computeAllocation(data({ pullRequests: [pr({ url: "p", state: "open", labels })] }, 20));
    const shipped = computeAllocation(data({ pullRequests: [pr({ url: "p", labels })] }, 20));
    const item = mergeAllocations([open, shipped]).initiatives[0]!.shipped[0]!;
    expect(item.effortHours).toBe(40);
    expect(item.impact).toBeUndefined();
  });
});
