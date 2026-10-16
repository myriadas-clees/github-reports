import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  ALLOCATION_VERSION,
  DEFAULT_ALLOCATION_CONFIG,
  MAJOR_IMPACT_HOURS,
  NOTABLE_IMPACT_HOURS,
  deriveImpact,
  buildAllocationTrend,
  classifyInitiative,
  classifyWorkType,
  computeAllocation,
  mergeAllocations,
} from "./allocation.js";
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
  it("label precedence beats scope and repo", () => {
    const c = cfg({ initiatives: { "scope:a": "A", "repo:Org/ohcpwm-apps": "R" } });
    expect(classifyInitiative({ ...base, title: "feat(a): x", labels: ["app: z"] }, c)).toBe("Z");
  });
});

describe("computeAllocation", () => {
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

  it("puts the target in the default initiative when nothing has weight", () => {
    const a = computeAllocation(data({}, 8), cfg({ defaultInitiative: "Platform" }));
    expect(a.initiatives).toHaveLength(1);
    expect(a.initiatives[0]).toMatchObject({ initiative: "Platform", hours: 8 });
    expect(a.workTypes[0].workType).toBe("maintenance");
    expect(computeAllocation(data({}, 8)).initiatives[0].initiative).toBe("General engineering");
    expect(computeAllocation(data({}, 0)).initiatives).toEqual([]);
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

  it("puts Wednesday in the prior Thursday's week and Thursday in a new one", () => {
    // 2026-10-07 is a Wednesday; 2026-10-08 is a Thursday.
    const t = buildAllocationTrend(
      [report("2026-10-07"), report("2026-10-08"), report("2026-10-01")],
      "2026-10-08",
      cfg({ trendWeeks: 2 }),
    );
    expect(t.periods.map((p) => [p.id, p.from, p.to, p.days])).toEqual([
      ["2026-10-01", "2026-10-01", "2026-10-07", 2],
      ["2026-10-08", "2026-10-08", "2026-10-14", 1],
    ]);
    expect(t.periods[0].allocation.totalHours).toBe(8);
    expect(t.periods[0].label).toBe("Oct 1-7");
  });

  it("produces exactly trendWeeks periods, oldest first, with empty gaps", () => {
    const t = buildAllocationTrend([report("2026-10-07")], "2026-10-07", cfg({ trendWeeks: 4 }));
    expect(t.periods).toHaveLength(4);
    expect(t.periods.map((p) => p.id)).toEqual(["2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01"]);
    expect(t.periods[0]).toMatchObject({ days: 0 });
    expect(t.periods[0].allocation.totalHours).toBe(0);
    expect(t.periods[3].days).toBe(1);
  });

  it("excludes reports after endDate", () => {
    const t = buildAllocationTrend([report("2026-10-07"), report("2026-10-09")], "2026-10-07", cfg({ trendWeeks: 1 }));
    expect(t.periods[0].days).toBe(1);
    expect(t.periods[0].allocation.totalHours).toBe(4);
  });

  it("handles year boundaries", () => {
    // 2026-01-01 is a Thursday; 2025-12-31 is a Wednesday.
    const t = buildAllocationTrend(
      [report("2025-12-31"), report("2026-01-02")],
      "2026-01-02",
      cfg({ trendWeeks: 2 }),
    );
    expect(t.periods.map((p) => [p.from, p.to, p.days])).toEqual([
      ["2025-12-25", "2025-12-31", 1],
      ["2026-01-01", "2026-01-07", 1],
    ]);
    expect(t.periods[0].label).toBe("Dec 25-31");
  });

  it("includes manual entries on days without reports, without double counting", () => {
    const manual: ManualTimeEntry[] = [
      { date: "2026-10-07", initiative: "Ops", hours: 2 }, // has a report
      { date: "2026-10-04", initiative: "Ops", hours: 3 }, // Sunday, no report
      { date: "2026-10-12", initiative: "Ops", hours: 9 }, // after endDate
      { date: "2026-09-26", initiative: "Ops", hours: 1 }, // previous week, no report
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
