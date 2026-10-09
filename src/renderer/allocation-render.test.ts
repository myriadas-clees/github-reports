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
      expect(html).toContain("Work delivered this week (Oct 1–7) would typically take one engineer about 3.5 days. Here&#x27;s where it went across 2 initiatives.");
      expect(html).toContain('title="Pricing: 54% of work delivered"');
      expect(html).toContain("Shipped");
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
      expect(html).toContain("Oct 1–7 &middot; share of work delivered");
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
      expect(html, theme).toContain('alloc-impact alloc-impact--major">Major<span class="alloc-sr"> impact</span>');
      expect(html, theme).toContain('alloc-impact alloc-impact--notable">Notable');
      expect(html, theme).toContain("2 more shipped");
      expect(html, theme).toContain(".alloc-impact--major");
    }
  });
});
