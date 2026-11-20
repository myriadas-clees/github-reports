import { describe, it, expect } from "vitest";
import { loadTheme, readThemeTemplate, AVAILABLE_THEMES } from "./index.js";
import { renderReport } from "../index.js";
import type { WeeklyReportData } from "../../types.js";

const MOCK_DATA: WeeklyReportData = {
  username: "testuser",
  avatarUrl: "https://avatars.githubusercontent.com/u/12345",
  dateRange: { from: "2026-03-28", to: "2026-04-03" },
  stats: {
    totalCommits: 42,
    totalAdditions: 1200,
    totalDeletions: 300,
    prsOpened: 5,
    prsMerged: 3,
    prsInProgress: 0,
    prsReviewed: 8,
    reviewComments: 0,
    issuesOpened: 2,
    issuesClosed: 1,
    estimatedHours: 0,
  },
  dailyCommits: [],
  repositories: [],
  pullRequests: [],
  issues: [],
  events: [],
  commitMessages: [],
  releases: [],
  externalContributions: [],
  aiContent: {
    title: "Auth refactor completed",
    subtitle: "A focused backend week",
    overview: "First paragraph.\n\nSecond paragraph.",
    summaries: [
      {
        type: "commit-summary",
        heading: "42 commits",
        body: "Lots of commits.",
        chips: [{ label: "lines", value: "+1200 -300", color: "green" }],
      },
    ],
    highlights: [
      {
        type: "pr",
        title: "feat: add OAuth flow",
        repo: "org/backend",
        meta: "integrated Apr 2",
        body: "## Why\n\nBig PR with `tokens` and a [link](https://example.com).",
      },
    ],
  },
};

describe("AVAILABLE_THEMES", () => {
  it("includes brutalist", () => {
    expect(AVAILABLE_THEMES).toContain("brutalist");
  });

  it("includes minimal", () => {
    expect(AVAILABLE_THEMES).toContain("minimal");
  });

  it("includes editorial", () => {
    expect(AVAILABLE_THEMES).toContain("editorial");
  });

  it("includes swiss", () => {
    expect(AVAILABLE_THEMES).toContain("swiss");
  });
});

describe("loadTheme", () => {
  it("loads brutalist theme by default", () => {
    const theme = loadTheme();
    expect(theme.buildCSS).toBeTypeOf("function");
    expect(theme.buildIndexCSS).toBeTypeOf("function");
    expect(theme.colors.bg).toBe("#f8f7f4");
    expect(theme.colors.accent).toBe("#cc2647");
    expect(theme.templatesDir).toContain("themes/brutalist/templates");
  });

  it("loads brutalist theme explicitly", () => {
    const theme = loadTheme("brutalist");
    expect(theme.colors.bg).toBe("#f8f7f4");
  });

  it("brutalist has theme toggle scripts", () => {
    const theme = loadTheme("brutalist");
    expect(theme.themeInitScript).toContain("localStorage");
    expect(theme.themeToggleScript).toContain("theme-toggle");
  });

  it("brutalist buildCSS consumes Myriad theme tokens", () => {
    const theme = loadTheme("brutalist");
    const css = theme.buildCSS("en");
    expect(css).toContain("var(--page-bg)");
    expect(css).toContain("var(--neutral-10)");
    expect(css).toContain("var(--size-m)");
    expect(css).toContain("var(--radius-m)");
    expect(css).not.toContain("--b-");
  });

  it("brutalist buildCSS is light-first with warm dark via prefers-color-scheme", () => {
    const theme = loadTheme("brutalist");
    const css = theme.buildCSS("en");
    expect(css).toContain("--neutral-1: #f2f1ee");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toMatch(/html\[data-theme="dark"\] \{ color-scheme: dark;[^}]*--neutral-1: #1a1817/);
    expect(theme.themeInitScript).toContain("data-theme");
  });

  it("brutalist keeps actions, focus and progress monotone and reds as accents only", () => {
    const css = loadTheme("brutalist").buildCSS("en");
    expect(css).toContain("--action: var(--neutral-10)");
    expect(css).toContain("outline: var(--focus-ring-outline)");
    expect(css).toMatch(/\.repo-bar-fill \{[^}]*background: var\(--neutral-9\)/);
    // Brand red is referenced only by the nav-accent token (kicker rule), never directly by a component.
    expect(css.match(/var\(--color-1\)/g)).toHaveLength(1);
  });

  it("brutalist makes no third-party font requests", () => {
    const theme = loadTheme("brutalist");
    for (const lang of ["en", "ja", "ko"] as const) {
      expect(theme.buildCSS(lang)).not.toContain("fonts.googleapis.com");
      expect(theme.buildCSS(lang)).not.toContain("@import");
    }
  });

  it("brutalist buildCSS supports data-theme attribute override", () => {
    const theme = loadTheme("brutalist");
    const css = theme.buildCSS("en");
    expect(css).toContain('html[data-theme="light"]');
    expect(css).toContain('html[data-theme="dark"]');
  });

  it("brutalist buildCSS includes scoped markdown prose styles", () => {
    const theme = loadTheme("brutalist");
    const css = theme.buildCSS("en");
    expect(css).toContain(".md a");
    expect(css).toContain(".md h2");
    expect(css).toContain(".md blockquote");
    expect(css).toContain(".md pre");
    expect(css).toContain(".md ul");
  });

  it("loads minimal theme", () => {
    const theme = loadTheme("minimal");
    expect(theme.buildCSS).toBeTypeOf("function");
    expect(theme.buildIndexCSS).toBeTypeOf("function");
    expect(theme.colors.bg).toBe("#ffffff");
    expect(theme.colors.accent).toBe("#0066cc");
    expect(theme.templatesDir).toContain("themes/minimal/templates");
  });

  it("throws for unknown theme", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => loadTheme("nonexistent" as any)).toThrow("Unknown theme");
  });

  it("buildCSS returns valid CSS string", () => {
    const theme = loadTheme("brutalist");
    const css = theme.buildCSS("en");
    expect(css).toContain("body");
    expect(css).toContain("#f2f1ee");
    expect(css).toContain("#cc2647");
    expect(css).toContain("Roboto");
  });

  it("buildIndexCSS returns valid CSS string", () => {
    const theme = loadTheme("brutalist");
    const css = theme.buildIndexCSS("en");
    expect(css).toContain(".home-hero");
    expect(css).toContain("var(--surface)");
  });
});

describe("minimal theme", () => {
  it("buildCSS uses system font stack (no Google Fonts)", () => {
    const theme = loadTheme("minimal");
    const css = theme.buildCSS("en");
    expect(css).toContain("-apple-system");
    expect(css).not.toContain("@import url");
    expect(css).not.toContain("fonts.googleapis.com");
  });

  it("buildCSS includes print styles", () => {
    const theme = loadTheme("minimal");
    const css = theme.buildCSS("en");
    expect(css).toContain("@media print");
  });

  it("buildCSS uses CSS custom properties for colors", () => {
    const theme = loadTheme("minimal");
    const css = theme.buildCSS("en");
    expect(css).toContain("var(--bg)");
    expect(css).toContain("var(--text)");
    expect(css).toContain("var(--accent)");
  });

  it("buildCSS defines light-first color scheme", () => {
    const theme = loadTheme("minimal");
    const css = theme.buildCSS("en");
    expect(css).toContain("--bg: #ffffff");
  });

  it("buildCSS includes dark mode via prefers-color-scheme", () => {
    const theme = loadTheme("minimal");
    const css = theme.buildCSS("en");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("--bg: #111111");
  });

  it("buildCSS supports data-theme attribute override", () => {
    const theme = loadTheme("minimal");
    const css = theme.buildCSS("en");
    expect(css).toContain('html[data-theme="light"]');
    expect(css).toContain('html[data-theme="dark"]');
  });

  it("buildCSS includes scoped markdown prose styles", () => {
    const theme = loadTheme("minimal");
    const css = theme.buildCSS("en");
    expect(css).toContain(".md a");
    expect(css).toContain(".md blockquote");
    expect(css).toContain(".md pre");
  });

  it("provides theme init and toggle scripts", () => {
    const theme = loadTheme("minimal");
    expect(theme.themeInitScript).toContain("localStorage");
    expect(theme.themeInitScript).toContain("data-theme");
    expect(theme.themeToggleScript).toContain("theme-toggle");
    expect(theme.themeToggleScript).toContain("localStorage.setItem");
  });

  it("renders theme toggle button in report", () => {
    const html = renderReport(MOCK_DATA, { theme: "minimal" });
    expect(html).toContain("theme-toggle");
    expect(html).toContain("localStorage");
  });

  it("buildIndexCSS is concise", () => {
    const theme = loadTheme("minimal");
    const css = theme.buildIndexCSS("en");
    expect(css).toContain(".week-item");
    expect(css).toContain(".year-label");
  });

  it("renders report with minimal theme", () => {
    const html = renderReport(MOCK_DATA, { theme: "minimal" });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("Auth refactor completed");
    expect(html).toContain("testuser");
    expect(html).toContain("var(--bg)");
  });

  it("renders highlights as list items", () => {
    const html = renderReport(MOCK_DATA, { theme: "minimal" });
    expect(html).toContain("highlight-list");
    expect(html).toContain("highlight-item");
    expect(html).toContain("feat: add OAuth flow");
  });

  it("includes dofollow footer links", () => {
    const html = renderReport(MOCK_DATA, { theme: "minimal" });
    expect(html).toContain("deariary.com?utm_source=github-weekly-reporter&utm_medium=footer");
    expect(html).not.toContain('rel="nofollow"');
  });

  it("renders Japanese locale", () => {
    const html = renderReport(MOCK_DATA, { theme: "minimal", language: "ja" });
    expect(html).toContain('lang="ja"');
  });
});

describe("readThemeTemplate", () => {
  it("reads report.hbs from brutalist theme", () => {
    const theme = loadTheme("brutalist");
    const content = readThemeTemplate(theme, "report.hbs");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("{{themeColor}}");
  });

  it("reads partials from brutalist theme", () => {
    const theme = loadTheme("brutalist");
    const header = readThemeTemplate(theme, "partials/header.hbs");
    expect(header).toContain("header-author");
  });

  it("reads index-page.hbs from brutalist theme", () => {
    const theme = loadTheme("brutalist");
    const content = readThemeTemplate(theme, "index-page.hbs");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("overhead-title");
  });

  it("reads report.hbs from minimal theme", () => {
    const theme = loadTheme("minimal");
    const content = readThemeTemplate(theme, "report.hbs");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("{{themeColor}}");
  });

  it("reads index-page.hbs from minimal theme", () => {
    const theme = loadTheme("minimal");
    const content = readThemeTemplate(theme, "index-page.hbs");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("index-header");
  });

  it("reads report.hbs from editorial theme", () => {
    const theme = loadTheme("editorial");
    const content = readThemeTemplate(theme, "report.hbs");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("{{themeColor}}");
  });

  it("reads index-page.hbs from editorial theme", () => {
    const theme = loadTheme("editorial");
    const content = readThemeTemplate(theme, "index-page.hbs");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("index-header");
  });
});

describe("editorial theme", () => {
  it("loads editorial theme", () => {
    const theme = loadTheme("editorial");
    expect(theme.buildCSS).toBeTypeOf("function");
    expect(theme.colors.bg).toBe("#faf8f5");
    expect(theme.colors.accent).toBe("#c45d3e");
    expect(theme.templatesDir).toContain("themes/editorial/templates");
  });

  it("buildCSS includes Playfair Display and Newsreader", () => {
    const theme = loadTheme("editorial");
    const css = theme.buildCSS("en");
    expect(css).toContain("Playfair Display");
    expect(css).toContain("Newsreader");
  });

  it("buildCSS uses CSS custom properties", () => {
    const theme = loadTheme("editorial");
    const css = theme.buildCSS("en");
    expect(css).toContain("var(--e-bg)");
    expect(css).toContain("var(--e-accent)");
    expect(css).toContain("var(--e-drop-cap)");
  });

  it("buildCSS includes drop cap styling", () => {
    const theme = loadTheme("editorial");
    const css = theme.buildCSS("en");
    expect(css).toContain("first-letter");
  });

  it("buildCSS includes dark mode", () => {
    const theme = loadTheme("editorial");
    const css = theme.buildCSS("en");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("--e-bg: #1a1816");
  });

  it("buildCSS supports data-theme override", () => {
    const theme = loadTheme("editorial");
    const css = theme.buildCSS("en");
    expect(css).toContain('html[data-theme="light"]');
    expect(css).toContain('html[data-theme="dark"]');
  });

  it("buildCSS includes scoped markdown prose styles", () => {
    const theme = loadTheme("editorial");
    const css = theme.buildCSS("en");
    expect(css).toContain(".md a");
    expect(css).toContain(".md h3");
    expect(css).toContain(".md blockquote");
  });

  it("has theme toggle scripts", () => {
    const theme = loadTheme("editorial");
    expect(theme.themeInitScript).toContain("localStorage");
    expect(theme.themeToggleScript).toContain("theme-toggle");
  });

  it("renders report with editorial theme", () => {
    const html = renderReport(MOCK_DATA, { theme: "editorial" });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("Auth refactor completed");
    expect(html).toContain("Playfair Display");
    expect(html).toContain("first-letter");
  });

  it("renders highlights in column stack", () => {
    const html = renderReport(MOCK_DATA, { theme: "editorial" });
    expect(html).toContain("stack-card");
    expect(html).toContain("highlight-badge");
    expect(html).toContain("feat: add OAuth flow");
  });

  it("includes horizontal scroll strip layout with fixed footer", () => {
    const html = renderReport(MOCK_DATA, { theme: "editorial" });
    expect(html).toContain("scroll-strip");
    expect(html).toContain("panel-cover");
    expect(html).toContain("column-stack");
    expect(html).toContain("fixed-footer");
  });

  it("buildIndexCSS returns valid CSS string", () => {
    const theme = loadTheme("editorial");
    const css = theme.buildIndexCSS("en");
    expect(css).toContain(".index-header");
    expect(css).toContain("Playfair Display");
    expect(css).toContain("var(--e-bg)");
  });
});

describe("swiss theme", () => {
  it("loads swiss theme", () => {
    const theme = loadTheme("swiss");
    expect(theme.buildCSS).toBeTypeOf("function");
    expect(theme.colors.bg).toBe("#ffffff");
    expect(theme.colors.accent).toBe("#ff0000");
    expect(theme.templatesDir).toContain("themes/swiss/templates");
  });

  it("buildCSS includes Space Grotesk", () => {
    const theme = loadTheme("swiss");
    const css = theme.buildCSS("en");
    expect(css).toContain("Space Grotesk");
  });

  it("buildCSS uses CSS custom properties", () => {
    const theme = loadTheme("swiss");
    const css = theme.buildCSS("en");
    expect(css).toContain("var(--s-bg)");
    expect(css).toContain("var(--s-accent)");
    expect(css).toContain("var(--s-border)");
  });

  it("buildCSS includes asymmetric grid layout", () => {
    const theme = loadTheme("swiss");
    const css = theme.buildCSS("en");
    expect(css).toContain("swiss-layout");
    expect(css).toContain("grid-template-columns: 80px 1fr");
  });

  it("buildCSS includes dark mode", () => {
    const theme = loadTheme("swiss");
    const css = theme.buildCSS("en");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("--s-bg: #0a0a0a");
  });

  it("buildCSS supports data-theme override", () => {
    const theme = loadTheme("swiss");
    const css = theme.buildCSS("en");
    expect(css).toContain('html[data-theme="light"]');
    expect(css).toContain('html[data-theme="dark"]');
  });

  it("buildCSS includes scoped markdown prose styles", () => {
    const theme = loadTheme("swiss");
    const css = theme.buildCSS("en");
    expect(css).toContain(".md a");
    expect(css).toContain(".md pre");
    expect(css).toContain(".md ul");
  });

  it("has theme toggle scripts", () => {
    const theme = loadTheme("swiss");
    expect(theme.themeInitScript).toContain("localStorage");
    expect(theme.themeToggleScript).toContain("theme-toggle");
  });

  it("renders report with swiss theme", () => {
    const html = renderReport(MOCK_DATA, { theme: "swiss" });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("Auth refactor completed");
    expect(html).toContain("Space Grotesk");
    expect(html).toContain("swiss-layout");
  });

  it("renders section numbers and geometric motifs", () => {
    const html = renderReport(MOCK_DATA, { theme: "swiss" });
    expect(html).toContain("section-num");
    expect(html).toContain("overview-geo");
  });

  it("renders highlights in grid layout", () => {
    const html = renderReport(MOCK_DATA, { theme: "swiss" });
    expect(html).toContain("highlight-grid");
    expect(html).toContain("highlight-card");
    expect(html).toContain("feat: add OAuth flow");
  });

  it("buildIndexCSS returns valid CSS string", () => {
    const theme = loadTheme("swiss");
    const css = theme.buildIndexCSS("en");
    expect(css).toContain(".index-layout");
    expect(css).toContain("Space Grotesk");
  });
});
