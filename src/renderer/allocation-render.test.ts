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
      expect(html).toContain("Work delivered in the week of Oct 1–7 would typically take one engineer about 3.5 days (26 estimated manual-effort hours) without AI assistance. Here&#x27;s where it went across 2 initiatives.");
      expect(html).toContain('title="Pricing: 54% of work delivered"');
      expect(html).toContain("Completed");
      expect(html).toContain("Self-reported");
      expect(html).toContain("No reports");
      expect(html).toContain("View as data table");
      expect(html).toContain("How we measure this");
      expect(html).toContain("not actual hours worked or measured time saved");
      expect(html).not.toContain("Percentages are more reliable");
      expect(html).not.toContain(week.note);
      const section = html.slice(html.indexOf('id="alloc-title"'), html.indexOf("</section>", html.indexOf('id="alloc-title"')));
      expect(section).not.toMatch(/~\d+(\.\d+)?h\b/);
      expect(html).toContain('<div class="alloc-item-hours">14 estimated manual-effort hours</div>');
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

  it("groups checks evidence in the default theme without green-lighting missing or running checks", () => {
    const pr = (n: number, state: "merged" | "open", stage: "awaiting-release" | "in-review", automated: { passed: number; failed: number; pending: number; total: number; partial?: boolean } | null) => ({
      kind: "pr" as const, title: `Change ${n}`, url: `https://github.com/o/r/pull/${n}`, state,
      readiness: { stage, label: stage },
      checks: { automated, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
    });
    const a = makeAllocation([["Pricing", 30, {
      shipped: [pr(1, "merged", "awaiting-release", { passed: 2, failed: 0, pending: 0, total: 2 })],
      inProgress: [pr(2, "open", "in-review", { passed: 1, failed: 0, pending: 1, total: 2 }), pr(3, "open", "in-review", null)],
    }]]);
    const html = renderReport(DATA, { theme: "brutalist", allocation: { week: { label: "Oct 1–7", allocation: a } } });
    const block = html.slice(html.indexOf('class="alloc-block alloc-verify"'), html.indexOf("</section>", html.indexOf('class="alloc-block alloc-verify"')));
    expect(block).toContain('<li class="alloc-verify-fact"><span class="alloc-verify-value">1</span> <span class="alloc-verify-label">code integrated, not live yet</span></li>');
    expect(block).toContain('alloc-verify-fact--pending"><span class="alloc-verify-value">1</span> <span class="alloc-verify-label">still running</span>');
    expect(block).toContain('alloc-verify-fact--tentative"><span class="alloc-verify-value">1</span> <span class="alloc-verify-label">not collected</span>');
    expect(block).not.toContain("alloc-verify-fact--positive");
    expect(block).not.toContain("Reviews and tests");
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
      if (theme === "brutalist") {
        // The default theme lays the same facts out as grouped counts instead of sentences.
        expect(html, theme).toContain('<span class="alloc-sub-meta">across 1 change</span>');
        expect(html, theme).toContain('<li class="alloc-verify-fact alloc-verify-fact--positive"><span class="alloc-verify-value">1</span> <span class="alloc-verify-label">live</span></li>');
        expect(html, theme).toContain('<span class="alloc-verify-value">1 of 1</span> <span class="alloc-verify-label">passed automated checks</span>');
        expect(html, theme).toContain('<span class="alloc-verify-label">had human review</span>');
        expect(html, theme).toContain("How we say something is finished");
      } else {
        expect(html, theme).toContain("Of 1 change: 1 live");
      }
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

describe("work delivered chip", () => {
  const withHours = (hours: number) => ({ ...DATA, hoursEstimate: { hours, sessions: 1 } }) as unknown as WeeklyReportData;
  for (const theme of AVAILABLE_THEMES as Theme[]) {
    it(`hides the chip and its note for a zero-hour estimate in the ${theme} theme`, () => {
      const html = renderReport(withHours(0), { theme });
      expect(html, theme).not.toContain("Manual effort estimate");
      expect(html, theme).not.toContain("Estimated manual engineering effort for one engineer");
    });
    it(`shows the chip and its note for an 8-hour estimate in the ${theme} theme`, () => {
      const html = renderReport(withHours(8), { theme });
      expect(html, theme).toContain("Manual effort estimate");
      expect(html, theme).toContain("Estimated manual engineering effort for one engineer delivering these changes without AI assistance");
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

describe("other work items (closed PRs and reviews)", () => {
  const closedPr = {
    kind: "pr" as const, title: "feat: Try new cache", url: "https://github.com/o/r/pull/9", state: "closed" as const,
    repository: "o/r",
    complexity: { level: "connected" as const, label: "Connected", reason: "Touches 2 areas: a, b", risks: ["Payments"] },
    checks: { automated: { passed: 2, failed: 0, pending: 0, total: 2 }, humanReviews: 0, automatedReviews: 0, testsUpdated: false },
  };
  const review = { kind: "review" as const, title: "Review: billing", url: "https://github.com/o/r/pull/3", repository: "o/r" };

  it("shows the closed-without-merging tag, complexity and checks for a closed PR in every theme", () => {
    const a = makeAllocation([["Pricing", 10, { other: [closedPr] }]]);
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderReport(DATA, { theme, allocation: { week: { label: "Oct 1-7", allocation: a } } });
      expect(html, theme).toContain('<span class="alloc-tag">Closed without merging</span>');
      expect(html, theme).toContain('<span class="alloc-cx alloc-cx--connected" title="Touches 2 areas: a, b">Connected');
      expect(html, theme).toContain('<span class="alloc-risk">Payments</span>');
      expect(html, theme).toContain('<span class="alloc-checks">Both automated checks passed</span>');
      expect(html, theme).not.toContain("[object Object]");
    }
  });

  it("renders a review item in other work unchanged in every theme", () => {
    const a = makeAllocation([["Pricing", 10, { other: [review] }]]);
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderReport(DATA, { theme, allocation: { week: { label: "Oct 1-7", allocation: a } } });
      const start = html.indexOf('<li><span class="alloc-kind">Review</span>');
      const li = html.slice(start, html.indexOf("</li>", start) + "</li>".length);
      expect(li, theme).toBe(
        '<li><span class="alloc-kind">Review</span><a href="https://github.com/o/r/pull/3" target="_blank" rel="noopener nofollow">Review: billing</a><span class="alloc-repo">o/r</span></li>',
      );
      expect(html, theme).not.toContain("Closed without merging");
    }
  });
});

describe("complexity from a partial file list", () => {
  const complexity = (partial?: boolean) => ({
    level: "connected" as const, label: "Connected",
    reason: "Touches 2 areas: a, b" + (partial ? " (based on a partial file list)" : ""),
    risks: [] as string[],
    ...(partial === undefined ? {} : { partial }),
  });
  const pr = (n: number, partial?: boolean) => ({
    kind: "pr" as const, title: `Change ${n}`, url: `https://github.com/o/r/pull/${70 + n}`, repository: "o/r",
    complexity: complexity(partial),
  });

  it("marks a partial complexity chip with a suffix and dashed class in every section and theme", () => {
    const a = makeAllocation([["Pricing", 10, {
      shipped: [{ ...pr(1, true), state: "merged" as const, readiness: { stage: "live" as const, label: "Live" } }],
      inProgress: [{ ...pr(2, true), state: "open" as const }],
      other: [{ ...pr(3, true), state: "closed" as const }],
    }]]);
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderReport(DATA, { theme, allocation: { week: { label: "Oct 1-7", allocation: a } } });
      expect(html, theme).toContain('class="alloc-cx alloc-cx--connected alloc-cx--partial" title="Touches 2 areas: a, b (based on a partial file list)">Connected · partial');
      expect(html.match(/alloc-cx--connected alloc-cx--partial"/g), theme).toHaveLength(3);
      expect(html, theme).not.toContain("[object Object]");
    }
  });

  it("leaves a complete complexity chip unchanged in every theme", () => {
    const a = makeAllocation([["Pricing", 10, { shipped: [{ ...pr(4), state: "merged" as const }] }]]);
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderReport(DATA, { theme, allocation: { week: { label: "Oct 1-7", allocation: a } } });
      expect(html, theme).toContain('class="alloc-cx alloc-cx--connected" title="Touches 2 areas: a, b">Connected');
      expect(html, theme).not.toContain("· partial");
      expect(html, theme).not.toContain('alloc-cx--partial"');
    }
  });
});

describe("report summary leads the page", () => {
  const withSummary = {
    ...DATA,
    stakeholderSummary: "The team shipped export and has one change in review.",
    hoursEstimate: { hours: 26, sessions: 1 },
    aiContent: { ...DATA.aiContent, overview: "A distinct narrative." },
  } as unknown as WeeklyReportData;
  for (const theme of AVAILABLE_THEMES as Theme[]) {
    it(`puts the summary, estimated hours and section links before the allocation in the ${theme} theme`, () => {
      const html = renderReport(withSummary, { theme, allocation: { week: { label: "Oct 1–7", allocation: week } } });
      const summaryAt = html.indexOf('id="summary"');
      expect(summaryAt, theme).toBeGreaterThan(-1);
      expect(summaryAt, theme).toBeLessThan(html.indexOf('id="alloc-title"'));
      const summary = html.slice(summaryAt, html.indexOf("</section>", summaryAt));
      expect(summary, theme).toContain("The team shipped export and has one change in review.");
      expect(summary, theme).toContain("26 estimated manual-effort hours");
      expect(summary, theme).toContain("Figures for Work week of Oct 1–7");
      expect(summary, theme).toContain("It is not time worked");
      // Deeper detail stays reachable from the summary.
      for (const id of ["alloc-title", "narrative", "activity"]) {
        expect(summary, theme).toContain(`href="#${id}"`);
        expect(html, theme).toMatch(new RegExp(`id="${id}"`));
      }
      // The summary appears once, at the top, not again inside Activity.
      expect(html.split("The team shipped export and has one change in review.").length - 1, theme).toBe(1);
      expect(html, theme).toContain("Manual effort estimate");
      expect(html, theme).toContain("~3.5 engineer-days · 26 estimated manual-effort hours");
    });
  }

  it("falls back to the stored estimate without allocation input and links only what exists", () => {
    const html = renderReport(withSummary, { theme: "brutalist" });
    const summary = html.slice(html.indexOf('id="summary"'), html.indexOf("</section>", html.indexOf('id="summary"')));
    expect(summary).toContain("26 estimated manual-effort hours");
    expect(summary).not.toContain('href="#alloc-title"');
    expect(summary).toContain('href="#activity"');
  });

  it("renders no summary block without a stakeholder summary", () => {
    expect(renderReport(DATA, { theme: "brutalist" })).not.toContain('id="summary"');
  });
});
