import { describe, it, expect } from "vitest";
import { renderIndexPage, buildReportEntry } from "./index-page.js";

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
    expect(html).toContain('<details class="month-group" open>');
    expect(html).toContain("--activity:");
  });

  it("keeps legacy weekly entries in the brutalist archive", () => {
    const html = renderIndexPage([buildReportEntry("2026/W14", "Weekly delivery")]);
    expect(html).toContain("Weekly delivery");
    expect(html).toContain('href="2026/W14/"');
    expect(html).toContain("Weekly");
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
