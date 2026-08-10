import { describe, it, expect } from "vitest";
import { buildStakeholderSummary, buildFallbackAIContent, formatShortWeekTitle } from "./stakeholder-summary.js";
import type { WeeklyReportData } from "../types.js";

const base = {
  username: "alice",
  dateRange: { from: "2026-03-26", to: "2026-04-01" },
  stats: {
    totalCommits: 12,
    totalAdditions: 400,
    totalDeletions: 50,
    prsOpened: 3,
    prsMerged: 2,
    prsInProgress: 1,
    prsReviewed: 4,
    reviewComments: 6,
    issuesOpened: 0,
    issuesClosed: 0,
    estimatedHours: 7.5,
  },
  repositories: [
    {
      name: "acme/app",
      commits: 10,
      prsOpened: 2,
      prsMerged: 2,
      issuesOpened: 0,
      issuesClosed: 0,
      url: "https://github.com/acme/app",
    },
  ],
  pullRequests: [
    {
      title: "Add billing export",
      body: null,
      url: "https://github.com/acme/app/pull/1",
      repository: "acme/app",
      state: "merged" as const,
      labels: [],
      additions: 100,
      deletions: 10,
      changedFiles: 3,
      author: "alice",
      createdAt: "2026-03-27T12:00:00Z",
      mergedAt: "2026-03-28T12:00:00Z",
    },
  ],
  hoursEstimate: {
    hours: 7.5,
    sessions: 5,
    gapMinutes: 90,
    maxSessionHours: 4,
    note: "Estimated from GitHub activity timestamps. Not tracked time.",
  },
};

describe("formatShortWeekTitle", () => {
  it("uses one date for a daily report", () => {
    expect(formatShortWeekTitle("2026-08-10", "2026-08-10")).toBe("Aug 10");
  });
});

describe("buildStakeholderSummary", () => {
  it("returns empty — metrics and theme live elsewhere on the page", () => {
    expect(buildStakeholderSummary(base)).toBe("");
  });

  it("stays empty even when AI review activity is present", () => {
    expect(
      buildStakeholderSummary({
        ...base,
        aiReviews: {
          codex: { prsReviewed: 8, comments: 20, reviews: 5, fixed: 4 },
          cursor: { prsReviewed: 1, comments: 2, reviews: 1, fixed: 1 },
          prsReviewed: 9,
          comments: 22,
          reviews: 6,
          fixed: 5,
        },
      }),
    ).toBe("");
  });

  it("stays empty for legacy aiReviewFixes payloads", () => {
    expect(
      buildStakeholderSummary({
        ...base,
        aiReviewFixes: { codex: 4, cursor: 1, total: 5 },
      }),
    ).toBe("");
  });
});

describe("formatShortWeekTitle", () => {
  it("collapses same-month ranges", async () => {
    const { formatShortWeekTitle } = await import("./stakeholder-summary.js");
    expect(formatShortWeekTitle("2026-07-23", "2026-07-29")).toBe("Jul 23-29");
  });

  it("keeps both months when they differ", async () => {
    const { formatShortWeekTitle } = await import("./stakeholder-summary.js");
    expect(formatShortWeekTitle("2026-03-26", "2026-04-01")).toBe("Mar 26-Apr 1");
  });
});

describe("buildWeekThemeLine", () => {
  it("prefers conventional-commit scopes", async () => {
    const { buildWeekThemeLine } = await import("./stakeholder-summary.js");
    const line = buildWeekThemeLine([
      { title: "feat(pricing): replace Proforma" } as never,
      { title: "fix(pricing): align FiNet" } as never,
      { title: "feat(pto): edit team members" } as never,
      { title: "fix(platform): repair API" } as never,
    ]);
    expect(line).toContain("pricing");
    expect(line.split(/[&,]/).length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildFallbackAIContent", () => {
  it("produces renderable AIContent with links", () => {
    const data = {
      ...base,
      avatarUrl: "https://example.com/a.png",
      dailyCommits: [],
      issues: [],
      events: [],
      commitMessages: [],
      releases: [],
      externalContributions: [],
      aiContent: {
        title: "",
        subtitle: "",
        overview: "",
        summaries: [],
        highlights: [],
      },
    } as WeeklyReportData;

    const content = buildFallbackAIContent(data);
    expect(content.title).toBe("Mar 26-Apr 1");
    expect(content.subtitle.toLowerCase()).toContain("billing");
    expect(content.overview).toBe("");

    expect(content.highlights[0]?.url).toContain("github.com");
    expect(content.summaries.length).toBeGreaterThan(0);
    const effort = content.summaries.find((summary) => summary.heading === "Estimated engineering hours");
    expect(effort?.chips?.some((chip) => chip.label === "Estimated engineering hours")).toBe(true);
    expect(effort?.chips?.some((chip) => chip.label === "Sessions")).toBe(false);
  });
});
