import { describe, it, expect } from "vitest";
import {
  buildAllocationView,
  formatWorkDelivered,
  MAX_VISIBLE_SHIPPED,
  formatPercent,
  MAX_INITIATIVE_COLORS,
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

describe("formatters", () => {
  it("formats work delivered in engineer-days below 80h and weeks above", () => {
    expect(formatWorkDelivered(510)).toEqual({ short: "~13 eng-wks", long: "about 13 engineer-weeks", plain: "about 13 weeks" });
    expect(formatWorkDelivered(93)).toEqual({ short: "~2.5 eng-wks", long: "about 2.5 engineer-weeks", plain: "about 2.5 weeks" });
    expect(formatWorkDelivered(36)).toEqual({ short: "~4.5 eng-days", long: "about 4.5 engineer-days", plain: "about 4.5 days" });
    expect(formatWorkDelivered(4)).toEqual({ short: "~0.5 eng-days", long: "about 0.5 engineer-days", plain: "about 0.5 days" });
    expect(formatWorkDelivered(0).long).toBe("about 0.5 engineer-days");
    expect(formatWorkDelivered(Number.NaN).short).toBe("~0.5 eng-days");
    expect(formatWorkDelivered(79).long).toBe("about 10 engineer-days");
    expect(formatWorkDelivered(80).long).toBe("about 2 engineer-weeks");
  });
  it("uses singular forms for exactly one", () => {
    expect(formatWorkDelivered(8)).toEqual({ short: "~1 eng-day", long: "about 1 engineer-day", plain: "about 1 day" });
    expect(formatWorkDelivered(8.3).long).toBe("about 1 engineer-day");
    expect(formatWorkDelivered(1000).long).toBe("about 25 engineer-weeks");
    expect(formatWorkDelivered(40 * 1).long).toBe("about 5 engineer-days");
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
    expect(v.lede).toBe("Work delivered this week (Oct 1–7) would typically take one engineer about 4.5 days. Here's where it went across 3 initiatives.");
    const names = v.weekBar!.segments.map((s) => s.name);
    expect(names).toEqual(["Pricing", "Hub", "Platform"]);
    const pricing = v.weekBar!.segments[0]!;
    expect(pricing.percent).toBe("41%");
    expect(pricing.title).toBe("Pricing: 41% of work delivered");
    expect(pricing.colorClass).toBe("alloc-c1");
    expect(v.weekBar!.ariaLabel).toContain("Pricing 41%");
    expect(v.weekLegend).toHaveLength(3);
  });

  it("uses singular wording for one initiative", () => {
    const v = buildAllocationView({ week: { label: "w", allocation: makeAllocation([["Solo", 5]]) } })!;
    expect(v.lede).toContain("across 1 initiative.");
  });

  it("falls back to day wording when there is no week", () => {
    const v = buildAllocationView({ day: makeAllocation([["A", 6]]) })!;
    expect(v.lede).toBe("Work delivered today would typically take one engineer about 1 day. Here's where it went across 1 initiative.");
    expect(v.hasWeek).toBe(false);
    expect(v.hasDay).toBe(true);
  });

  it("builds the work type bar with its own palette", () => {
    const v = buildAllocationView({ week: { label: "w", allocation: week } })!;
    const classes = v.weekWorkTypeBar!.segments.map((s) => s.colorClass);
    expect(classes).toEqual(["alloc-w1", "alloc-w2", "alloc-wn"]);
    expect(v.weekWorkTypes[0]!.title).toBe("New capability: 71% of work delivered");
  });

  it("omits the work type bar when there are no work types", () => {
    const v = buildAllocationView({ week: { label: "w", allocation: makeAllocation([["A", 3]]) } })!;
    expect(v.weekWorkTypeBar).toBeUndefined();
  });

  it("hides inline labels for tiny segments but still renders them", () => {
    const a = makeAllocation([["Big", 97], ["Small", 2], ["Tiny", 0.2]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!;
    const [big, small, tiny] = v.weekBar!.segments;
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
    const pricing = v.initiatives[0]!;
    expect(pricing.name).toBe("Pricing");
    expect(pricing.hasShipped && pricing.hasInProgress && pricing.hasOther).toBe(true);
    expect(pricing.shipped[0]).toMatchObject({ title: "Add tiers", url: "https://github.com/o/r/pull/1" });
    expect(pricing.otherCount).toBe(2);
    expect(pricing.hasSelfReported).toBe(true);
    expect(pricing.other.find((i) => i.kindLabel === "Self-reported")!.selfReported).toBe(true);
    expect(pricing.width).toBe("41.18%");
    expect(v.initiatives[1]!.isEmpty).toBe(true);
  });

  it("drops non-http urls from items", () => {
    const a = makeAllocation([["A", 1, { shipped: [{ kind: "pr", title: "x", url: "javascript:alert(1)" }] }]]);
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!;
    expect(v.initiatives[0]!.shipped[0]!.url).toBeUndefined();
  });

  it("skips today when identical to the week", () => {
    const same = buildAllocationView({ day: week, week: { label: "w", allocation: week } })!;
    expect(same.hasDay).toBe(false);
    expect(same.dayBar).toBeUndefined();
    const different = makeAllocation([["Pricing", 6], ["Hub", 2]]);
    const v = buildAllocationView({ day: different, week: { label: "w", allocation: week } })!;
    expect(v.hasDay).toBe(true);
    expect(v.dayBar!.segments[0]!.colorClass).toBe("alloc-c1");
  });

  it("skips today when it has no hours", () => {
    const v = buildAllocationView({ day: emptyAllocation(), week: { label: "w", allocation: week } })!;
    expect(v.hasDay).toBe(false);
  });

  it("assigns colors by trend order and folds extras into Other", () => {
    const names = ["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8"];
    const a = makeAllocation(names.map((n, i) => [n, 10 - i] as [string, number]));
    const trend = makeTrend(names, [{ label: "w1", days: 5, allocation: a }]);
    const v = buildAllocationView({ week: { label: "w1", allocation: a }, trend })!;
    expect(MAX_INITIATIVE_COLORS).toBe(6);
    const seg = v.weekBar!.segments;
    expect(seg).toHaveLength(7);
    expect(seg[6]).toMatchObject({ name: "Other", colorClass: "alloc-other", isOther: true });
    expect(seg[6]!.value).toBe(7); // I7 (4) + I8 (3)
  });

  it("keeps all initiatives in the list even when bars fold them", () => {
    const names = ["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8"];
    const a = makeAllocation(names.map((n, i) => [n, 10 - i] as [string, number]));
    const v = buildAllocationView({ week: { label: "w", allocation: a } })!;
    expect(v.initiatives).toHaveLength(8);
    expect(v.initiatives[7]!.colorClass).toBe("alloc-other");
    expect(v.initiatives[0]!.colorClass).toBe("alloc-c1");
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
    expect(cls(v.weekBar!.segments, "Pricing")).toBe("alloc-c1");
    expect(cls(v.dayBar!.segments, "Pricing")).toBe("alloc-c1");
    expect(cls(v.trendRows[0]!.bar.segments, "Pricing")).toBe("alloc-c1");
    expect(cls(v.trendRows[1]!.bar.segments, "Hub")).toBe("alloc-c2");
    expect(v.initiatives.find((i) => i.name === "Hub")!.colorClass).toBe("alloc-c2");
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
    it("marks empty weeks", () => {
      expect(v.trendRows[0]).toMatchObject({ hasReports: false, emptyText: "No reports", total: "" });
      expect(v.trendRows[0]!.bar.segments).toEqual([]);
      expect(v.trendRows[2]).toMatchObject({ hasReports: true, emptyText: "No estimated effort" });
    });
    it("orders trend segments by palette slot", () => {
      expect(v.trendRows[1]!.bar.segments.map((s) => s.name)).toEqual(["Pricing", "Hub"]);
      expect(v.trendRows[1]!.total).toBe("~1 eng-day");
    });
    it("provides an accessible data table", () => {
      expect(v.trendTable!.headers).toEqual(["Work week", "Days", "Work delivered", "Pricing", "Hub"]);
      expect(v.trendTable!.rows[1]).toEqual({
        label: "Sep 10–16", days: 5, total: "~1 eng-day", cells: ["25%", "75%"],
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
    expect(v.measureNote).toContain("It measures output, not hours worked");
    expect(v.measureNote).toContain("Items marked Self-reported");
  });

  it("exposes no hour figures anywhere in the view", () => {
    const trend = makeTrend(["Pricing", "Hub", "Platform"], [{ label: "Oct 1–7", days: 5, allocation: week }]);
    const v = buildAllocationView({ day: makeAllocation([["Pricing", 3]]), week: { label: "Oct 1–7", allocation: week }, trend })!;
    expect(JSON.stringify(v)).not.toMatch(/~\d+(\.\d+)?h\b/);
    expect(v.trendRows[0]!.total).toBe("~4.5 eng-days");
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
    expect(v?.initiatives[0].shipped[0].title).toBe("Plan household outreach");
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
    const [first, second, third] = v.initiatives[0]!.shipped;
    expect(first).toMatchObject({ impact: "major", impactLabel: "Major" });
    expect(second).toMatchObject({ impact: "notable", impactLabel: "Notable" });
    expect(third!.impact).toBeUndefined();
    expect(v.initiatives[0]!.hasShippedMore).toBe(false);
  });

  it("caps visible shipped items and folds the rest", () => {
    expect(MAX_VISIBLE_SHIPPED).toBe(8);
    const a = makeAllocation([["A", 10, { shipped: prs(11) }]]);
    const i = buildAllocationView({ week: { label: "w", allocation: a } })!.initiatives[0]!;
    expect(i.shipped).toHaveLength(8);
    expect(i.shippedMore).toHaveLength(3);
    expect(i.shippedMoreCount).toBe(3);
    expect(i.hasShippedMore).toBe(true);
    expect(i.shippedMore[0]!.title).toBe("Item 9");
  });

  it("does not fold exactly eight", () => {
    const a = makeAllocation([["A", 10, { shipped: prs(8) }]]);
    const i = buildAllocationView({ week: { label: "w", allocation: a } })!.initiatives[0]!;
    expect(i.hasShippedMore).toBe(false);
  });
});
