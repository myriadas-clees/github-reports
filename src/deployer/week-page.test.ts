import { describe, it, expect } from "vitest";
import { renderWeekPage, type WeekPageData } from "./week-page.js";
import { AVAILABLE_THEMES } from "../renderer/themes/index.js";
import { makeAllocation, makeTrend, emptyAllocation } from "../renderer/allocation-fixtures.js";
import { assertNoSecretsInHtml } from "../config.js";
import type { Theme } from "../types.js";

const week = makeAllocation([["Pricing", 14], ["Hub", 12]], [["new-capability", "New capability", 20]]);
const base = (over: Partial<WeekPageData> = {}): WeekPageData => ({
  id: "2026-10-01",
  label: "Oct 1-7",
  from: "2026-10-01",
  to: "2026-10-07",
  open: false,
  monthLabel: "October 2026",
  monthAnchor: "month-2026-10",
  days: [
    { date: "2026-10-01", href: "../../2026/10/01/", label: "Thu, Oct 1", title: "Pricing shipped" },
    { date: "2026-10-02", href: "../../2026/10/02/", label: "Fri, Oct 2" },
  ],
  prev: { href: "../2026-09-24/", label: "Work week of Sep 24-30" },
  next: { href: "../2026-10-08/", label: "Work week of Oct 8-14" },
  allocation: {
    week: { label: "Oct 1-7", allocation: week },
    asOf: "2026-10-07",
    trend: makeTrend(["Pricing", "Hub"], [
      { label: "Sep 24-30", days: 0, allocation: emptyAllocation() },
      { label: "Oct 1-7", days: 2, allocation: week },
    ]),
  },
  ...over,
});

describe("renderWeekPage", () => {
  for (const theme of AVAILABLE_THEMES as Theme[]) {
    it(`renders the week panel, day select, pager and back link in the ${theme} theme`, () => {
      const html = renderWeekPage(base(), { themeName: theme, baseUrl: "https://example.com/", siteTitle: "Worklog" });
      expect(html).toContain("Work week of Oct 1-7");
      expect(html).not.toContain("(so far)");
      expect(html).toContain("2026-10-01 to 2026-10-07");
      // Single week panel: no Day/Week switch.
      expect(html.match(/<div class="alloc-panel"[^>]*>/g)).toHaveLength(1);
      expect(html).not.toContain("data-alloc-tab=");
      expect(html).toContain("Last 2 weeks");
      expect(html).toContain("How we measure this");
      // Back links and anchors resolve two levels up.
      expect(html).toContain('href="../../"');
      expect(html).toContain('href="../../#month-2026-10"');
      expect(html).toContain("October 2026");
      // Day links sit above the allocation section.
      expect(html).toContain('aria-label="Daily reports this week"');
      expect(html).toContain('<a href="../../2026/10/01/">Thu, Oct 1</a>');
      expect(html).toContain('<a href="../../2026/10/02/">Fri, Oct 2</a>');
      expect(html.indexOf("Daily reports this week")).toBeLessThan(html.indexOf("data-alloc-root"));
      // Prev / next.
      expect(html).toContain('href="../2026-09-24/"');
      expect(html).toContain('href="../2026-10-08/"');
      expect(html).toContain('<link rel="canonical" href="https://example.com/weeks/2026-10-01/"');
      expect(html).not.toContain("[object Object]");
      expect(() => assertNoSecretsInHtml(html)).not.toThrow();
    });
  }

  it("marks a week in progress and omits missing prev/next", () => {
    const html = renderWeekPage(base({ open: true, prev: undefined, next: undefined }));
    expect(html).toContain("Work week of Oct 1-7 (so far)");
    expect(html).not.toContain('rel="prev"');
    expect(html).not.toContain('rel="next"');
  });

  it("renders a self-reported-only week with no daily links and no errors in every theme", () => {
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderWeekPage(base({ days: [] }), { themeName: theme, baseUrl: "https://example.com/" });
      expect(html, theme).toContain("No daily reports this week; effort is self-reported.");
      expect(html, theme).not.toContain('<ul class="week-day-links">');
      expect(html, theme).not.toContain("{{");
      expect(html, theme).toContain('rel="prev"');
      expect(html, theme).toContain('rel="next"');
      expect(html, theme).toContain("Where the effort went</h2>");
      expect(() => assertNoSecretsInHtml(html), theme).not.toThrow();
    }
  });

  it("still renders without allocation data", () => {
    const html = renderWeekPage(base({ allocation: undefined }));
    expect(html).toContain('<a href="../../2026/10/02/">Fri, Oct 2</a>');
    expect(html).not.toContain("Where the effort went</h2>");
  });
});
