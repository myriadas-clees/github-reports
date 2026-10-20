import { describe, it, expect } from "vitest";
import {
  buildAllocationView,
  type AllocationView,
  formatWorkDelivered,
  MAX_VISIBLE_SHIPPED,
  formatPercent,
  MAX_INITIATIVE_COLORS,
  buildInitiativeMix,
  OTHER_LABEL,
} from "./allocation-view.js";
import { emptyAllocation, makeAllocation, makeTrend } from "./allocation-fixtures.js";

const WT: [import("../types.js").WorkType, string, number][] = [
  ["new-capability", "New capability", 24],
  ["quality", "Quality & bug fixes", 6],
  ["unlogged", "Meetings & unlogged (self-reported)", 4],
];

const week = makeAllocation(
  [
    ["Pricing", 14, {
      shipped: [{ kind: "pr", title: "Add tiers", url: "https://github.com/o/r/pull/1", repository: "o/r", state: "merged" }],
      inProgress: [{ kind: "pr", title: "Annual plans", url: "https://github.com/o/r/pull/2", state: "open" }],
      other: [
        { kind: "review", title: "Review: billing", url: "https://github.com/o/r/pull/3" },
        { kind: "manual", title: "Planning" },
      ],
    }],
    ["Hub", 12],
    ["Platform", 8],
  ],
  WT,
  { manualHours: 4 },
);

const weekPanel = (v: AllocationView) => v.panels.find((p) => p.kind === "week")!;
const dayPanel = (v: AllocationView) => v.panels.find((p) => p.kind === "day")!;

describe("formatters", () => {
  it("formats work delivered in engineer-days only, never weeks", () => {
    expect(formatWorkDelivered(510)).toEqual({ short: "~64 days", long: "about 64 engineer-days", plain: "about 64 days" });
    expect(formatWorkDelivered(93)).toEqual({ short: "~12 days", long: "about 12 engineer-days", plain: "about 12 days" });
    expect(formatWorkDelivered(36)).toEqual({ short: "~4.5 days", long: "about 4.5 engineer-days", plain: "about 4.5 days" });
    expect(formatWorkDelivered(4)).toEqual({ short: "~0.5 days", long: "about 0.5 engineer-days", plain: "about 0.5 days" });
    expect(formatWorkDelivered(0).long).toBe("about 0.5 engineer-days");
    expect(formatWorkDelivered(Number.NaN).short).toBe("~0.5 days");
    expect(formatWorkDelivered(79).long).toBe("about 10 engineer-days");
    expect(formatWorkDelivered(80).long).toBe("about 10 engineer-days");
  });
  it("uses singular forms for exactly one and thousands separators", () => {
    expect(formatWorkDelivered(8)).toEqual({ short: "~1 day", long: "about 1 engineer-day", plain: "about 1 day" });
    expect(formatWorkDelivered(8.3).long).toBe("about 1 engineer-day");
    expect(formatWorkDelivered(1000).long).toBe("about 125 engineer-days");
    expect(formatWorkDelivered(10272).long).toBe("about 1,284 engineer-days");
    expect(formatWorkDelivered(40).long).toBe("about 5 engineer-days");
  });
  it("formats percents", () => {
    expect(formatPercent(0.42)).toBe("42%");
    expect(formatPercent(0.004)).toBe("<1%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("buildAllocationView", () => {
  it("returns undefined without data or with zero totals", () => {
    expect(buildAllocationView(undefined)).toBeUndefined();
    expect(buildAllocationView({})).toBeUndefined();
    expect(buildAllocationView({ day: emptyAllocation(), week: { label: "x", allocation: emptyAllocation() } })).toBeUndefined();
    expect(buildAllocationView({
      trend: makeTrend(["A"], [{ label: "w", days: 0, allocation: emptyAllocation() }]),
    })).toBeUndefined();
  });

  it("builds the week bar, lede and legend", () => {
    const v = buildAllocationView({ week: { label: "Oct 1–7", allocation: week } })!;
    expect(v.title).toBe("Where the effort went");
    const w = weekPanel(v);
    expect(w.lede).toBe("Work delivered in the week of Oct 1–7 would typically take one engineer about 4.5 days without AI assistance. Here's where it went across 3 initiatives.");
    const names = w.bar.segments.map((s) => s.name);
    expect(names).toEqual(["Pricing", "Hub", "Platform"]);
    const pricing = w.bar.segments[0]!;
    expect(pricing.percent).toBe("41%");
    expect(pricing.title).toBe("Pricing: 41% of work delivered");
    expect(pricing.colorClass).toBe("alloc-c1");
    expect(w.bar.ariaLabel).toContain("Pricing 41%");
    expect(w.legend).toHaveLength(3);
  });

  it("uses singular wording for one initiative", () => {
    const v = buildAllocationView({ week: { label: "w", allocation: makeAllocation([["Solo", 5]]) } })!;
    expect(weekPanel(v).lede).toContain("across 1 initiative.");
  });

  it("falls back to day wording when there is no week", () => {
    const v = buildAllocationView({ day: makeAllocation([["A", 6]]) })!;
    expect(v.panels).toHaveLength(1);
    expect(v.hasSwitch).toBe(false);
    expect(v.script).toBe("");
    expect(v.panels[0]).toMatchObject({ kind: "day", label: "Today", isDefault: true });
    expect(v.panels[0]!.lede).toBe("Work delivered today would typically take one engineer about 1 day without AI assistance. Here's where it went across 1 initiative.");
  });

  it("builds the work type bar with its own palette", () => {
    const v = buildAllocationView({ week: { label: "w", allocation: week } })!;
    const classes = weekPanel(v).workTypeBar!.segments.map((s) => s.colorClass);
    expect(classes).toEqual(["alloc-w1", "alloc-w2", "alloc-wn"]);
    expect(weekPanel(v).workTypes[0]!.title).toBe("New capability: 71% of work delivered");
  });

  it("omits the work type bar when there are no work types", () => {
    const v = buildAllocationView({ week: { label: "w", allocation: makeAllocation([["A", 3]]) } })!;
    expect(weekPanel(v).workTypeBar).toBeUndefined();
  });

  it("hides inline labels for tiny segments but still renders them", () => {
    const a = makeAllocation([["Big", 97], ["Small", 2], ["Tiny", 0.2]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!;
    const [big, small, tiny] = weekPanel(v).bar.segments;
    expect(big!.showLabel).toBe(true);
    expect(big!.showName).toBe(true);
    expect(small!.showLabel).toBe(false);
    expect(tiny!.showLabel).toBe(false);
    expect(tiny!.percent).toBe("<1%");
    expect(tiny!.title).toBe("Tiny: <1% of work delivered");
    expect(Number(tiny!.grow)).toBeGreaterThan(0);
  });

  it("builds per-initiative list with items and self-reported labelling", () => {
    const v = buildAllocationView({ week: { label: "w", allocation: week } })!;
    const pricing = weekPanel(v).initiatives[0]!;
    expect(pricing.name).toBe("Pricing");
    expect(pricing.hasShipped && pricing.hasInProgress && pricing.hasOther).toBe(true);
    expect(pricing.shipped[0]).toMatchObject({ title: "Add tiers", url: "https://github.com/o/r/pull/1" });
    expect(pricing.otherCount).toBe(2);
    expect(pricing.hasSelfReported).toBe(true);
    expect(pricing.other.find((i) => i.kindLabel === "Self-reported")!.selfReported).toBe(true);
    expect(pricing.width).toBe("41.18%");
    expect(weekPanel(v).initiatives[1]!.isEmpty).toBe(true);
  });

  it("drops non-http urls from items", () => {
    const a = makeAllocation([["A", 1, { shipped: [{ kind: "pr", title: "x", url: "javascript:alert(1)" }] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!;
    expect(weekPanel(v).initiatives[0]!.shipped[0]!.url).toBeUndefined();
  });

  it("skips today when identical to the week", () => {
    const same = buildAllocationView({ day: week, week: { label: "w", allocation: week } })!;
    expect(same.panels).toHaveLength(1);
    expect(same.panels[0]!.kind).toBe("week");
    expect(same.hasSwitch).toBe(false);
    expect(same.script).toBe("");
    const different = makeAllocation([["Pricing", 6], ["Hub", 2]]);
    const v = buildAllocationView({ day: different, week: { label: "w", allocation: week } })!;
    expect(v.panels).toHaveLength(2);
    expect(v.hasSwitch).toBe(true);
    expect(dayPanel(v).bar.segments[0]!.colorClass).toBe("alloc-c1");
  });

  it("skips today when it has no hours", () => {
    const v = buildAllocationView({ day: emptyAllocation(), week: { label: "w", allocation: week } })!;
    expect(v.panels.map((p) => p.kind)).toEqual(["week"]);
    expect(v.hasSwitch).toBe(false);
  });

  it("assigns colors by trend order and folds extras into Other", () => {
    const names = Array.from({ length: 11 }, (_, i) => `I${i + 1}`);
    const a = makeAllocation(names.map((n, i) => [n, 20 - i] as [string, number]));
    const trend = makeTrend(names, [{ label: "w1", days: 5, allocation: a }]);
    const v = buildAllocationView({ week: { label: "w1", allocation: a }, trend })!;
    expect(MAX_INITIATIVE_COLORS).toBe(9);
    const seg = weekPanel(v).bar.segments;
    expect(seg).toHaveLength(10);
    expect(seg[9]).toMatchObject({ name: "Other", colorClass: "alloc-other", isOther: true });
    expect(seg[9]!.value).toBe(21); // I10 (11) + I11 (10)
  });

  it("keeps all initiatives in the list even when bars fold them", () => {
    const names = Array.from({ length: 11 }, (_, i) => `I${i + 1}`);
    const a = makeAllocation(names.map((n, i) => [n, 20 - i] as [string, number]));
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!;
    const inits = weekPanel(v).initiatives;
    expect(inits).toHaveLength(11);
    expect(inits[10]!.colorClass).toBe("alloc-other");
    expect(inits[0]!.colorClass).toBe("alloc-c1");
  });

  it("keeps colors consistent between week, day and trend", () => {
    const wk = makeAllocation([["Hub", 10], ["Pricing", 5]]);
    const dy = makeAllocation([["Pricing", 3], ["Hub", 1]]);
    const trend = makeTrend(["Pricing", "Hub"], [
      { label: "w1", days: 5, allocation: makeAllocation([["Pricing", 4], ["Hub", 4]]) },
      { label: "w2", days: 5, allocation: wk },
    ]);
    const v = buildAllocationView({ day: dy, week: { label: "w2", allocation: wk }, trend })!;
    const cls = (segs: { name: string; colorClass: string }[], n: string) => segs.find((s) => s.name === n)!.colorClass;
    expect(cls(weekPanel(v).bar.segments, "Pricing")).toBe("alloc-c1");
    expect(cls(dayPanel(v).bar.segments, "Pricing")).toBe("alloc-c1");
    expect(cls(v.trendRows[0]!.bar.segments, "Pricing")).toBe("alloc-c1");
    expect(cls(v.trendRows[1]!.bar.segments, "Hub")).toBe("alloc-c2");
    expect(weekPanel(v).initiatives.find((i) => i.name === "Hub")!.colorClass).toBe("alloc-c2");
  });

  describe("trend", () => {
    const trend = makeTrend(["Pricing", "Hub"], [
      { label: "Sep 3–9", days: 0, allocation: emptyAllocation() },
      { label: "Sep 10–16", days: 5, allocation: makeAllocation([["Hub", 6], ["Pricing", 2]]) },
      { label: "Sep 17–23", days: 2, allocation: emptyAllocation() },
      { label: "Sep 24–30", days: 4, allocation: makeAllocation([["Pricing", 10]]) },
    ]);
    const v = buildAllocationView({ trend })!;

    it("keeps chronological order and flags the last row current", () => {
      expect(v.hasTrend).toBe(true);
      expect(v.trendRows.map((r) => r.label)).toEqual(["Sep 3–9", "Sep 10–16", "Sep 17–23", "Sep 24–30"]);
      expect(v.trendRows.map((r) => r.isCurrent)).toEqual([false, false, false, true]);
    });
    it("shows self-reported effort in a week with no daily reports", () => {
      const manualOnly = buildAllocationView({ trend: makeTrend(["Hub"], [
        { label: "Sep 3–9", days: 0, allocation: makeAllocation([["Hub", 8]]) },
      ]) })!;
      expect(manualOnly.trendRows[0]).toMatchObject({ hasReports: false, total: "~1 day" });
      expect(manualOnly.trendRows[0]!.bar.segments.map((s) => s.name)).toEqual(["Hub"]);
    });
    it("marks empty weeks", () => {
      expect(v.trendRows[0]).toMatchObject({ hasReports: false, emptyText: "No reports", total: "" });
      expect(v.trendRows[0]!.bar.segments).toEqual([]);
      expect(v.trendRows[2]).toMatchObject({ hasReports: true, emptyText: "No estimated effort" });
    });
    it("orders trend segments by palette slot", () => {
      expect(v.trendRows[1]!.bar.segments.map((s) => s.name)).toEqual(["Pricing", "Hub"]);
      expect(v.trendRows[1]!.total).toBe("~1 day");
    });
    it("provides an accessible data table", () => {
      expect(v.trendTable!.headers).toEqual(["Work week", "Days", "Work delivered", "Pricing", "Hub"]);
      expect(v.trendTable!.rows[1]).toEqual({
        label: "Sep 10–16", days: 5, total: "~1 day", cells: ["25%", "75%"],
      });
      expect(v.trendTable!.rows[0]!.cells).toEqual(["-", "-"]);
    });
    it("builds a legend in trend order", () => {
      expect(v.trendLegend.map((l) => [l.name, l.colorClass])).toEqual([
        ["Pricing", "alloc-c1"],
        ["Hub", "alloc-c2"],
      ]);
    });
  });

  it("carries the note and the how-we-measure block", () => {
    const v = buildAllocationView({ week: { label: "w", allocation: week } })!;
    expect(v.note).toBe("Estimated from PR size and review activity.");
    expect(v.measureTitle).toBe("How we measure this");
    expect(v.measureNote).toContain("not actual hours worked or measured time saved");
    expect(v.measureNote).toContain("Items marked Self-reported");
  });

  it("exposes no hour figures anywhere in the view", () => {
    const trend = makeTrend(["Pricing", "Hub", "Platform"], [{ label: "Oct 1–7", days: 5, allocation: week }]);
    const v = buildAllocationView({ day: makeAllocation([["Pricing", 3]]), week: { label: "Oct 1–7", allocation: week }, trend })!;
    expect(JSON.stringify(v)).not.toMatch(/~\d+(\.\d+)?h\b/);
    expect(v.trendRows[0]!.total).toBe("~4.5 days");
  });
});

describe("buildAllocationView stakeholder polish", () => {
  const shippedPr = {
    kind: "pr" as const,
    title: "feat(transition): plan household outreach",
    url: "https://github.com/o/r/pull/1",
    state: "merged" as const,
  };
  const alloc = makeAllocation([["Transition", 10, { shipped: [shippedPr] }]]);
  const trend = makeTrend(["Transition"], [{ label: "Aug 1-7", days: 5, allocation: alloc }]);

  it("strips conventional-commit prefixes from PR titles", () => {
    const v = buildAllocationView({ week: { label: "Aug 1-7", allocation: alloc } });
    expect(v?.panels[0].initiatives[0].shipped[0].title).toBe("Plan household outreach");
  });

  it("marks the last trend week as so-far only while it is still open", () => {
    expect(buildAllocationView({ trend, asOf: "2026-08-05" })?.trendRows[0].isCurrent).toBe(true);
    expect(buildAllocationView({ trend, asOf: "2026-08-07" })?.trendRows[0].isCurrent).toBe(false);
  });
});

describe("buildAllocationView impact and shipped cap", () => {
  const prs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      kind: "pr" as const,
      title: `Item ${i + 1}`,
      url: `https://github.com/o/r/pull/${i + 1}`,
      state: "merged" as const,
      ...(i === 0 ? { impact: "major" as const, effortHours: 30 } : i === 1 ? { impact: "notable" as const, effortHours: 10 } : {}),
    }));

  it("passes impact badges through with labels", () => {
    const a = makeAllocation([["A", 10, { shipped: prs(3) }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!;
    const [first, second, third] = v.panels[0]!.initiatives[0]!.shipped;
    expect(first).toMatchObject({ impact: "major", impactLabel: "Large change" });
    expect(second).toMatchObject({ impact: "notable", impactLabel: "Substantial change" });
    expect(third!.impact).toBeUndefined();
    expect(v.panels[0]!.initiatives[0]!.hasShippedMore).toBe(false);
  });

  it("caps visible shipped items and folds the rest", () => {
    expect(MAX_VISIBLE_SHIPPED).toBe(8);
    const a = makeAllocation([["A", 10, { shipped: prs(11) }]]);
    const i = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.initiatives[0]!;
    expect(i.shipped).toHaveLength(8);
    expect(i.shippedMore).toHaveLength(3);
    expect(i.shippedMoreCount).toBe(3);
    expect(i.hasShippedMore).toBe(true);
    expect(i.shippedMore[0]!.title).toBe("Item 9");
  });

  it("does not fold exactly eight", () => {
    const a = makeAllocation([["A", 10, { shipped: prs(8) }]]);
    const i = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.initiatives[0]!;
    expect(i.hasShippedMore).toBe(false);
  });
});

describe("buildAllocationView day and week panels", () => {
  const dy = makeAllocation([["Pricing", 6], ["Hub", 2]]);
  const trend = makeTrend(["Pricing", "Hub", "Platform"], [{ label: "Oct 1–7", days: 5, allocation: week }]);
  // makeTrend: period 1 is 2026-08-01..2026-08-07
  const build = (asOf: string) =>
    buildAllocationView({ day: dy, week: { label: "Oct 1–7", allocation: week }, trend, asOf })!;

  it("orders day first as the default, then week", () => {
    const v = build("2026-08-05");
    expect(v.hasSwitch).toBe(true);
    expect(v.script).toContain("<script>");
    expect(v.panels.map((p) => [p.kind, p.isDefault])).toEqual([["day", true], ["week", false]]);
    expect(new Set(v.panels.map((p) => p.id)).size).toBe(2);
  });

  it("builds open-week ledes, headings and labels", () => {
    const [d, w] = build("2026-08-05").panels as [ReturnType<typeof dayPanel>, ReturnType<typeof weekPanel>];
    expect(d.label).toBe("Aug 5");
    expect(d.heading).toBe("Aug 5");
    expect(d.lede).toBe("Work delivered on Aug 5 would typically take one engineer about 1 day without AI assistance. Here's where it went across 2 initiatives.");
    expect(w.label).toBe("Oct 1–7 (so far)");
    expect(w.heading).toBe("Work week of Oct 1–7 (so far)");
    expect(w.lede).toBe("Work delivered this week so far (Oct 1–7) would typically take one engineer about 4.5 days without AI assistance. Here's where it went across 3 initiatives.");
  });

  it("builds closed-week wording once the week has ended", () => {
    const w = weekPanel(build("2026-08-07"));
    expect(w.label).toBe("Oct 1–7");
    expect(w.heading).toBe("Work week of Oct 1–7");
    expect(w.lede).toContain("Work delivered in the week of Oct 1–7 ");
  });

  it("labels the day panel Today without asOf", () => {
    const v = buildAllocationView({ day: dy, week: { label: "Oct 1–7", allocation: week } })!;
    expect(dayPanel(v).label).toBe("Today");
    expect(dayPanel(v).lede).toContain("Work delivered today ");
  });
});

describe("no-activity minimum day colors", () => {
  const NO_ACTIVITY = "No GitHub activity (minimum day)";

  it("is neutral gray with its own name and takes no palette slot", () => {
    const a = makeAllocation([["Hub", 10], [NO_ACTIVITY, 8]]);
    const mix = buildInitiativeMix(a, [NO_ACTIVITY, "Hub"], "size");
    const hub = mix.find((s) => s.name === "Hub")!;
    const idle = mix.find((s) => s.name === NO_ACTIVITY)!;
    expect(hub.colorClass).toBe("alloc-c1");
    expect(idle.colorClass).toBe("alloc-other");
    expect(idle.isOther).toBe(false);
    expect(mix.some((s) => s.name === OTHER_LABEL)).toBe(false);
  });

  it("stays named and gray even when the palette overflows into Other", () => {
    const names = Array.from({ length: 10 }, (_, i) => `Init ${i + 1}`);
    const a = makeAllocation([...names.map((n, i) => [n, 20 - i] as [string, number]), [NO_ACTIVITY, 1]]);
    const mix = buildInitiativeMix(a, [...names, NO_ACTIVITY], "size");
    expect(mix.find((s) => s.name === NO_ACTIVITY)).toMatchObject({ colorClass: "alloc-other", isOther: false });
    expect(mix.find((s) => s.name === OTHER_LABEL)).toMatchObject({ colorClass: "alloc-other", isOther: true });
    expect(mix.find((s) => s.name === "Init 10")).toBeUndefined();
  });

  it("gives the no-activity work type the neutral work-type class", () => {
    const a = makeAllocation([["Hub", 10]], [["no-activity", "No GitHub activity", 8]]);
    const week = weekPanel(buildAllocationView({ week: { label: "w", allocation: a } })!);
    expect(week.workTypes[0]).toMatchObject({ name: "No GitHub activity", colorClass: "alloc-wn" });
  });
});

describe("readiness, complexity and verification views", () => {
  const annotated = {
    kind: "pr" as const,
    title: "feat: Add tiers",
    url: "https://github.com/o/r/pull/1",
    state: "merged" as const,
    readiness: { stage: "live" as const, label: "Live", detail: "Live since Oct 8" },
    complexity: { level: "connected" as const, label: "Connected", reason: "Touches 2 areas: a, b", risks: ["Payments"] },
    checks: { automated: { passed: 3, failed: 0, pending: 0, total: 3 }, humanReviews: 0, automatedReviews: 1, testsUpdated: true },
  };
  const open = {
    kind: "pr" as const, title: "Draft thing", url: "https://github.com/o/r/pull/2", state: "open" as const,
    readiness: { stage: "in-review" as const, label: "In review" },
    checks: { automated: null, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
  };

  it("builds chips and checks text per item", () => {
    const a = makeAllocation([["A", 10, { shipped: [annotated], inProgress: [open] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!;
    const [item] = v.panels[0]!.initiatives[0]!.shipped;
    expect(item!.readiness).toMatchObject({ label: "Live", stage: "live", ariaLabel: "Live: Live since Oct 8" });
    expect(item!.stateLabel).toBe("Code integrated");
    expect(item!.complexity).toMatchObject({ level: "connected", hasRisks: true, risks: ["Payments"] });
    expect(item!.checksText).toBe("All 3 automated checks passed · 1 automated review · tests updated");
    expect(v.panels[0]!.initiatives[0]!.inProgress[0]!.checksText).toBe("Checks not collected");
  });

  it("never says all checks passed while some are still running", () => {
    const checks = (automated: { passed: number; failed: number; pending: number; total: number }) =>
      ({ kind: "pr" as const, title: "t", url: "https://github.com/o/r/pull/9", state: "open" as const,
        checks: { automated, humanReviews: 0, automatedReviews: 0, testsUpdated: false } });
    const a = makeAllocation([["A", 10, { inProgress: [
      checks({ passed: 2, failed: 0, pending: 1, total: 3 }),
      checks({ passed: 1, failed: 0, pending: 1, total: 2 }),
      checks({ passed: 1, failed: 1, pending: 0, total: 2 }),
      checks({ passed: 2, failed: 0, pending: 0, total: 2 }),
    ] }]]);
    const items = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.initiatives[0]!.inProgress;
    expect(items.map((i) => i.checksText)).toEqual([
      "2 of 3 automated checks passed · 1 still running",
      "1 of 2 automated checks passed · 1 still running",
      "1 of 2 automated checks passed",
      "Both automated checks passed",
    ]);
  });

  it("adds a still-running count to the verification checks line", () => {
    const pending = { ...open, title: "Still building", url: "https://github.com/o/r/pull/3", state: "open" as const,
      checks: { automated: { passed: 0, failed: 0, pending: 1, total: 1 }, humanReviews: 0, automatedReviews: 0, testsUpdated: false } };
    const a = makeAllocation([["A", 10, { shipped: [annotated], inProgress: [pending] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe("1 of 2 passed automated checks · 1 still running · 1 had automated code review · 1 included test updates");
  });

  it("summarizes verification lines", () => {
    const a = makeAllocation([["A", 10, { shipped: [annotated], inProgress: [open] }]]);
    a.aiFindingsAddressed = 5;
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.title).toBe("Checks behind this work");
    expect(v.readinessLine).toBe("Of 2 changes: 1 live · 1 in review");
    // The open PR in this fixture has no check evidence, so it is named as not collected.
    expect(v.checksLine).toBe("1 of 1 passed automated checks · 1 not collected · 1 had automated code review · 1 included test updates · 5 review findings addressed");
    expect(v.note).toContain("No process catches every bug");
  });

  it("groups the same facts as the lines, with tones only where evidence supports them", () => {
    const a = makeAllocation([["A", 10, { shipped: [annotated], inProgress: [open] }]]);
    a.aiFindingsAddressed = 5;
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.scope).toBe("2 changes");
    expect(v.groups).toEqual([
      { key: "readiness", heading: "Where the changes are", facts: [
        { value: "1", label: "live", tone: "positive" },
        { value: "1", label: "in review" },
      ] },
      { key: "checks", heading: "Automated checks", facts: [
        { value: "1 of 1", label: "passed automated checks" },
        { value: "1", label: "not collected", tone: "tentative" },
      ] },
      { key: "reviews", heading: "Reviews and tests", facts: [
        { value: "1", label: "had automated code review" },
        { value: "1", label: "included test updates" },
        { value: "5", label: "review findings addressed" },
      ] },
    ]);
  });

  it("marks uncollected checks as tentative and omits empty groups", () => {
    const a = makeAllocation([["A", 10, { shipped: [{ ...annotated, checks: undefined, readiness: undefined }] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.groups.map((g) => g.key)).toEqual(["readiness", "checks"]);
    expect(v.groups[0]!.facts).toEqual([{ value: "1", label: "code integrated" }]);
    expect(v.groups[1]!.facts).toEqual([{ label: "Automated check results not collected yet", tone: "tentative" }]);
  });

  it("describes integrated changes without implying they are live", () => {
    const integrated = { ...annotated, readiness: { stage: "awaiting-release" as const, label: "Code integrated · not live yet" } };
    const a = makeAllocation([["A", 10, { shipped: [integrated] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.readinessLine).toBe("Of 1 change: 1 code integrated, not live yet");
  });

  it("says checks were not collected when no automated data exists", () => {
    const a = makeAllocation([["A", 10, { shipped: [{ ...annotated, checks: undefined, readiness: undefined }] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe("Automated check results not collected yet");
  });

  it("keeps review, test and finding counts when no PR has automated checks", () => {
    const reviewed = {
      kind: "pr" as const, title: "Docs only", url: "https://github.com/o/r/pull/7", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: { passed: 0, failed: 0, pending: 0, total: 0 }, humanReviews: 1, automatedReviews: 0, testsUpdated: true },
    };
    const a = makeAllocation([["A", 10, { inProgress: [reviewed] }]]);
    a.aiFindingsAddressed = 3;
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe(
      "No automated checks ran on these changes · 1 had human review · 1 included test updates · 3 review findings addressed",
    );
  });

  it("keeps an automated review count when automated checks were not collected", () => {
    const reviewed = {
      kind: "pr" as const, title: "Reviewed", url: "https://github.com/o/r/pull/6", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: null, humanReviews: 0, automatedReviews: 1, testsUpdated: false },
    };
    const a = makeAllocation([["A", 10, { inProgress: [reviewed] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe("Automated check results not collected yet · 1 had automated code review");
  });

  it("summarizes a draft-only period", () => {
    const draft = (n: number, stage: "draft" | "prototype") => ({
      kind: "pr" as const, title: `Draft ${n}`, url: `https://github.com/o/r/pull/${20 + n}`, state: "open" as const,
      readiness: { stage, label: "Draft" },
    });
    const a = makeAllocation([["A", 10, { inProgress: [draft(1, "draft"), draft(2, "prototype")] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.readinessLine).toBe("Of 2 changes: 2 drafts or prototypes");
  });

  it("reports PRs that ran no automated checks apart from the collected ones", () => {
    const noChecks = {
      kind: "pr" as const, title: "Docs only", url: "https://github.com/o/r/pull/7", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: { passed: 0, failed: 0, pending: 0, total: 0 }, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    };
    const a = makeAllocation([["A", 10, { shipped: [annotated], inProgress: [noChecks] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe(
      "1 of 1 passed automated checks · 1 had no automated checks · 1 had automated code review · 1 included test updates",
    );
  });

  it("says no automated checks ran when every PR with evidence has zero checks", () => {
    const noChecks = {
      kind: "pr" as const, title: "Docs only", url: "https://github.com/o/r/pull/7", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: { passed: 0, failed: 0, pending: 0, total: 0 }, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    };
    const a = makeAllocation([["A", 10, { inProgress: [noChecks] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe("No automated checks ran on these changes");
  });

  it("keeps the not-collected wording when no automated data exists at all", () => {
    const a = makeAllocation([["A", 10, { inProgress: [{ ...open, checks: undefined }] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe("Automated check results not collected yet");
  });

  it("counts a lone open pilot PR as one change in review", () => {
    const pilot = {
      kind: "pr" as const, title: "Pilot: new onboarding", url: "https://github.com/o/r/pull/8", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
    };
    const a = makeAllocation([["A", 10, { inProgress: [pilot] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.readinessLine).toBe("Of 1 change: 1 in review");
  });

  it("does not claim no checks ran when some PRs have no check evidence", () => {
    const zeroChecks = {
      kind: "pr" as const, title: "Docs only", url: "https://github.com/o/r/pull/7", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: { passed: 0, failed: 0, pending: 0, total: 0 }, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    };
    const unknown = {
      kind: "pr" as const, title: "Unknown", url: "https://github.com/o/r/pull/8", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: null, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    };
    const a = makeAllocation([["A", 10, { inProgress: [zeroChecks, unknown] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe("1 had no automated checks · 1 not collected");
  });

  it("names PRs without check evidence next to collected checks", () => {
    const unknown = {
      kind: "pr" as const, title: "Unknown", url: "https://github.com/o/r/pull/8", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: null, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    };
    const a = makeAllocation([["A", 10, { shipped: [annotated], inProgress: [unknown] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe(
      "1 of 1 passed automated checks · 1 not collected · 1 had automated code review · 1 included test updates",
    );
  });

  it("never says all checks passed when commit statuses were not collected", () => {
    const partialPass = (passed: number, failed: number, total: number, n: number) => ({
      kind: "pr" as const, title: `Partial ${n}`, url: `https://github.com/o/r/pull/${40 + n}`, state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: { passed, failed, pending: 0, total, partial: true }, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    });
    const a = makeAllocation([["A", 10, { inProgress: [partialPass(2, 0, 2, 1), partialPass(1, 1, 2, 2)] }]]);
    const items = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.initiatives[0]!.inProgress;
    expect(items[0]!.checksText).toBe("2 of 2 automated checks passed · some check results not collected");
    expect(items[1]!.checksText).toBe("1 of 2 automated checks passed · some check results not collected");
    expect(items[0]!.checksText).not.toMatch(/^All |^Both /);
  });

  it("counts a partial item as collected but not passing in the period line", () => {
    const partial = {
      kind: "pr" as const, title: "Partial", url: "https://github.com/o/r/pull/50", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: { passed: 1, failed: 0, pending: 0, total: 1, partial: true }, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    };
    const a = makeAllocation([["A", 10, { inProgress: [partial] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification!;
    expect(v.checksLine).toBe("0 of 1 passed automated checks · 1 with incomplete check results");
  });

  it("uses source-neutral wording for incomplete checks and drops the commit-status-only phrases", () => {
    const partialItem = (automated: { passed: number; failed: number; pending: number; total: number }, n: number) => ({
      kind: "pr" as const, title: `Incomplete ${n}`, url: `https://github.com/o/r/pull/${60 + n}`, state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: { ...automated, partial: true }, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    });
    const a = makeAllocation([["A", 10, { inProgress: [
      partialItem({ passed: 2, failed: 0, pending: 0, total: 2 }, 1),
      partialItem({ passed: 1, failed: 1, pending: 0, total: 2 }, 2),
      partialItem({ passed: 1, failed: 0, pending: 1, total: 2 }, 3),
    ] }]]);
    const view = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!;
    const texts = view.initiatives[0]!.inProgress.map((i) => i.checksText);
    expect(texts).toEqual([
      "2 of 2 automated checks passed · some check results not collected",
      "1 of 2 automated checks passed · some check results not collected",
      "1 of 2 automated checks passed · 1 still running · some check results not collected",
    ]);
    // Partial items never count as passing, so the lead is 0 of 3 even though one check passed.
    expect(view.verification!.checksLine).toBe("0 of 3 passed automated checks · 1 still running · 3 with incomplete check results");
    for (const text of [...texts, view.verification!.checksLine]) {
      expect(text).not.toContain("commit status");
      expect(text).not.toContain("without commit-status");
    }
  });

  it("does not treat a zero count from partial evidence as definitive no checks", () => {
    const zero = (partial: boolean | undefined, n: number) => ({
      kind: "pr" as const, title: `Zero ${n}`, url: `https://github.com/o/r/pull/${80 + n}`, state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: {
        automated: { passed: 0, failed: 0, pending: 0, total: 0, ...(partial === undefined ? {} : { partial }) },
        humanReviews: 0, automatedReviews: n === 2 ? 1 : 0, testsUpdated: false,
      },
    });
    const a = makeAllocation([["A", 10, { inProgress: [zero(true, 1), zero(false, 2)] }]]);
    const items = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.initiatives[0]!.inProgress;
    expect(items[0]!.checksText).toBe("Check results not collected");
    expect(items[1]!.checksText).toBe("No automated checks · 1 automated review");
  });

  it("keeps review counts after a partial zero-count check result", () => {
    const partialZero = {
      kind: "pr" as const, title: "Partial zero", url: "https://github.com/o/r/pull/90", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: { passed: 0, failed: 0, pending: 0, total: 0, partial: true }, humanReviews: 1, automatedReviews: 0, testsUpdated: false },
    };
    const a = makeAllocation([["A", 10, { inProgress: [partialZero] }]]);
    const items = buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.initiatives[0]!.inProgress;
    expect(items[0]!.checksText).toBe("Check results not collected · 1 human review");
  });

  it("has no verification block without PR items", () => {
    const a = makeAllocation([["A", 10]]);
    expect(buildAllocationView({ week: { label: "w", allocation: a } })!.panels[0]!.verification).toBeUndefined();
  });
});
