import { describe, it, expect } from "vitest";
import { renderReport } from "./index.js";
import { AVAILABLE_THEMES } from "./themes/index.js";
import { makeAllocation, makeTrend, emptyAllocation } from "./allocation-fixtures.js";
import { assertNoSecretsInHtml } from "../config.js";
import type { Theme, WeeklyReportData } from "../types.js";

const DATA: WeeklyReportData = {
  username: "testuser",
  avatarUrl: "https://avatars.githubusercontent.com/u/1",
  dateRange: { from: "2026-10-07", to: "2026-10-07" },
  stats: {
    totalCommits: 1, totalAdditions: 1, totalDeletions: 0, prsOpened: 0, prsMerged: 0,
    prsInProgress: 0, prsReviewed: 0, reviewComments: 0, issuesOpened: 0, issuesClosed: 0, estimatedHours: 0,
  },
  dailyCommits: [], repositories: [], pullRequests: [], issues: [], events: [],
  commitMessages: [], releases: [], externalContributions: [],
  aiContent: { title: "T", subtitle: "S", overview: "O", summaries: [], highlights: [], ticker: [] },
} as unknown as WeeklyReportData;

const week = makeAllocation(
  [
    ["Pricing", 14, { shipped: [{ kind: "pr", title: "Add <b>tiers</b>", url: "https://github.com/o/r/pull/1" }],
      other: [{ kind: "manual", title: "Planning" }] }],
    ["Hub", 12],
  ],
  [["new-capability", "New capability", 20], ["quality", "Quality & bug fixes", 6]],
);
const trend = makeTrend(["Pricing", "Hub"], [
  { label: "Sep 24–30", days: 0, allocation: emptyAllocation() },
  { label: "Oct 1–7", days: 4, allocation: week },
]);

describe("allocation section", () => {
  it("renders identically without allocation input", () => {
    const a = renderReport(DATA, { theme: "brutalist" });
    const b = renderReport(DATA, { theme: "brutalist", allocation: {} });
    expect(a).toBe(b);
    expect(a).not.toContain("Where the effort went</h2>");
  });

  for (const theme of AVAILABLE_THEMES as Theme[]) {
    it(`renders the section in the ${theme} theme before the overview`, () => {
      const day = makeAllocation([["Pricing", 4]]);
      const html = renderReport(DATA, {
        theme,
        allocation: { day, week: { label: "Oct 1–7", allocation: week }, trend },
      });
      expect(html).toContain("Where the effort went");
      expect(html).toContain("Work delivered in the week of Oct 1–7 would typically take one engineer about 3.5 days. Here&#x27;s where it went across 2 initiatives.");
      expect(html).toContain('title="Pricing: 54% of work delivered"');
      expect(html).toContain("Completed");
      expect(html).toContain("Self-reported");
      expect(html).toContain("No reports");
      expect(html).toContain("View as data table");
      expect(html).toContain("How we measure this");
      expect(html).toContain("It measures output, not hours worked");
      expect(html).not.toContain("Percentages are more reliable");
      expect(html).not.toContain(week.note);
      const section = html.slice(html.indexOf('id="alloc-title"'), html.indexOf("</section>", html.indexOf('id="alloc-title"')));
      expect(section).not.toMatch(/~\d+(\.\d+)?h\b/);
      expect(section).not.toContain("alloc-item-hours");
      expect(html).not.toContain("[object Object]");
      expect(html).toContain("share of work delivered");
      expect(html).toContain("Work week of Oct 1–7");
      expect(html).toContain(">Today<");
      expect(html).toContain("alloc-c1");
      // Escaped, not injected.
      expect(html).not.toContain("<b>tiers</b>");
      expect(html).toContain("Add &lt;b&gt;tiers&lt;/b&gt;");
      // Theme CSS carries both color modes for the palette.
      expect(html).toMatch(/--alloc-c1: #2a78d6/);
      expect(html).toMatch(/--alloc-c1: #3987e5/);
      expect(html.indexOf("Where the effort went</h2>")).toBeLessThan(html.indexOf("O</p>") >= 0 ? html.indexOf("O</p>") : Infinity);
      expect(() => assertNoSecretsInHtml(html)).not.toThrow();
    });
  }

  it("omits Today when it matches the week", () => {
    const html = renderReport(DATA, { allocation: { day: week, week: { label: "Oct 1–7", allocation: week } } });
    expect(html).not.toContain(">Today<");
  });

  it("renders impact badges and folds shipped items beyond eight", () => {
    const shipped = Array.from({ length: 10 }, (_, i) => ({
      kind: "pr" as const,
      title: `Shipped ${i + 1}`,
      url: `https://github.com/o/r/pull/${i + 1}`,
      ...(i === 0 ? { impact: "major" as const } : i === 1 ? { impact: "notable" as const } : {}),
    }));
    const a = makeAllocation([["Pricing", 30, { shipped }]]);
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderReport(DATA, { theme, allocation: { week: { label: "Oct 1–7", allocation: a } } });
      expect(html, theme).toContain('alloc-impact alloc-impact--major">Large change</span>');
      expect(html, theme).toContain('alloc-impact alloc-impact--notable">Substantial change');
      expect(html, theme).toContain("2 more completed");
      expect(html, theme).toContain(".alloc-impact--major");
    }
  });

  it("shows still-running checks instead of all-passed wording in every theme", () => {
    const shipped = [{
      kind: "pr" as const, title: "Add tiers", url: "https://github.com/o/r/pull/1", state: "open" as const,
      readiness: { stage: "in-review" as const, label: "In review" },
      checks: { automated: { passed: 1, failed: 0, pending: 1, total: 2 }, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    }];
    const a = makeAllocation([["Pricing", 30, { inProgress: shipped }]]);
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderReport(DATA, { theme, allocation: { week: { label: "Oct 1–7", allocation: a } } });
      expect(html, theme).toContain("1 of 2 automated checks passed · 1 still running");
      expect(html, theme).not.toContain("Both automated checks passed");
      expect(html, theme).not.toContain("[object Object]");
    }
  });

  it("renders readiness, complexity, risk chips and the checks block in every theme", () => {
    const shipped = [{
      kind: "pr" as const, title: "Add tiers", url: "https://github.com/o/r/pull/1", state: "merged" as const,
      readiness: { stage: "live" as const, label: "Live", detail: "Live since Oct 8" },
      complexity: { level: "cross-system" as const, label: "Cross-system", reason: "Touches 4 areas: a, b, c, d", risks: ["Payments"] },
      checks: { automated: { passed: 2, failed: 0, pending: 0, total: 2 }, humanReviews: 1, automatedReviews: 0, testsUpdated: false },
    }];
    const a = makeAllocation([["Pricing", 30, { shipped }]]);
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderReport(DATA, { theme, allocation: { week: { label: "Oct 1–7", allocation: a } } });
      expect(html, theme).toContain('class="alloc-stage alloc-stage--live" title="Live since Oct 8">Live');
      expect(html, theme).toContain("Live since Oct 8)");
      expect(html, theme).toContain('class="alloc-cx alloc-cx--cross-system"');
      expect(html, theme).toContain('<span class="alloc-risk">Payments</span>');
      expect(html, theme).toContain("Both automated checks passed · 1 human review");
      expect(html, theme).toContain("Checks behind this work");
      expect(html, theme).toContain("Of 1 change: 1 live");
      expect(html, theme).toContain(".alloc-stage--live");
      expect(html, theme).not.toContain("[object Object]");
    }
  });

  for (const theme of AVAILABLE_THEMES as Theme[]) {
    it(`renders a two-tab switch with one visible panel in the ${theme} theme`, () => {
      const day = makeAllocation([["Pricing", 4]]);
      const html = renderReport(DATA, {
        theme,
        allocation: { day, week: { label: "Oct 1–7", allocation: week }, trend, asOf: "2026-08-05" },
      });
      expect(html).toContain('class="alloc-switch"');
      expect(html.match(/data-alloc-tab="/g)).toHaveLength(2);
      const panels = html.match(/<div class="alloc-panel"[^>]*>/g)!;
      expect(panels).toHaveLength(2);
      expect(panels.filter((t) => !/\shidden(\s|>)/.test(t))).toHaveLength(1);
      expect(panels.filter((t) => /\shidden(\s|>)/.test(t))).toHaveLength(1);
      expect(panels[0]).not.toMatch(/\shidden/);
      expect(html).toContain("Aug 5");
      expect(html).toContain("Work week of Oct 1–7 (so far)");
      expect(html).toContain("data-alloc-root");
      expect(html).not.toContain("[object Object]");
    });

    it(`renders no switch for a single panel in the ${theme} theme`, () => {
      const html = renderReport(DATA, { theme, allocation: { week: { label: "Oct 1–7", allocation: week } } });
      expect(html).not.toContain("data-alloc-tab=");
      expect(html.match(/<div class="alloc-panel"[^>]*>/g)).toHaveLength(1);
      expect(html).not.toMatch(/<div class="alloc-panel"[^>]*\shidden/);
    });
  }
});

describe("daily page week link", () => {
  for (const theme of AVAILABLE_THEMES as Theme[]) {
    it(`links to the whole week and shows only the day panel in the ${theme} theme`, () => {
      const day = makeAllocation([["Pricing", 4]]);
      const html = renderReport(DATA, {
        theme,
        allocation: { day, asOf: "2026-10-07", trend },
        weekLink: { href: "../../../weeks/2026-10-01/", label: "Oct 1-7" },
      });
      expect(html).toContain('href="../../../weeks/2026-10-01/"');
      expect(html).toContain("See the whole week (Oct 1-7) \u2192");
      expect(html).not.toContain('class="alloc-switch"');
      expect(html).not.toContain("data-alloc-tab=");
      expect(html.match(/<div class="alloc-panel"[^>]*>/g)).toHaveLength(1);
      expect(() => assertNoSecretsInHtml(html)).not.toThrow();
    });

    it(`still links to the week without allocation data in the ${theme} theme`, () => {
      const html = renderReport(DATA, { theme, weekLink: { href: "../../../weeks/2026-10-01/", label: "Oct 1-7" } });
      expect(html).toContain('href="../../../weeks/2026-10-01/"');
      expect(html).not.toContain("Where the effort went</h2>");
    });

    it(`omits the week link when not given in the ${theme} theme`, () => {
      expect(renderReport(DATA, { theme })).not.toContain("See the whole week");
    });
  }
});

describe("no-activity minimum day rendering", () => {
  it("shows the gray no-activity segment under its own name in every theme", () => {
    const a = makeAllocation([["Hub", 10], ["No GitHub activity (minimum day)", 8]]);
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderReport(DATA, { theme, allocation: { week: { label: "Oct 1-7", allocation: a } } });
      expect(html, theme).toContain("No GitHub activity (minimum day)");
      expect(html, theme).toMatch(/class="alloc-seg alloc-other"[^>]*title="No GitHub activity \(minimum day\)/);
      expect(html, theme).not.toContain("[object Object]");
    }
  });
});
