import { describe, it, expect } from "vitest";
import { renderReport } from "./index.js";
import type { WeeklyReportData } from "../types.js";

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
    overview: "First paragraph about the week.\n\nSecond paragraph with details.",
    summaries: [
      {
        type: "commit-summary",
        heading: "47 commits",
        body: "Lots of commits this week.",
        chips: [
          { label: "lines", value: "+1200 -300", color: "green" },
        ],
      },
    ],
    highlights: [
      {
        type: "pr",
        title: "feat: add OAuth flow",
        repo: "org/backend",
        meta: "merged Apr 2",
        body: "Big PR for auth.",
      },
    ],
  },
};

describe("renderReport", () => {
  it("produces valid HTML with DOCTYPE", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("</html>");
  });

  it("includes username in nav", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toContain("testuser");
  });

  it("includes date range in header", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toContain("2026-03-28");
    expect(html).toContain("2026-04-03");
  });

  it("renders AI content", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toContain("Auth refactor completed");
    expect(html).toContain("A focused backend week");
    expect(html).toContain("First paragraph about the week.");
    expect(html).toContain("Second paragraph with details.");
  });

  it("skips overview when it duplicates stakeholder summary", () => {
    const summary = "Stakeholder-facing week summary.";
    const html = renderReport({
      ...MOCK_DATA,
      stakeholderSummary: summary,
      aiContent: {
        ...MOCK_DATA.aiContent!,
        overview: summary,
      },
    });
    expect(html).toContain('class="stakeholder"');
    expect(html).toContain(summary);
    expect(html).not.toContain('class="overview"');
  });

  it("renders distinct overview alongside stakeholder summary", () => {
    const html = renderReport({
      ...MOCK_DATA,
      stakeholderSummary: "Stakeholder-facing week summary.",
      aiContent: {
        ...MOCK_DATA.aiContent!,
        overview: "Distinct AI narrative overview.",
      },
    });
    expect(html).toContain('class="stakeholder"');
    expect(html).toContain("Stakeholder-facing week summary.");
    expect(html).toContain('class="overview md"');
    expect(html).toContain("Distinct AI narrative overview.");
  });

  it("does not render the duplicate Overview summaries block", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).not.toContain(">Overview<");
    expect(html).not.toContain("commit-summary");
    expect(html).toContain(">Activity<");
  });

  it("renders only key activity-stats chips", () => {
    const html = renderReport({
      ...MOCK_DATA,
      hoursEstimate: {
        hours: 12.5,
        sessions: 3,
        sessionHours: 8,
        volumeHours: 12.5,
        gapMinutes: 90,
        maxSessionHours: 6,
        note: "Estimated effort — not tracked time. Combines timestamps and volume.",
      },
    });
    const statsBlock = html.match(
      /class="data-chips activity-stats">([\s\S]*?)<\/div>/,
    )?.[1];
    expect(statsBlock).toBeTruthy();
    expect(statsBlock).toContain("PRs merged");
    expect(statsBlock).toContain("Lines");
    expect(statsBlock).toContain("Estimated engineering hours");
    expect(statsBlock).toContain("~12.5h");
    expect(statsBlock).not.toContain("Commits");
    expect(statsBlock).not.toContain("PRs opened");
    expect(statsBlock).not.toContain("In progress");
    expect(statsBlock).not.toContain("Reviews");
    expect(statsBlock).not.toContain("Review comments");
    expect(statsBlock).not.toContain("From timestamps");
    expect(statsBlock).not.toContain("From PR volume");
    expect(html).toContain("Conventional engineering effort estimate — not tracked, elapsed, or billed time.");
    expect(html).not.toContain("Combines timestamps and volume.");
  });

  it("renders Codex/Cursor activity chips instead of personal review lists", () => {
    const html = renderReport({
      ...MOCK_DATA,
      codeReviews: [
        {
          repository: "org/backend",
          prNumber: 1,
          prTitle: "should not render",
          prUrl: "https://github.com/org/backend/pull/1",
          state: "commented",
          submittedAt: "2026-07-24T18:00:00Z",
          body: null,
        },
      ],
      reviewComments: [
        {
          repository: "org/backend",
          prNumber: 1,
          prUrl: "https://github.com/org/backend/pull/1",
          url: "https://github.com/org/backend/pull/1#discussion_r1",
          body: "Fixed in abc. Should not render as a list.",
          path: "src/a.ts",
          createdAt: "2026-07-24T18:00:00Z",
        },
      ],
      aiReviews: {
        codex: { prsReviewed: 8, comments: 20, reviews: 5, fixed: 4 },
        cursor: { prsReviewed: 0, comments: 0, reviews: 0, fixed: 0 },
        prsReviewed: 8,
        comments: 20,
        reviews: 5,
        fixed: 4,
      },
    });
    expect(html).toContain("AI code reviews done");
    expect(html).toContain("Codex");
    expect(html).toContain("5 reviews");
    expect(html).toContain("20 comments");
    expect(html).toContain("8 PRs");
    expect(html).not.toContain("4 fixed");
    expect(html).toContain('class="data-chips ai-review-activity"');
    expect(html).not.toContain(">Code reviews<");
    expect(html).not.toContain(">Review comments<");
    expect(html).not.toContain("Fixed in abc. Should not render as a list.");
  });

  it("renders legacy aiReviewFixes as done-comment chips", () => {
    const html = renderReport({
      ...MOCK_DATA,
      aiReviewFixes: { codex: 4, cursor: 0, total: 4 },
    });
    expect(html).toContain("AI code reviews done");
    expect(html).toContain("4 comments");
    expect(html).not.toContain("4 fixed");
    expect(html).not.toContain("20 comments");
  });

  it("hides AI code reviews section when activity is zero", () => {
    const html = renderReport({
      ...MOCK_DATA,
      aiReviews: {
        codex: { prsReviewed: 0, comments: 0, reviews: 0, fixed: 0 },
        cursor: { prsReviewed: 0, comments: 0, reviews: 0, fixed: 0 },
        prsReviewed: 0,
        comments: 0,
        reviews: 0,
        fixed: 0,
      },
      codeReviews: [
        {
          repository: "org/backend",
          prNumber: 1,
          prTitle: "legacy",
          prUrl: "https://github.com/org/backend/pull/1",
          state: "commented",
          submittedAt: "2026-07-24T18:00:00Z",
          body: null,
        },
      ],
    });
    expect(html).not.toContain("AI code reviews");
    expect(html).not.toContain(">Code reviews<");
    expect(html).not.toContain(">Review comments<");
  });

  it("renders highlight cards", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toContain("Highlights");
    expect(html).toContain("feat: add OAuth flow");
    expect(html).toContain("org/backend");
  });

  it("omits highlight description bodies", () => {
    const html = renderReport({
      ...MOCK_DATA,
      aiContent: {
        ...MOCK_DATA.aiContent,
        highlights: [
          {
            type: "pr",
            title: "feat: markdown body",
            repo: "org/backend",
            meta: "merged",
            body: "## Why\n\nUse `code` and a [link](https://example.com).",
          },
        ],
      },
    });
    expect(html).toContain("feat: markdown body");
    expect(html).not.toContain('class="highlight-body');
    expect(html).not.toContain("Use `code`");
    expect(html).not.toContain(">Why<");
  });

  it("renders block markdown in overview with md wrapper", () => {
    const html = renderReport({
      ...MOCK_DATA,
      stakeholderSummary: "",
      aiContent: {
        ...MOCK_DATA.aiContent,
        overview: "## Why\n\nUse `code` and a [link](https://example.com).",
        summaries: [],
      },
    });
    expect(html).toContain('class="overview md"');
    expect(html).toContain("<h2>");
    expect(html).toContain("Why");
    expect(html).toContain("<code>");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("## Why");
  });

  it("renders inline GitHub mark next to repo names", () => {
    const html = renderReport({
      ...MOCK_DATA,
      repositories: [
        {
          name: "org/backend",
          commits: 10,
          prsOpened: 2,
          prsMerged: 1,
          issuesOpened: 0,
          issuesClosed: 0,
          url: "https://github.com/org/backend",
        },
      ],
    });
    expect(html).toContain('class="github-mark"');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="github-entity"');
    expect(html).toMatch(/github-entity[^>]*>[\s\S]*?github-mark[\s\S]*?org\/backend/);
    expect(html).not.toContain("@lobehub/icons");
  });

  it("unifies repositories and commit messages into one expandable section", () => {
    const html = renderReport({
      ...MOCK_DATA,
      repositories: [
        {
          name: "org/backend",
          commits: 10,
          prsOpened: 2,
          prsMerged: 1,
          issuesOpened: 0,
          issuesClosed: 0,
          url: "https://github.com/org/backend",
        },
        {
          name: "org/frontend",
          commits: 0,
          prsOpened: 1,
          prsMerged: 0,
          issuesOpened: 0,
          issuesClosed: 0,
          url: "https://github.com/org/frontend",
        },
      ],
      commitMessages: [
        {
          repo: "org/backend",
          messages: ["feat: a", "fix: b"],
          commits: [
            {
              sha: "abc",
              message: "feat: a",
              url: "https://github.com/org/backend/commit/abc",
              authoredAt: "2026-07-28T12:00:00Z",
            },
            {
              sha: "def",
              message: "fix: b",
              url: "https://github.com/org/backend/commit/def",
              authoredAt: "2026-07-29T12:00:00Z",
            },
          ],
        },
      ],
    });
    expect(html).toContain("Repositories &amp; projects");
    expect(html).not.toContain(">Commit messages<");
    expect(html).not.toContain(">Pull requests<");
    expect(html).toMatch(/<details class="activity-block">/);
    expect(html).not.toMatch(/<details[^>]*\sopen[\s>]/);
    expect(html).toMatch(/<summary class="activity-repo">/);
    expect(html).toContain("10 commits, 2 PRs opened, 1 merged");
    expect(html).toContain("0 commits, 1 PRs opened, 0 merged");
    expect(html).toContain("activity-repo--static");
    expect(html).toContain('class="activity-repo-ext"');
    expect(html).toContain('aria-label="Open org/backend on GitHub"');
    expect(html).toContain("a.github-entity");
    expect(html).toContain("text-decoration: none");
    expect(html).toContain("Direct commits");
    expect(html).toMatch(/activity-list[\s\S]*?feat: a/);
    // Repo name appears once in the unified section (not duplicated lists)
    const repoMentions = html.match(/activity-repo-name">org\/backend/g) ?? [];
    expect(repoMentions).toHaveLength(1);
  });

  it("nests pull requests under repositories with commits underneath", () => {
    const html = renderReport({
      ...MOCK_DATA,
      repositories: [
        {
          name: "org/backend",
          commits: 2,
          prsOpened: 1,
          prsMerged: 1,
          issuesOpened: 0,
          issuesClosed: 0,
          url: "https://github.com/org/backend",
        },
      ],
      pullRequests: [
        {
          title: "feat: add OAuth",
          body: null,
          url: "https://github.com/org/backend/pull/10",
          repository: "org/backend",
          state: "merged",
          labels: [],
          additions: 120,
          deletions: 4,
          changedFiles: 3,
          author: "testuser",
          createdAt: "2026-07-28T12:00:00Z",
          mergedAt: "2026-07-29T12:00:00Z",
        },
      ],
      commitMessages: [
        {
          repo: "org/backend",
          messages: ["feat: add OAuth (#10)", "chore: leftover"],
          commits: [
            {
              sha: "abc",
              message: "feat: add OAuth (#10)",
              url: "https://github.com/org/backend/commit/abc",
              authoredAt: "2026-07-28T12:00:00Z",
            },
            {
              sha: "def",
              message: "chore: leftover",
              url: "https://github.com/org/backend/commit/def",
              authoredAt: "2026-07-29T12:00:00Z",
            },
          ],
        },
      ],
    });
    expect(html).not.toContain(">Pull requests<");
    expect(html).toContain("activity-children");
    expect(html).toContain('class="activity-block activity-pr-block"');
    expect(html).toMatch(/<summary class="activity-pr">/);
    expect(html).toContain('href="https://github.com/org/backend/pull/10"');
    expect(html).toContain("feat: add OAuth");
    expect(html).toContain("+120");
    expect(html).toContain("−4");
    expect(html).toContain("feat: add OAuth (#10)");
    expect(html).toContain("Direct commits");
    expect(html).toContain("chore: leftover");
  });

  it("collapses commit messages under details/summary by default", () => {
    const html = renderReport({
      ...MOCK_DATA,
      repositories: [
        {
          name: "org/backend",
          commits: 2,
          prsOpened: 0,
          prsMerged: 0,
          issuesOpened: 0,
          issuesClosed: 0,
          url: "https://github.com/org/backend",
        },
      ],
      commitMessages: [
        {
          repo: "org/backend",
          messages: ["feat: a", "fix: b"],
          commits: [
            {
              sha: "abc",
              message: "feat: a",
              url: "https://github.com/org/backend/commit/abc",
              authoredAt: "2026-07-28T12:00:00Z",
            },
            {
              sha: "def",
              message: "fix: b",
              url: "https://github.com/org/backend/commit/def",
              authoredAt: "2026-07-29T12:00:00Z",
            },
          ],
        },
      ],
    });
    expect(html).toMatch(/<details class="activity-block">/);
    expect(html).not.toMatch(/<details[^>]*\sopen[\s>]/);
    expect(html).toMatch(/<summary class="activity-repo">/);
    expect(html).toContain("2 commits, 0 PRs opened, 0 merged");
    expect(html).toContain('class="activity-repo-ext"');
    expect(html).toContain('aria-label="Open org/backend on GitHub"');
    expect(html).toContain("Direct commits");
    expect(html).toMatch(/activity-list[\s\S]*?feat: a/);
  });

  it("includes dofollow footer links", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toContain("myriadas.com");
    expect(html).toContain("Myriad Advisor Solutions");
    expect(html).not.toContain('rel="nofollow"');
  });

  it("includes OG meta tags", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toContain("og:title");
    expect(html).toContain("Auth refactor completed");
  });

  it("uses brutalist theme colors", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toContain("#cc2647");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("renders with RenderOptions object", () => {
    const html = renderReport(MOCK_DATA, { language: "en" });
    expect(html).toContain("#cc2647");
    expect(html).toContain('lang="en"');
  });

  it("renders Japanese locale", () => {
    const html = renderReport(MOCK_DATA, { language: "ja" });
    expect(html).toContain('lang="ja"');
    expect(html).toContain("ハイライト");
    expect(html).toContain("すべての日");
  });

  it("defaults to lang=en", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toContain('lang="en"');
    expect(html).toContain("All days");
  });

  it("uses Zen Kaku Gothic New for Japanese", () => {
    const html = renderReport(MOCK_DATA, { language: "ja" });
    expect(html).toContain("Zen+Kaku+Gothic+New");
    expect(html).toContain("Zen Kaku Gothic New");
  });

  it("uses Schibsted Grotesk and Space Mono for English", () => {
    const html = renderReport(MOCK_DATA, { language: "en" });
    expect(html).toContain("Schibsted Grotesk");
    expect(html).toContain("Space Mono");
  });

  it("uses Space Mono for UI labels in English", () => {
    const html = renderReport(MOCK_DATA, { language: "en" });
    expect(html).toContain("'Space Mono'");
  });

  it("uses IBM Plex Sans KR for Korean", () => {
    const html = renderReport(MOCK_DATA, { language: "ko" });
    expect(html).toContain("IBM+Plex+Sans+KR");
    expect(html).toContain("IBM Plex Sans KR");
  });

  it("uses Urbanist for Russian", () => {
    const html = renderReport(MOCK_DATA, { language: "ru" });
    expect(html).toContain("Urbanist");
  });

  it("renders Simplified Chinese locale", () => {
    const html = renderReport(MOCK_DATA, { language: "zh-CN" });
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain("亮点");
    expect(html).toContain("Noto Sans SC");
  });

  it("computes heatmap levels from daily commits including weekends", () => {
    const data: WeeklyReportData = {
      ...MOCK_DATA,
      dailyCommits: [
        { date: "2026-03-26", count: 0 }, // Thu
        { date: "2026-03-27", count: 1 }, // Fri
        { date: "2026-03-28", count: 8 }, // Sat
        { date: "2026-03-29", count: 9 }, // Sun
        { date: "2026-03-30", count: 5 }, // Mon
        { date: "2026-03-31", count: 7 }, // Tue
        { date: "2026-04-01", count: 10 }, // Wed
      ],
      aiContent: {
        ...MOCK_DATA.aiContent,
        summaries: [],
      },
    };
    const html = renderReport(data);
    expect(html).toContain("mh-level-0");
    expect(html).toContain("mh-level-1");
    expect(html).toContain("mh-level-2");
    expect(html).toContain("mh-level-3");
    expect(html).toContain("mh-level-4");
    const labels = [...html.matchAll(/class="mh-label">([^<]+)</g)].map((m) => m[1]);
    expect(labels).toEqual(["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]);
  });

  it("renders navigation links when prevWeek/nextWeek provided", () => {
    const html = renderReport(MOCK_DATA, {
      prevWeek: "2026/W13",
      nextWeek: "2026/W15",
    });
    expect(html).toContain("2026/W13");
    expect(html).toContain("2026/W15");
  });

  it("renders canonical URL when baseUrl and weekPath provided", () => {
    const html = renderReport(MOCK_DATA, {
      baseUrl: "https://user.github.io/repo",
      weekPath: "2026/W14",
    });
    expect(html).toContain("https://user.github.io/repo/2026/W14/");
    expect(html).toContain("https://user.github.io/repo/2026/W14/og.png");
  });

  it("uses custom site title", () => {
    const html = renderReport(MOCK_DATA, { siteTitle: "My Weekly" });
    expect(html).toContain("My Weekly");
  });

  it("replaces escaped newline in site title", () => {
    const html = renderReport(MOCK_DATA, { siteTitle: "Dev\\nPulse" });
    // The inline version (used in <title>) has the newline replaced with space
    expect(html).toContain("Dev Pulse");
  });

  it("defaults timezone to UTC", () => {
    const html = renderReport(MOCK_DATA);
    expect(html).toBeDefined();
    expect(html).toContain("<!DOCTYPE html>");
  });
});
