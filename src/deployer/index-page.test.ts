import { describe, it, expect } from "vitest";
import { AVAILABLE_THEMES } from "../renderer/themes/index.js";
import { makeAllocation } from "../renderer/allocation-fixtures.js";
import type { ReadinessStage, Theme } from "../types.js";
import { renderIndexPage, buildReportEntry, hoursToActivityPercent, buildOutcomeLine, buildOutcomeSummary } from "./index-page.js";

const entries = (paths: string[]) => paths.map((p) => buildReportEntry(p));

describe("renderIndexPage", () => {
  it("produces valid HTML with report links", () => {
    const html = renderIndexPage(entries(["2026/04/01", "2026/04/02"]));
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("2026/04/02/");
    expect(html).toContain("2026/04/01/");
  });

  it("lists reports in reverse chronological order", () => {
    const html = renderIndexPage(entries(["2026/04/01", "2026/04/03", "2026/04/02"]));
    const w14Pos = html.indexOf("2026/04/03");
    const w13Pos = html.indexOf("2026/04/02");
    const w12Pos = html.indexOf("2026/04/01");
    expect(w14Pos).toBeLessThan(w13Pos);
    expect(w13Pos).toBeLessThan(w12Pos);
  });

  it("groups by year", () => {
    const html = renderIndexPage(entries(["2025/12/31", "2026/01/01", "2026/01/02"]));
    const year2026Pos = html.indexOf("2026/01/02/");
    const year2025Pos = html.indexOf("2025/12/31/");
    expect(year2026Pos).toBeLessThan(year2025Pos);
  });

  it("includes dofollow footer link", () => {
    const html = renderIndexPage(entries(["2026/04/01"]));
    expect(html).toContain("myriadas.com");
    expect(html).toContain("Myriad Advisor Solutions");
    expect(html).not.toContain('rel="nofollow"');
  });

  it("handles empty report list", () => {
    const html = renderIndexPage([]);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Dev");
    expect(html).toContain("Pulse");
  });

  it("shows AI title when provided", () => {
    const report = [buildReportEntry("2026/04/01", "Shipped the auth refactor")];
    const html = renderIndexPage(report);
    expect(html).toContain("Shipped the auth refactor");
  });

  it("falls back to the report date when no title", () => {
    const report = [buildReportEntry("2026/04/01")];
    const html = renderIndexPage(report);
    expect(html).toContain("2026-04-01");
  });

  it("shows profile when provided", () => {
    const html = renderIndexPage(entries(["2026/04/01"]), {
      username: "testuser",
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(html).toContain("testuser");
    expect(html).toContain("https://example.com/avatar.png");
  });

  it("renders Japanese locale", () => {
    const html = renderIndexPage(entries(["2026/04/01"]), undefined, "ja");
    expect(html).toContain('lang="ja"');
    expect(html).toContain("Dev");
    expect(html).toContain("Pulse");
  });

  it("defaults to English locale", () => {
    const html = renderIndexPage(entries(["2026/04/01"]));
    expect(html).toContain('lang="en"');
    expect(html).toContain("Dev");
    expect(html).toContain("Pulse");
  });

  it("uses custom site title", () => {
    const html = renderIndexPage(entries(["2026/04/01"]), undefined, "en", "Daily Worklog");
    expect(html).toContain("Daily Worklog");
  });

  it("builds absolute og.png URL when baseUrl is provided", () => {
    const html = renderIndexPage(
      entries(["2026/04/01"]),
      undefined,
      "en",
      undefined,
      "https://user.github.io/repo",
    );
    expect(html).toContain("https://user.github.io/repo/og.png");
  });

  it("renders a collapsed monthly overhead with aggregate totals", () => {
    const html = renderIndexPage([
      buildReportEntry("2026/04/01", "Auth shipped", undefined, { commits: 4, prs: 1, reviews: 2 }),
      buildReportEntry("2026/04/02", "Billing cleanup", undefined, { commits: 6, prs: 2, reviews: 1 }),
    ]);
    expect(html).toContain("Activity ledger");
    expect(html).toContain("10</b> commits");
    expect(html).toContain("3</b> PRs");
    expect(html).toContain("April");
    expect(html).toContain('<details class="month-group" open id="month-2026-04">');
    expect(html).toContain("--activity:");
  });

  it("scales month-tape bars from absolute estimated hours", () => {
    const html = renderIndexPage([
      buildReportEntry("2026/06/16", "Seed day", undefined, { commits: 3, prs: 0, reviews: 0, hours: 8 }),
      buildReportEntry("2026/06/17", "Heavy day", undefined, { commits: 55, prs: 0, reviews: 0, hours: 24 }),
      buildReportEntry("2026/08/11", "PR day", undefined, { commits: 1, prs: 10, reviews: 5, hours: 48 }),
      buildReportEntry("2026/07/03", "Empty day", undefined, { commits: 0, prs: 0, reviews: 0, hours: 0 }),
    ]);
    expect(html).toContain('--activity: 33%');
    expect(html).toContain('--activity: 100%');
    expect(html).toContain('--activity: 4%');
    // High-commit / 0-PR day is not crushed by PR-heavy archive siblings.
    expect(html.match(/--activity: 100%/g)?.length).toBe(2);
  });

  it("expands months into Thu-Wed work-week rows with nested day lists", () => {
    const reports = [
      buildReportEntry("2026/09/30", "Wed day", undefined, { commits: 1, prs: 0, reviews: 0, hours: 8 }),
      buildReportEntry("2026/10/01", "Thu day", undefined, { commits: 2, prs: 1, reviews: 0, hours: 16 }),
      buildReportEntry("2026/10/02", "Fri day", undefined, { commits: 3, prs: 1, reviews: 4, hours: 24 }),
      buildReportEntry("2026/10/08", "Open day", undefined, { commits: 1, prs: 0, reviews: 0, hours: 8 }),
    ];
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderIndexPage(reports, undefined, "en", undefined, undefined, undefined, theme);
      // Sep 24-30 closes in September, Oct 1-7 in October, Oct 8-14 is in progress (latest report month: October).
      expect(html, theme).toContain('id="month-2026-10"');
      expect(html, theme).toContain('id="month-2026-09"');
      expect(html, theme).toContain('href="weeks/2026-10-01/"');
      expect(html, theme).toContain('href="weeks/2026-10-08/"');
      expect(html, theme).toContain('href="weeks/2026-09-24/"');
      expect(html, theme).toContain("<strong>Oct 1-7</strong>");
      expect(html, theme).toContain("\u2248 5 engineer-days");
      expect(html, theme).not.toContain("engineer-days delivered");
      expect(html, theme).not.toMatch(/engineer-weeks?/);
      expect(html, theme).toContain("(in progress)");
      expect(html.match(/\(in progress\)/g), theme).toHaveLength(1);
      expect(html, theme).toContain("2 daily reports");
      expect(html, theme).toContain("1 daily report<");
      // Day rows sit inside their week's details; the Oct 1 week holds both Oct days, not Sep 30.
      const block = html.slice(html.indexOf('href="weeks/2026-10-01/"'), html.indexOf('href="weeks/2026-09-24/"'));
      expect(block).toContain('href="2026/10/02/"');
      expect(block).toContain('href="2026/10/01/"');
      expect(block).not.toContain('href="2026/09/30/"');
      expect(html, theme).not.toContain("alloc-archive");
      expect(html, theme).not.toContain("data-est-root");
      expect(html, theme).not.toContain("data-alloc-root");
    }
  });

  it("shows top-3 initiatives per week when allocation is provided", () => {
    const alloc = makeAllocation([["Pricing", 10], ["Hub", 6], ["Platform", 3], ["Docs", 1]]);
    const html = renderIndexPage(
      [buildReportEntry("2026/10/01", "x", undefined, { commits: 1, prs: 0, reviews: 0, hours: 8 })],
      undefined, "en", undefined, undefined, undefined, "brutalist",
      { weekAllocations: new Map([["2026-10-01", alloc]]) },
    );
    expect(html).toContain("<span>Pricing</span> <b>50%</b>");
    expect(html).toContain("<span>Hub</span> <b>30%</b>");
    expect(html).toContain("<span>Platform</span> <b>15%</b>");
    const topList = html.slice(html.indexOf('aria-label="Top initiatives"'));
    expect(topList.slice(0, topList.indexOf("</ul>"))).not.toContain("Docs");
  });

  it("renders planning links only with the estimate-page flag", () => {
    const one = [buildReportEntry("2026/10/01", "x", undefined, { commits: 1, prs: 0, reviews: 0, hours: 8 })];
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const off = renderIndexPage(one, undefined, "en", undefined, undefined, undefined, theme);
      expect(off, theme).not.toContain("estimate/?kind=");
      expect(off, theme).not.toContain("Thinking about new work?");
      const on = renderIndexPage(one, undefined, "en", undefined, undefined, undefined, theme,
        { hasEstimatePage: true, hasAppEstimates: true });
      expect(on, theme).toContain("Thinking about new work?");
      for (const kind of ["app", "feature", "change", "bug"]) expect(on, theme).toContain(`href="estimate/?kind=${kind}"`);
      expect(on, theme).toContain("Have a new app idea?");
      expect(on, theme).toContain("Found a bug?");
    }
  });

  it("links to the app estimate only when app history exists, keeping the other planning links", () => {
    const one = [buildReportEntry("2026/10/01", "x", undefined, { commits: 1, prs: 0, reviews: 0, hours: 8 })];
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const withApps = renderIndexPage(one, undefined, "en", undefined, undefined, undefined, theme,
        { hasEstimatePage: true, hasAppEstimates: true });
      expect(withApps, theme).toContain("Have a new app idea?");
      expect(withApps, theme).toContain('href="estimate/?kind=app"');

      const noApps = renderIndexPage(one, undefined, "en", undefined, undefined, undefined, theme,
        { hasEstimatePage: true, hasAppEstimates: false });
      expect(noApps, theme).not.toContain("Have a new app idea?");
      expect(noApps, theme).not.toContain("estimate/?kind=app");
      expect(noApps, theme).toContain("Thinking about new work?");
      expect(noApps, theme).toContain('href="estimate/?kind=feature"');
      expect(noApps, theme).toContain('href="estimate/?kind=change"');
      expect(noApps, theme).toContain('href="estimate/?kind=bug"');
      expect(noApps, theme).toContain("Found a bug?");

      const unset = renderIndexPage(one, undefined, "en", undefined, undefined, undefined, theme,
        { hasEstimatePage: true });
      expect(unset, theme).not.toContain("estimate/?kind=app");
    }
  });

  it("keeps legacy weekly entries in the brutalist archive", () => {
    const html = renderIndexPage([buildReportEntry("2026/W14", "Weekly delivery")]);
    expect(html).toContain("Weekly delivery");
    expect(html).toContain('href="2026/W14/"');
    expect(html).toContain("Weekly");
  });
});

describe("homepage effort summary", () => {
  const day = (path: string, hours: number, extra: Partial<{ commits: number; prs: number; reviews: number }> = {}) =>
    buildReportEntry(path, "x", undefined, { commits: 2, prs: 1, reviews: 1, hours, ...extra });
  // Thu Oct 1 week: 80h (largest); Thu Oct 8 week (open): 40h; Thu Sep 24 week: 8h.
  const reports = [
    day("2026/09/24", 8),
    day("2026/10/01", 40), day("2026/10/02", 40),
    day("2026/10/08", 40),
  ];
  const item = (title: string, effortHours: number, stage?: ReadinessStage, kind: "pr" | "commits" = "pr") => ({
    kind, title, state: "merged" as const, effortHours,
    ...(stage ? { readiness: { stage, label: stage } } : {}),
  });
  const weekAllocations = new Map([
    ["2026-10-01", makeAllocation([
      ["Hub", 60, { shipped: [
        item("feat(hub): Merged small", 1, "done"),
        item("feat(hub): Contact methods", 5, "live"),
        item("fix: Merged big", 20, "done"),
        item("CSV import", 9, "live"),
      ] }],
      ["Pricing", 20],
    ])],
    ["2026-10-08", makeAllocation([["Hub", 30, { inProgress: [item("feat: Draft thing", 3, "in-review"), item("Another WIP", 9, "draft")] }], ["Docs", 10]])],
    ["2026-09-24", makeAllocation([["Pricing", 8]])],
  ]);
  const render = (theme: Theme = "brutalist") =>
    renderIndexPage(reports, undefined, "en", undefined, undefined, undefined, theme, {
      weekAllocations, colorOrder: ["Hub", "Pricing", "Docs"], hasEstimatePage: true,
    });

  it("leads with total estimated engineer-days and one initiative mix bar", () => {
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = render(theme);
      expect(html, theme).toContain("≈ 16");
      expect(html, theme).toContain("engineer-days");
      expect(html, theme).toContain("estimated");
      const hero = html.slice(html.indexOf('class="home-hero'), html.indexOf('class="ledger"'));
      expect(hero, theme).toContain("Estimated manual engineering effort: approximate time one engineer would need to deliver the same changes without AI assistance. A modeled baseline, not actual hours worked.");
      expect(html.match(/Estimated manual engineering effort: approximate time/g)?.length, theme).toBeGreaterThanOrEqual(1);
      expect(hero.match(/class="alloc-bar /g), theme).toHaveLength(1);
      // Hub = 90 of 128h, same color slot as on report pages (colorOrder[0] -> alloc-c1).
      expect(hero, theme).toContain('alloc-seg alloc-c1" style="--grow:70.31" title="Hub 70%"');
      expect(hero, theme).toContain('title="Pricing 22%"');
      expect(hero, theme).toContain("Docs");
      // Totals stay, as quiet secondary stats.
      expect(hero, theme).toContain("<dd>");
      expect(hero, theme).toContain("pull requests");
      // Planning links come after the ledger, not between the hero and the ledger.
      expect(html.indexOf("Thinking about new work?"), theme).toBeGreaterThan(html.indexOf("Activity ledger"));
    }
  });

  it("shows month total engineer-days and a labelled daily tape", () => {
    const html = render();
    const october = html.slice(html.indexOf('id="month-2026-10"'), html.indexOf('id="month-2026-09"'));
    expect(october).toContain("≈ 15 engineer-days");
    expect(october).toContain('aria-label="Estimated effort per day"');
    expect(october).toContain('title="Estimated effort per day"');
    expect(october).toContain("<b>6</b> commits");
    expect(html).toContain('id="month-2026-09"');
    expect(html).not.toMatch(/<details class="month-group" open id="month-2026-09"/);
    expect(html).toContain(".month-group[open] .month-tape { display: none; }");
  });

  it("makes the whole week row the link and keeps the day list outside it", () => {
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = render(theme);
      const row = html.slice(html.indexOf('<a href="weeks/2026-10-01/" class="week-row">'));
      const link = row.slice(0, row.indexOf("</a>"));
      expect(link, theme).toContain("<strong>Oct 1-7</strong>");
      expect(link, theme).toContain("≈ 10 engineer-days");
      expect(link, theme).toContain("<b>4</b> commits");
      expect(link, theme).toContain("<b>2</b> PRs");
      expect(link, theme).toContain("<b>2</b> reviews");
      expect(link, theme).toContain("week-outcome");
      expect(link, theme).not.toContain("<details");
      expect(link, theme).not.toContain("daily reports");
      expect(row.slice(link.length), theme).toMatch(/^<\/a>\s*<details class="week-days">/);
    }
  });

  it("keeps day titles, subtitles and counts discoverable, expanding only the newest week", () => {
    const detailed = [
      buildReportEntry("2026/10/01", "Invoice export live", "CSV and PDF released", { commits: 4, prs: 2, reviews: 1, hours: 8 }),
      buildReportEntry("2026/10/08", "Role editor draft", "First admin pass", { commits: 7, prs: 3, reviews: 5, hours: 8 }),
    ];
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderIndexPage(detailed, undefined, "en", undefined, undefined, undefined, theme);
      expect(html, theme).toContain('title="Invoice export live">Invoice export live</div>');
      expect(html, theme).toContain('title="CSV and PDF released">CSV and PDF released</div>');
      expect(html, theme).toContain('aria-label="7 commits, 3 pull requests, 5 reviews"');
      expect(html, theme).toContain('<span title="pull requests"><b>3</b> PR</span>');
      // Newest week's day list starts open; the older week is one click away.
      expect(html, theme).toContain('<details class="week-days" open>');
      expect(html.match(/<details class="week-days"/g), theme).toHaveLength(2);
      expect(html.match(/<details class="week-days" open>/g), theme).toHaveLength(1);
      const newest = html.slice(html.indexOf('href="weeks/2026-10-08/"'));
      expect(newest.slice(0, newest.indexOf("</details>")), theme).toContain('<details class="week-days" open>');
    }
  });

  it("points capped outcome and initiative summaries at the full week", () => {
    const many = makeAllocation([
      ["Hub", 30, { shipped: [item("A", 9, "live"), item("B", 8, "live"), item("C", 7, "done"), item("D", 6, "done")] }],
      ["Pricing", 20], ["Docs", 10], ["Platform", 5], ["Search", 3],
    ]);
    const html = renderIndexPage(
      [buildReportEntry("2026/10/01", "x", undefined, { commits: 1, prs: 0, reviews: 0, hours: 8 })],
      undefined, "en", undefined, undefined, undefined, "brutalist",
      { weekAllocations: new Map([["2026-10-01", many]]) },
    );
    expect(html).toContain('<div class="week-flag week-more">+1 more completed, +2 more initiatives: see the full week</div>');
    expect(html).toContain('class="week-outcome" title="Live: A, B \u00b7 Code integrated: C"');
    // The cue sits inside the week row link, so it leads to the week page.
    const row = html.slice(html.indexOf('<a href="weeks/2026-10-01/" class="week-row">'));
    expect(row.slice(0, row.indexOf("</a>"))).toContain("week-more");
  });

  it("omits the more cue when the week row already shows everything", () => {
    const small = makeAllocation([["Hub", 10, { shipped: [item("A", 4, "live")] }], ["Docs", 5]]);
    const html = renderIndexPage(
      [buildReportEntry("2026/10/01", "x", undefined, { commits: 1, prs: 0, reviews: 0, hours: 8 })],
      undefined, "en", undefined, undefined, undefined, "brutalist",
      { weekAllocations: new Map([["2026-10-01", small]]) },
    );
    expect(html).not.toContain('class="week-flag week-more"');
  });

  it("counts names hidden inside the Other segment", () => {
    const allocation = makeAllocation([["One", 4], ["Two", 3], ["Three", 2]]);
    const html = renderIndexPage(
      [buildReportEntry("2026/10/01", "x", undefined, { commits: 1, prs: 0, reviews: 0, hours: 8 })],
      undefined, "en", undefined, undefined, undefined, "brutalist",
      { weekAllocations: new Map([["2026-10-01", allocation]]), colorOrder: Array.from({ length: 9 }, (_, i) => `Another ${i}`) },
    );
    expect(html).toContain("+3 more initiatives: see the full week");
  });

  it("counts hidden in-progress items and deduplicates titles", () => {
    const wip = makeAllocation([["Hub", 9, { inProgress: [item("W1", 4), item("W2", 3), item("W3", 2), item("feat: W2", 1), item("W4", 1)] }]]);
    expect(buildOutcomeSummary(wip)).toEqual({ line: "In progress: W1, W2, W3", more: 1, moreNoun: "in progress" });
    expect(buildOutcomeSummary(undefined)).toEqual({ line: "", more: 0, moreNoun: "completed" });
  });

  it("shows that in-progress work exists when completed changes lead the outcome", () => {
    const mixed = makeAllocation([["Hub", 10, { shipped: [item("Done", 4, "live")], inProgress: [item("WIP", 3)] }]]);
    const html = renderIndexPage(
      [buildReportEntry("2026/10/01", "x", undefined, { commits: 1, prs: 1, reviews: 0, hours: 8 })],
      undefined, "en", undefined, undefined, undefined, "brutalist",
      { weekAllocations: new Map([["2026-10-01", mixed]]) },
    );
    expect(html).toContain("+1 in progress: see the full week");
  });

  it("scales week bars on a shared scale with the largest week at 100%", () => {
    const html = render();
    const width = (id: string) => {
      const row = html.slice(html.indexOf(`href="weeks/${id}/" class="week-row"`));
      return /class="week-mix-fill" style="width: ([\d.]+)%"/.exec(row.slice(0, row.indexOf("</a>")))?.[1];
    };
    expect(width("2026-10-01")).toBe("100");
    expect(width("2026-10-08")).toBe("50");
    expect(width("2026-09-24")).toBe("10");
    expect(html).toContain('title="Hub 75%"');
    expect(html).toContain('title="Pricing 25%"');
  });

  it("builds the outcome line live-first, by effort, without conventional prefixes", () => {
    const html = render();
    expect(html).toContain("Live: CSV import, Contact methods \u00b7 Code integrated: Merged big");
    expect(html).toContain("In progress: Another WIP, Draft thing");
    expect(html).not.toContain("feat(hub):");
  });

  it("caps the outcome line at three items and omits it when there is nothing", () => {
    const many = makeAllocation([["Hub", 9, { shipped: [item("A", 4, "live"), item("B", 3, "live"), item("C", 2, "live"), item("D", 9, "done")] }]]);
    expect(buildOutcomeLine(many)).toBe("Live: A, B, C");
    expect(buildOutcomeLine(makeAllocation([["Hub", 9, { shipped: [item("D", 9, "done"), item("E", 1)] }]]))).toBe("Code integrated: D, E");
    expect(buildOutcomeLine(makeAllocation([["Hub", 9, { shipped: [item("A", 9, "done"), item("B", 5, "preview"), item("C", 3, "awaiting-release")] }]]))).toBe("Not live yet: B, C \u00b7 Code integrated: A");
    expect(buildOutcomeLine(makeAllocation([["Hub", 5]]))).toBe("");
    expect(buildOutcomeLine(undefined)).toBe("");
    const none = renderIndexPage([day("2026/10/01", 8)], undefined, "en", undefined, undefined, undefined, "brutalist");
    expect(none).not.toContain('class="week-outcome"');
  });

  it("uses days only everywhere (no engineer-weeks) even for large totals", () => {
    const big = [day("2026/10/01", 4000), day("2026/10/02", 4000)];
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderIndexPage(big, undefined, "en", undefined, undefined, undefined, theme);
      expect(html, theme).toContain("≈ 1,000");
      expect(html, theme).not.toMatch(/engineer-weeks?|eng-wks?/);
    }
  });

  it("omits effort figures when no hours are known", () => {
    const html = renderIndexPage([buildReportEntry("2026/10/01", "x", undefined, { commits: 1, prs: 0, reviews: 0 })]);
    expect(html).not.toContain("≈");
    expect(html).not.toContain('class="week-mix');
  });
});

describe("effort totals follow the week allocations (manual time included)", () => {
  // Week of Oct 1: 8h from GitHub reports, but its allocation totals 24h (16h manual time).
  // Week of Oct 8: 16h from GitHub reports, with an allocation of 16h.
  const reports = [
    buildReportEntry("2026/10/01", "a", undefined, { commits: 1, prs: 0, reviews: 0, hours: 8 }),
    buildReportEntry("2026/10/08", "b", undefined, { commits: 1, prs: 0, reviews: 0, hours: 16 }),
  ];
  const width = (html: string, id: string) => {
    const row = html.slice(html.indexOf(`href="weeks/${id}/" class="week-row"`));
    return /class="week-mix-fill" style="width: ([\d.]+)%"/.exec(row.slice(0, row.indexOf("</a>")))?.[1];
  };
  const hero = (html: string) => html.slice(html.indexOf('class="home-hero'), html.indexOf('class="ledger"'));
  const weekAllocations = new Map([
    ["2026-10-01", makeAllocation([["Pricing", 24]])],
    ["2026-10-08", makeAllocation([["Hub", 16]])],
  ]);

  it("uses allocation totals for week labels, bar widths, month and hero totals", () => {
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderIndexPage(reports, undefined, "en", undefined, undefined, undefined, theme,
        { weekAllocations, hasEstimatePage: false });
      expect(html, theme).toContain("≈ 3 engineer-days");
      expect(html, theme).toContain("≈ 2 engineer-days");
      expect(hero(html), theme).toContain('<span class="home-hero-value">≈ 5</span>');
      expect(html, theme).toContain("≈ 5 engineer-days");
      expect(width(html, "2026-10-01"), theme).toBe("100");
      expect(width(html, "2026-10-08"), theme).toBe("66.7");
    }
  });

  it("builds the hero mix and hero total from the same allocation hours", () => {
    const html = renderIndexPage(reports, undefined, "en", undefined, undefined, undefined, "brutalist",
      { weekAllocations, hasEstimatePage: false });
    // 24h Pricing + 16h Hub = 40h total, so Pricing is 60% and Hub 40%.
    expect(hero(html)).toContain('title="Pricing 60%"');
    expect(hero(html)).toContain('title="Hub 40%"');
    expect(hero(html)).toContain('<span class="home-hero-value">≈ 5</span>');
  });

  it("falls back to report hours when no allocations are provided", () => {
    const html = renderIndexPage(reports, undefined, "en", undefined, undefined, undefined, "brutalist");
    expect(hero(html)).toContain('<span class="home-hero-value">≈ 3</span>');
    expect(html).toContain("≈ 3 engineer-days");
    expect(html).toContain("≈ 1 engineer-day");
    expect(html).toContain("≈ 2 engineer-days");
  });

  it("keeps report hours for a week whose allocation has no hours", () => {
    const html = renderIndexPage(reports, undefined, "en", undefined, undefined, undefined, "brutalist",
      { weekAllocations: new Map([["2026-10-01", makeAllocation([])]]) });
    expect(html).toContain("≈ 1 engineer-day");
    expect(hero(html)).toContain('<span class="home-hero-value">≈ 3</span>');
  });
});

describe("self-reported-only weeks on the homepage", () => {
  // Week of Oct 8: 16h from a daily report. Week of Oct 1: no daily report, 24h of manual time only.
  const reports = [buildReportEntry("2026/10/08", "b", undefined, { commits: 1, prs: 0, reviews: 0, hours: 16 })];
  const weekAllocations = new Map([
    ["2026-10-01", makeAllocation([["Pricing", 24]])],
    ["2026-10-08", makeAllocation([["Hub", 16]])],
  ]);

  it("adds a row for the manual-only week and counts it in the month and hero totals", () => {
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderIndexPage(reports, undefined, "en", undefined, undefined, undefined, theme, { weekAllocations });
      const row = html.slice(html.indexOf('href="weeks/2026-10-01/" class="week-row"'));
      expect(row, theme).toContain("≈ 3 engineer-days");
      expect(html, theme).toContain("No daily reports · self-reported time only");
      // Only the week with reports keeps a day list.
      expect(html.match(/<details class="week-days"/g), theme).toHaveLength(1);
      // 24h + 16h = 40h: the month and hero totals include the manual-only week.
      expect(html, theme).toContain("≈ 5 engineer-days");
      const hero = html.slice(html.indexOf('class="home-hero'), html.indexOf('class="ledger"'));
      expect(hero, theme).toContain('<span class="home-hero-value">≈ 5</span>');
    }
  });

  it("keeps the manual-only week in the bar scale", () => {
    const html = renderIndexPage(reports, undefined, "en", undefined, undefined, undefined, "brutalist", { weekAllocations });
    const width = (id: string) => {
      const row = html.slice(html.indexOf(`href="weeks/${id}/" class="week-row"`));
      return /class="week-mix-fill" style="width: ([\d.]+)%"/.exec(row.slice(0, row.indexOf("</a>")))?.[1];
    };
    expect(width("2026-10-01")).toBe("100");
    expect(width("2026-10-08")).toBe("66.7");
  });

  it("ignores allocations with no hours", () => {
    const html = renderIndexPage(reports, undefined, "en", undefined, undefined, undefined, "brutalist",
      { weekAllocations: new Map([["2026-10-01", makeAllocation([])]]) });
    expect(html).not.toContain("self-reported time only");
    expect(html).not.toContain('href="weeks/2026-10-01/" class="week-row"');
  });
});

describe("hoursToActivityPercent", () => {
  it("maps 0/missing hours to a min tick, 8h to ~33%, and 24h+ to full", () => {
    expect(hoursToActivityPercent(0)).toBe(4);
    expect(hoursToActivityPercent(-1)).toBe(4);
    expect(hoursToActivityPercent(8)).toBe(33);
    expect(hoursToActivityPercent(18)).toBe(75);
    expect(hoursToActivityPercent(24)).toBe(100);
    expect(hoursToActivityPercent(54)).toBe(100);
  });
});

describe("buildReportEntry", () => {
  it("falls back to path when no slash is present", () => {
    const entry = buildReportEntry("legacy");
    expect(entry.path).toBe("legacy");
    // path.split("/") returns ["legacy"], so [1] is undefined -> falls back to path
    expect(entry.week).toBe("legacy");
    expect(entry.year).toBe("legacy");
    expect(entry.dateLabel).toContain("legacy");
  });

  it("propagates optional fields when provided", () => {
    const entry = buildReportEntry(
      "2026/W14",
      "Title",
      "Subtitle",
      { commits: 1, prs: 2, reviews: 3 },
      "2026-04-05",
      "Overview text",
    );
    expect(entry.title).toBe("Title");
    expect(entry.subtitle).toBe("Subtitle");
    expect(entry.stats).toEqual({ commits: 1, prs: 2, reviews: 3 });
    expect(entry.dateTo).toBe("2026-04-05");
    expect(entry.overview).toBe("Overview text");
  });
});
