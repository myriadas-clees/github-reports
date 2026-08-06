import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { resolveBaseOptions, extractPRRefs, buildDailyPlan, buildWeeklyPlan, formatCommitMsg } from "./fetch.js";
import type { GitHubEvent } from "../../types.js";

// Mock fs/promises
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockMkdir = vi.fn().mockResolvedValue(undefined);
vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

// Mock collector modules
const mockFetchEvents = vi.fn().mockResolvedValue([]);
const mockDedupeEvents = vi.fn().mockImplementation((events: GitHubEvent[]) => events);
vi.mock("../../collector/fetch-events.js", () => ({
  fetchEvents: (...args: unknown[]) => mockFetchEvents(...args),
  dedupeEvents: (...args: unknown[]) => mockDedupeEvents(...args),
}));

vi.mock("../../collector/fetch-repo-prs.js", () => ({
  fetchPRsByRefs: vi.fn().mockResolvedValue([]),
  mapState: vi.fn(),
}));

const mockFetchContributions = vi.fn().mockResolvedValue({
  username: "testuser",
  avatarUrl: "https://example.com/avatar.png",
  profile: { name: null, bio: null, company: null, location: null, followers: 0, following: 0, publicRepos: 0 },
  totalCommits: 10,
  prsReviewed: 3,
  dailyCommits: [],
});
vi.mock("../../collector/fetch-contributions.js", () => ({
  fetchContributions: (...args: unknown[]) => mockFetchContributions(...args),
}));

vi.mock("../../collector/aggregate.js", () => ({
  aggregateRepositories: vi.fn().mockReturnValue([]),
}));

vi.mock("../../collector/fetch-commits.js", () => ({
  fetchCommitMessages: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../collector/fetch-releases.js", () => ({
  fetchReleases: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../collector/fetch-reviews.js", () => ({
  fetchReviewsForRepos: vi.fn().mockResolvedValue({
    reviews: [],
    comments: [],
    aiReviews: {
      codex: { prsReviewed: 0, comments: 0, reviews: 0, fixed: 0 },
      cursor: { prsReviewed: 0, comments: 0, reviews: 0, fixed: 0 },
      prsReviewed: 0,
      comments: 0,
      reviews: 0,
      fixed: 0,
    },
  }),
}));

// Note: deployer/week.js is NOT mocked here. buildDailyPlan/buildWeeklyPlan
// call the real getWeekId/getCurrentWeekId (pure functions, no I/O) so that
// the plan tests verify actual week-ID calculations end-to-end.

vi.mock("@octokit/graphql", () => ({
  graphql: { defaults: () => vi.fn() },
}));

// -------------------------------------------------------------------
// resolveBaseOptions
// -------------------------------------------------------------------

describe("resolveBaseOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.stubEnv("CONFIG_PATH", "/tmp/worklog-missing-config.yaml");
    vi.stubEnv("TIMEZONE", "");
  });

  it("throws when token is missing", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_PAT", "");
    await expect(resolveBaseOptions({ username: "alice" })).rejects.toThrow(
      "GitHub token required",
    );
  });

  it("throws when username is missing", async () => {
    vi.stubEnv("GITHUB_USERNAME", "");
    await expect(resolveBaseOptions({ token: "ghp_xxx" })).rejects.toThrow(
      "GitHub username required",
    );
  });

  it("uses defaults for timezone and dataDir", async () => {
    const result = await resolveBaseOptions({
      token: "ghp_xxx",
      username: "alice",
    });
    expect(result.timezone).toBe("UTC");
    expect(result.dataDir).toBe("./data");
    expect(result.repositories).toEqual([]);
  });

  it("reads token and username from env when CLI args omitted", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_env");
    vi.stubEnv("GITHUB_USERNAME", "bob");
    const result = await resolveBaseOptions({});
    expect(result.token).toBe("ghp_env");
    expect(result.username).toBe("bob");
  });

  it("CLI args take precedence over env", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_env");
    vi.stubEnv("GITHUB_USERNAME", "env_user");
    const result = await resolveBaseOptions({
      token: "ghp_cli",
      username: "cli_user",
    });
    expect(result.token).toBe("ghp_cli");
    expect(result.username).toBe("cli_user");
  });

  it("parses date option correctly", async () => {
    const result = await resolveBaseOptions({
      token: "ghp_xxx",
      username: "alice",
      date: "2026-04-01",
      timezone: "UTC",
    });
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date!.toISOString()).toContain("2026-04-01");
  });

  it("date is undefined when not provided", async () => {
    const result = await resolveBaseOptions({
      token: "ghp_xxx",
      username: "alice",
    });
    expect(result.date).toBeUndefined();
  });

  it("respects env for timezone and dataDir", async () => {
    vi.stubEnv("TIMEZONE", "Asia/Tokyo");
    vi.stubEnv("DATA_DIR", "/tmp/data");
    const result = await resolveBaseOptions({
      token: "ghp_xxx",
      username: "alice",
    });
    expect(result.timezone).toBe("Asia/Tokyo");
    expect(result.dataDir).toBe("/tmp/data");
  });
});

// -------------------------------------------------------------------
// extractPRRefs
// -------------------------------------------------------------------

describe("extractPRRefs", () => {
  it("extracts refs from pull_request events", () => {
    const events: GitHubEvent[] = [
      {
        id: "1",
        type: "PullRequestEvent",
        repo: "owner/repo",
        createdAt: "2026-04-01T00:00:00Z",
        payload: { kind: "pull_request", action: "opened", number: 42, title: "feat: add X" },
      },
    ];
    const refs = extractPRRefs(events);
    expect(refs).toEqual([{ repo: "owner/repo", number: 42 }]);
  });

  it("extracts refs from review events", () => {
    const events: GitHubEvent[] = [
      {
        id: "2",
        type: "PullRequestReviewEvent",
        repo: "owner/repo",
        createdAt: "2026-04-01T00:00:00Z",
        payload: { kind: "review", action: "submitted", prNumber: 99, prTitle: "fix: Y", state: "approved" },
      },
    ];
    const refs = extractPRRefs(events);
    expect(refs).toEqual([{ repo: "owner/repo", number: 99 }]);
  });

  it("handles mixed event types", () => {
    const events: GitHubEvent[] = [
      {
        id: "1",
        type: "PullRequestEvent",
        repo: "a/b",
        createdAt: "2026-04-01T00:00:00Z",
        payload: { kind: "pull_request", action: "opened", number: 1, title: "pr1" },
      },
      {
        id: "2",
        type: "PushEvent",
        repo: "a/b",
        createdAt: "2026-04-01T01:00:00Z",
        payload: { kind: "push", ref: "refs/heads/main", commits: ["abc"] },
      },
      {
        id: "3",
        type: "PullRequestReviewEvent",
        repo: "c/d",
        createdAt: "2026-04-01T02:00:00Z",
        payload: { kind: "review", action: "submitted", prNumber: 5, prTitle: "review", state: "commented" },
      },
    ];
    const refs = extractPRRefs(events);
    expect(refs).toHaveLength(2);
    expect(refs).toEqual([
      { repo: "a/b", number: 1 },
      { repo: "c/d", number: 5 },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(extractPRRefs([])).toEqual([]);
  });

  it("skips events with number 0", () => {
    const events: GitHubEvent[] = [
      {
        id: "1",
        type: "PullRequestEvent",
        repo: "a/b",
        createdAt: "2026-04-01T00:00:00Z",
        payload: { kind: "pull_request", action: "opened", number: 0, title: "bad" },
      },
    ];
    expect(extractPRRefs(events)).toEqual([]);
  });
});

// -------------------------------------------------------------------
// buildDailyPlan
//
// Cron fires at midnight local time. Yesterday's events go into the
// in-progress Thu–Wed work week folder.
//
// W13 = Thu 3/26 .. Wed 4/1; W14 = Thu 4/2 .. Wed 4/8
// -------------------------------------------------------------------

describe("buildDailyPlan", () => {
  const jstCases: [string, string, string, string, string][] = [
    // [cron UTC instant,           targetDate, range,       weekPath,    description]
    ["2026-03-26T15:00:00Z", "2026-03-26", "2026-03-26", "2026/W13", "Fri: yesterday=Thu(W13)"],
    ["2026-03-30T15:00:00Z", "2026-03-30", "2026-03-30", "2026/W13", "Tue: yesterday=Mon(W13)"],
    ["2026-04-01T15:00:00Z", "2026-04-01", "2026-04-01", "2026/W13", "Thu: yesterday=Wed(W13)"],
    ["2026-04-02T15:00:00Z", "2026-04-02", "2026-04-02", "2026/W14", "Fri: yesterday=Thu(W14)"],
    ["2026-04-05T15:00:00Z", "2026-04-05", "2026-04-05", "2026/W14", "Mon: yesterday=Sun(W14)"],
    ["2026-04-08T15:00:00Z", "2026-04-08", "2026-04-08", "2026/W14", "Thu: yesterday=Wed(W14)"],
    ["2026-04-09T15:00:00Z", "2026-04-09", "2026-04-09", "2026/W15", "Fri: yesterday=Thu(W15), week boundary"],
  ];

  it.each(jstCases)("JST cron at %s: %s", (utcInstant, targetDate, rangeDate, weekPath, _desc) => {
    const plan = buildDailyPlan(new Date(utcInstant), "Asia/Tokyo", "./data");
    expect(plan.targetDate).toBe(targetDate);
    expect(plan.rangeFrom).toBe(rangeDate);
    expect(plan.rangeTo).toBe(rangeDate);
    expect(plan.weekPath).toBe(weekPath);
    expect(plan.reportDir).toBe(`data/${weekPath}`);
  });

  const utcCases: [string, string, string][] = [
    ["2026-03-27T00:00:00Z", "2026-03-26", "2026/W13"],
    ["2026-04-02T00:00:00Z", "2026-04-01", "2026/W13"],
    ["2026-04-03T00:00:00Z", "2026-04-02", "2026/W14"],
  ];

  it.each(utcCases)("UTC cron at %s: yesterday=%s week=%s", (utcInstant, targetDate, weekPath) => {
    const plan = buildDailyPlan(new Date(utcInstant), "UTC", "./data");
    expect(plan.targetDate).toBe(targetDate);
    expect(plan.weekPath).toBe(weekPath);
  });

  it("year boundary: Jan 1 midnight -> yesterday is Dec 31", () => {
    const plan = buildDailyPlan(new Date("2026-01-01T00:00:00Z"), "UTC", "./data");
    expect(plan.targetDate).toBe("2025-12-31");
    expect(plan.rangeFrom).toBe("2025-12-31");
    expect(plan.rangeTo).toBe("2025-12-31");
    // Dec 31 2025 is Wednesday of the week that started Thu Dec 25
    expect(plan.weekPath).toMatch(/^2025\/W\d{2}$/);
  });

  it("range covers exactly one day (from and to are the same date)", () => {
    const plan = buildDailyPlan(new Date("2026-04-04T15:00:00Z"), "Asia/Tokyo", "./data");
    expect(plan.rangeFrom).toBe(plan.rangeTo);
  });
});

// -------------------------------------------------------------------
// buildWeeklyPlan
//
// Cron fires Thursday 01:00 local time (1h after daily). The plan
// targets the previous Thu–Wed work week.
//
// Reference (UTC):
//   Thu Apr 2 01:00 → Mar 26 .. Apr 1 → W13
//   Thu Apr 9 01:00 → Apr 2  .. Apr 8 → W14
// -------------------------------------------------------------------

describe("buildWeeklyPlan", () => {
  it("Thursday JST: targets previous Thu–Wed week", () => {
    // Thu Apr 2 01:00 JST = 2026-04-01T16:00:00Z
    const plan = buildWeeklyPlan(new Date("2026-04-01T16:00:00Z"), "Asia/Tokyo", "./data");
    expect(plan.rangeFrom).toBe("2026-03-26");
    expect(plan.rangeTo).toBe("2026-04-01");
    expect(plan.weekPath).toBe("2026/W13");
    expect(plan.reportDir).toBe("data/2026/W13");
  });

  it("Thursday UTC: targets previous Thu–Wed week W13", () => {
    const plan = buildWeeklyPlan(new Date("2026-04-02T01:00:00Z"), "UTC", "./data");
    expect(plan.rangeFrom).toBe("2026-03-26");
    expect(plan.rangeTo).toBe("2026-04-01");
    expect(plan.weekPath).toBe("2026/W13");
  });

  it("next Thursday targets the following work week", () => {
    // Thu Apr 9 01:00 JST = 2026-04-08T16:00:00Z
    const plan = buildWeeklyPlan(new Date("2026-04-08T16:00:00Z"), "Asia/Tokyo", "./data");
    expect(plan.rangeFrom).toBe("2026-04-02");
    expect(plan.rangeTo).toBe("2026-04-08");
    expect(plan.weekPath).toBe("2026/W14");
  });

  it("range covers exactly 7 days", () => {
    const plan = buildWeeklyPlan(new Date("2026-04-02T01:00:00Z"), "UTC", "./data");
    expect(plan.rangeFrom).toBe("2026-03-26");
    expect(plan.rangeTo).toBe("2026-04-01");
  });

  it("year boundary: Thu Jan 1 targets previous week ending Dec 31", () => {
    const plan = buildWeeklyPlan(new Date("2026-01-01T01:00:00Z"), "UTC", "./data");
    expect(plan.rangeFrom).toBe("2025-12-25");
    expect(plan.rangeTo).toBe("2025-12-31");
  });
});

// -------------------------------------------------------------------
// daily + weekly plan consistency
// -------------------------------------------------------------------

describe("daily/weekly plan consistency", () => {
  it("7 daily plans cover the same range as the weekly plan (UTC)", () => {
    // W13 = Thu 3/26 .. Wed 4/1. Daily crons Fri 3/27 through Thu 4/2.
    const dailyDates = [
      "2026-03-27T00:00:00Z", // yesterday = 3/26 Thu
      "2026-03-28T00:00:00Z", // yesterday = 3/27 Fri
      "2026-03-29T00:00:00Z", // yesterday = 3/28 Sat
      "2026-03-30T00:00:00Z", // yesterday = 3/29 Sun
      "2026-03-31T00:00:00Z", // yesterday = 3/30 Mon
      "2026-04-01T00:00:00Z", // yesterday = 3/31 Tue
      "2026-04-02T00:00:00Z", // yesterday = 4/1  Wed
    ];
    const dailyPlans = dailyDates.map((d) => buildDailyPlan(new Date(d), "UTC", "./data"));

    dailyPlans.forEach((p) => expect(p.weekPath).toBe("2026/W13"));

    const collectedDates = dailyPlans.map((p) => p.targetDate);
    expect(collectedDates).toEqual([
      "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29",
      "2026-03-30", "2026-03-31", "2026-04-01",
    ]);

    const weeklyPlan = buildWeeklyPlan(new Date("2026-04-02T01:00:00Z"), "UTC", "./data");
    expect(weeklyPlan.rangeFrom).toBe(collectedDates[0]);
    expect(weeklyPlan.rangeTo).toBe(collectedDates[collectedDates.length - 1]);
    expect(weeklyPlan.weekPath).toBe("2026/W13");
  });

  it("7 daily plans cover the same range as the weekly plan (Asia/Tokyo)", () => {
    const dailyDates = [
      "2026-03-26T15:00:00Z", // JST 3/27 Fri, yesterday = 3/26 Thu
      "2026-03-27T15:00:00Z",
      "2026-03-28T15:00:00Z",
      "2026-03-29T15:00:00Z",
      "2026-03-30T15:00:00Z",
      "2026-03-31T15:00:00Z",
      "2026-04-01T15:00:00Z", // JST 4/2 Thu, yesterday = 4/1 Wed
    ];
    const dailyPlans = dailyDates.map((d) => buildDailyPlan(new Date(d), "Asia/Tokyo", "./data"));

    dailyPlans.forEach((p) => expect(p.weekPath).toBe("2026/W13"));

    const collectedDates = dailyPlans.map((p) => p.targetDate);
    expect(collectedDates).toEqual([
      "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29",
      "2026-03-30", "2026-03-31", "2026-04-01",
    ]);

    const weeklyPlan = buildWeeklyPlan(new Date("2026-04-01T16:00:00Z"), "Asia/Tokyo", "./data");
    expect(weeklyPlan.rangeFrom).toBe(collectedDates[0]);
    expect(weeklyPlan.rangeTo).toBe(collectedDates[collectedDates.length - 1]);
    expect(weeklyPlan.weekPath).toBe("2026/W13");
  });
});

// -------------------------------------------------------------------
// formatCommitMsg
// -------------------------------------------------------------------

describe("formatCommitMsg", () => {
  it("daily: includes week path and UTC range", () => {
    // Sun Apr 6 00:00 JST = 2026-04-05T15:00:00Z, yesterday = Sat Apr 5 (W14)
    const plan = buildDailyPlan(new Date("2026-04-05T15:00:00Z"), "Asia/Tokyo", "./data");
    const msg = formatCommitMsg("daily", plan);
    // Apr 5 JST midnight = Apr 4 15:00 UTC, Apr 6 JST midnight - 1ms = Apr 5 14:59:59.999 UTC
    expect(msg).toBe(`data: daily 2026/W14 ${plan.range.from.toISOString()}..${plan.range.to.toISOString()}`);
    expect(msg).toMatch(/^data: daily 2026\/W14 2026-04-04T15:00:00\.000Z\.\.2026-04-05T14:59:59\.999Z$/);
  });

  it("weekly: includes week path and UTC range", () => {
    // Thu Apr 2 01:00 JST = 2026-04-01T16:00:00Z → W13 Thu Mar 26 – Wed Apr 1
    const plan = buildWeeklyPlan(new Date("2026-04-01T16:00:00Z"), "Asia/Tokyo", "./data");
    const msg = formatCommitMsg("weekly", plan);
    expect(msg).toBe(`data: weekly 2026/W13 ${plan.range.from.toISOString()}..${plan.range.to.toISOString()}`);
    expect(msg).toMatch(/^data: weekly 2026\/W13 2026-03-25T15:00:00\.000Z\.\.2026-04-01T14:59:59\.999Z$/);
  });

  it("daily at week boundary: Fri after new Thursday starts new week", () => {
    // Fri Apr 3 00:00 JST = 2026-04-02T15:00:00Z, yesterday = Thu Apr 2 (W14)
    const plan = buildDailyPlan(new Date("2026-04-02T15:00:00Z"), "Asia/Tokyo", "./data");
    const msg = formatCommitMsg("daily", plan);
    expect(msg).toMatch(/^data: daily 2026\/W14 /);
  });
});

// -------------------------------------------------------------------
// registerFetch (daily-fetch and weekly-fetch commands)
// -------------------------------------------------------------------

describe("registerFetch (daily-fetch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockRejectedValue(new Error("not found")); // no existing events
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls fetchEvents and writes events.yaml", async () => {
    const mockEvents: GitHubEvent[] = [
      {
        id: "1",
        type: "PushEvent",
        repo: "owner/repo",
        createdAt: "2026-04-01T00:00:00Z",
        payload: { kind: "push", ref: "refs/heads/main", commits: ["fix"] },
      },
    ];
    mockFetchEvents.mockResolvedValue(mockEvents);
    mockDedupeEvents.mockReturnValue(mockEvents);

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync([
      "node", "cli", "daily-fetch",
      "--token", "ghp_test",
      "--username", "testuser",
      "--data-dir", "./data",
      "--timezone", "UTC",
      "--date", "2026-04-01",
    ]);

    expect(mockFetchEvents).toHaveBeenCalledWith(
      "ghp_test",
      "testuser",
      expect.any(Object),
      expect.objectContaining({ includePrivate: true }),
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("events.yaml"),
      expect.any(String),
      "utf-8",
    );
  });
});

describe("registerFetch (weekly-fetch)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fetches PRs and contributions, writes github-data.yaml", async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockReadFile.mockRejectedValue(new Error("not found"));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockFetchContributions.mockResolvedValue({
      username: "testuser",
      avatarUrl: "https://example.com/avatar.png",
      profile: { name: null, bio: null, company: null, location: null, followers: 0, following: 0, publicRepos: 0 },
      totalCommits: 10,
      prsReviewed: 3,
      dailyCommits: [],
    });
    const { fetchPRsByRefs } = await import("../../collector/fetch-repo-prs.js");
    vi.mocked(fetchPRsByRefs).mockResolvedValue([]);
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [], total_count: 0 }), { status: 200 })),
    );

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync([
      "node", "cli", "weekly-fetch",
      "--token", "ghp_test",
      "--username", "testuser",
      "--data-dir", "./data",
      "--timezone", "UTC",
      "--date", "2026-04-01",
    ]);

    expect(mockFetchContributions).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("github-data.yaml"),
      expect.any(String),
      "utf-8",
    );
  });

  it("logs error and exits 1 when token is missing", async () => {
    vi.clearAllMocks();
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GITHUB_USERNAME", "");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined as never) as typeof process.exit);

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync(["node", "cli", "weekly-fetch", "--username", "alice"]);

    expect(errSpy).toHaveBeenCalledWith("Error:", expect.stringContaining("GitHub token required"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("searchWeeklyPRs: collects PR refs from search items and passes them to fetchPRsByRefs", async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockReadFile.mockRejectedValue(new Error("not found"));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockFetchContributions.mockResolvedValue({
      username: "alice",
      avatarUrl: "https://example.com/a.png",
      profile: { name: null, bio: null, company: null, location: null, followers: 0, following: 0, publicRepos: 0 },
      totalCommits: 0,
      prsReviewed: 0,
      dailyCommits: [],
    });
    const { fetchPRsByRefs } = await import("../../collector/fetch-repo-prs.js");
    vi.mocked(fetchPRsByRefs).mockResolvedValue([]);

    const items = [
      { number: 7, pull_request: { url: "u" }, repository_url: "https://api.github.com/repos/owner/repo" },
      // Issue without pull_request — should be filtered out
      { number: 8, repository_url: "https://api.github.com/repos/owner/repo" },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ items, total_count: items.length }), { status: 200 })),
    );

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync([
      "node", "cli", "weekly-fetch",
      "--token", "ghp_test",
      "--username", "alice",
      "--data-dir", "./data",
      "--timezone", "UTC",
      "--date", "2026-04-01",
    ]);

    // PR #7 should reach fetchPRsByRefs (deduped: only one entry even though
    // both author: and reviewed-by: qualifier searches return it).
    const refs = vi.mocked(fetchPRsByRefs).mock.calls.at(-1)?.[1];
    expect(refs).toEqual([{ repo: "owner/repo", number: 7 }]);
  });

  it("searchWeeklyPRs: throws on 401 from Search API and exits 1", async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockReadFile.mockRejectedValue(new Error("not found"));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined as never) as typeof process.exit);
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response("nope", { status: 401 })),
    );

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync([
      "node", "cli", "weekly-fetch",
      "--token", "ghp_bad",
      "--username", "alice",
      "--data-dir", "./data",
      "--timezone", "UTC",
      "--date", "2026-04-01",
    ]);

    expect(errSpy).toHaveBeenCalledWith(
      "Error:",
      expect.stringContaining("GitHub Search API returned 401"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("searchWeeklyPRs: warns and continues on non-auth error (500)", async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockReadFile.mockRejectedValue(new Error("not found"));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockFetchContributions.mockResolvedValue({
      username: "alice",
      avatarUrl: "https://example.com/a.png",
      profile: { name: null, bio: null, company: null, location: null, followers: 0, following: 0, publicRepos: 0 },
      totalCommits: 0,
      prsReviewed: 0,
      dailyCommits: [],
    });
    const { fetchPRsByRefs } = await import("../../collector/fetch-repo-prs.js");
    vi.mocked(fetchPRsByRefs).mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response("boom", { status: 500 })),
    );

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync([
      "node", "cli", "weekly-fetch",
      "--token", "ghp_test",
      "--username", "alice",
      "--data-dir", "./data",
      "--timezone", "UTC",
      "--date", "2026-04-01",
    ]);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Search API error (500)"));
    // weekly-fetch still completes and writes github-data.yaml
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("github-data.yaml"),
      expect.any(String),
      "utf-8",
    );
  });

  it("computes prsOpened/prsMerged and filters review events when assembling github-data", async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    const reviewEvent: GitHubEvent = {
      id: "10",
      type: "PullRequestReviewEvent",
      repo: "owner/repo",
      createdAt: "2026-04-01T00:00:00Z",
      payload: { kind: "review", action: "submitted", prNumber: 1, prTitle: "r", state: "approved" },
    };
    const pushEvent: GitHubEvent = {
      id: "11",
      type: "PushEvent",
      repo: "owner/repo",
      createdAt: "2026-04-01T01:00:00Z",
      payload: { kind: "push", ref: "refs/heads/main", commits: ["a"] },
    };
    mockReadFile.mockResolvedValue("[]"); // YAML for empty list — overridden below
    // tryReadYaml returns parsed YAML; provide events array directly
    const { parse: parseYaml } = await import("yaml");
    const eventsYaml = "- id: '10'\n  type: PullRequestReviewEvent\n  repo: owner/repo\n  createdAt: '2026-04-01T00:00:00Z'\n  payload:\n    kind: review\n    action: submitted\n    prNumber: 1\n    prTitle: r\n    state: approved\n- id: '11'\n  type: PushEvent\n  repo: owner/repo\n  createdAt: '2026-04-01T01:00:00Z'\n  payload:\n    kind: push\n    ref: refs/heads/main\n    commits: [a]\n";
    expect(parseYaml(eventsYaml)).toEqual([reviewEvent, pushEvent]); // sanity
    mockReadFile.mockResolvedValue(eventsYaml);
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockFetchContributions.mockResolvedValue({
      username: "TestUser",
      avatarUrl: "https://example.com/a.png",
      profile: { name: null, bio: null, company: null, location: null, followers: 0, following: 0, publicRepos: 0 },
      totalCommits: 5,
      prsReviewed: 2,
      dailyCommits: [],
    });
    const { fetchPRsByRefs } = await import("../../collector/fetch-repo-prs.js");
    vi.mocked(fetchPRsByRefs).mockResolvedValue([
      { title: "feat", body: null, url: "u1", repository: "owner/repo", state: "merged", labels: [], additions: 1, deletions: 0, changedFiles: 1, author: "TestUser", createdAt: "2026-04-01T00:00:00Z", mergedAt: "2026-04-02T00:00:00Z" },
      { title: "fix", body: null, url: "u2", repository: "owner/repo", state: "open", labels: [], additions: 2, deletions: 1, changedFiles: 1, author: "testuser", createdAt: "2026-04-01T00:00:00Z", mergedAt: null },
      { title: "docs", body: null, url: "u3", repository: "owner/repo", state: "merged", labels: [], additions: 0, deletions: 0, changedFiles: 1, author: "outsider", createdAt: "2026-04-01T00:00:00Z", mergedAt: "2026-04-02T00:00:00Z" },
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [], total_count: 0 }), { status: 200 })),
    );

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync([
      "node", "cli", "weekly-fetch",
      "--token", "ghp_test",
      "--username", "TestUser",
      "--data-dir", "./data",
      "--timezone", "UTC",
      "--date", "2026-04-01",
    ]);

    const writeCall = mockWriteFile.mock.calls.find((c) =>
      typeof c[0] === "string" && c[0].includes("github-data.yaml"),
    );
    expect(writeCall).toBeDefined();
    const yaml = writeCall![1] as string;
    expect(yaml).toMatch(/prsOpened:\s*2/);
    expect(yaml).toMatch(/prsMerged:\s*1/);
    expect(yaml).toMatch(/prsInProgress:\s*1/);
    expect(yaml).toContain("stakeholderSummary:");
    expect(yaml).toContain("estimatedHours:");
    expect(yaml).toContain("hoursEstimate:");
  });

  it("maps repo names and reduces commit-message totals when repositories aggregate is non-empty", async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockReadFile.mockRejectedValue(new Error("not found"));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockFetchContributions.mockResolvedValue({
      username: "alice",
      avatarUrl: "https://example.com/a.png",
      profile: { name: null, bio: null, company: null, location: null, followers: 0, following: 0, publicRepos: 0 },
      totalCommits: 4,
      prsReviewed: 1,
      dailyCommits: [],
    });
    const { fetchPRsByRefs } = await import("../../collector/fetch-repo-prs.js");
    vi.mocked(fetchPRsByRefs).mockResolvedValue([
      { title: "x", body: null, url: "u", repository: "owner/alpha", state: "open", labels: [], additions: 0, deletions: 0, changedFiles: 0, author: "alice", createdAt: "2026-03-20T00:00:00Z", mergedAt: null },
      { title: "y", body: null, url: "u", repository: "owner/beta", state: "open", labels: [], additions: 0, deletions: 0, changedFiles: 0, author: "alice", createdAt: "2026-03-20T00:00:00Z", mergedAt: null },
    ]);
    const { aggregateRepositories } = await import("../../collector/aggregate.js");
    vi.mocked(aggregateRepositories).mockReturnValueOnce([
      { name: "owner/alpha", commits: 2, prsOpened: 1, prsMerged: 0, issuesOpened: 0, issuesClosed: 0, url: "https://github.com/owner/alpha" },
      { name: "owner/beta", commits: 1, prsOpened: 1, prsMerged: 0, issuesOpened: 0, issuesClosed: 0, url: "https://github.com/owner/beta" },
    ]);
    const { fetchCommitMessages } = await import("../../collector/fetch-commits.js");
    vi.mocked(fetchCommitMessages).mockResolvedValueOnce([
      { repo: "owner/alpha", messages: ["feat: a", "fix: b"] },
      { repo: "owner/beta", messages: ["docs: c"] },
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [], total_count: 0 }), { status: 200 })),
    );

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync([
      "node", "cli", "weekly-fetch",
      "--token", "ghp_test",
      "--username", "alice",
      "--data-dir", "./data",
      "--timezone", "UTC",
      "--date", "2026-04-02",
    ]);

    const writeCall = mockWriteFile.mock.calls.find((c) =>
      typeof c[0] === "string" && c[0].includes("github-data.yaml"),
    );
    expect(writeCall).toBeDefined();
    const yaml = writeCall![1] as string;
    expect(yaml).toContain("owner/alpha");
    expect(yaml).toContain("owner/beta");
    expect(yaml).toContain("feat: a");
    expect(fetchCommitMessages).toHaveBeenCalledWith(
      "ghp_test",
      "alice",
      expect.arrayContaining(["owner/alpha", "owner/beta"]),
      expect.any(Object),
    );
  });
});

// -------------------------------------------------------------------
// registerFetch (daily-fetch error path)
// -------------------------------------------------------------------

describe("registerFetch (daily-fetch error)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs error and exits 1 when token is missing", async () => {
    vi.clearAllMocks();
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GITHUB_USERNAME", "");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined as never) as typeof process.exit);

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync(["node", "cli", "daily-fetch", "--username", "alice"]);

    expect(errSpy).toHaveBeenCalledWith("Error:", expect.stringContaining("GitHub token required"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("logs raw value when error is not an Error instance and uses current time when --date omitted", async () => {
    vi.clearAllMocks();
    vi.stubEnv("GITHUB_TOKEN", "ghp_xxx");
    vi.stubEnv("GITHUB_USERNAME", "alice");
    // Force mkdir (called early in runDailyFetch) to reject with a non-Error value
    // so the daily-fetch `error instanceof Error ? ... : error` branch returns the raw value.
    // Omitting --date also exercises the `options.date ?? new Date()` default branch.
    mockMkdir.mockRejectedValueOnce("daily-string-failure");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined as never) as typeof process.exit);

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync(["node", "cli", "daily-fetch"]);

    expect(errSpy).toHaveBeenCalledWith("Error:", "daily-string-failure");
    expect(exitSpy).toHaveBeenCalledWith(1);
    mockMkdir.mockResolvedValue(undefined);
  });
});

// -------------------------------------------------------------------
// registerFetch (weekly-fetch error path)
// -------------------------------------------------------------------

describe("registerFetch (weekly-fetch error)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs error and exits 1 when token is missing", async () => {
    vi.clearAllMocks();
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GITHUB_USERNAME", "");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined as never) as typeof process.exit);

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync(["node", "cli", "weekly-fetch", "--username", "alice"]);

    expect(errSpy).toHaveBeenCalledWith("Error:", expect.stringContaining("GitHub token required"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("logs raw value when error is not an Error instance", async () => {
    vi.clearAllMocks();
    vi.stubEnv("GITHUB_TOKEN", "ghp_xxx");
    vi.stubEnv("GITHUB_USERNAME", "alice");
    // Force mkdir (called early in runWeeklyFetch) to reject with a non-Error value
    // so the `error instanceof Error ? ... : error` branch chooses the raw value.
    mockMkdir.mockRejectedValueOnce("string-failure");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined as never) as typeof process.exit);

    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync(["node", "cli", "weekly-fetch"]);

    expect(errSpy).toHaveBeenCalledWith("Error:", "string-failure");
    expect(exitSpy).toHaveBeenCalledWith(1);
    mockMkdir.mockResolvedValue(undefined);
  });
});

// -------------------------------------------------------------------
// registerFetch (commit-msg subcommand)
// -------------------------------------------------------------------

describe("registerFetch (commit-msg)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const captureStdout = (): { writes: string[]; restore: () => void } => {
    const writes: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
        return true;
      }) as typeof process.stdout.write);
    return { writes, restore: () => spy.mockRestore() };
  };

  it("daily mode: prints commit message for given date", async () => {
    const { writes, restore } = captureStdout();
    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync([
      "node", "cli", "commit-msg", "daily",
      "--timezone", "Asia/Tokyo",
      "--date", "2026-04-03",
      "--data-dir", "./data",
    ]);

    restore();
    expect(writes.join("")).toMatch(/^data: daily 2026\/W14 /);
  });

  it("weekly mode: prints commit message for given date", async () => {
    const { writes, restore } = captureStdout();
    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync([
      "node", "cli", "commit-msg", "weekly",
      "--timezone", "Asia/Tokyo",
      "--date", "2026-04-02",
      "--data-dir", "./data",
    ]);

    restore();
    expect(writes.join("")).toMatch(/^data: weekly 2026\/W13 /);
  });

  it("uses env defaults for timezone/data-dir and current time when --date omitted", async () => {
    vi.stubEnv("TIMEZONE", "UTC");
    vi.stubEnv("DATA_DIR", "./data");
    const { writes, restore } = captureStdout();
    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync(["node", "cli", "commit-msg", "daily"]);

    restore();
    expect(writes.join("")).toMatch(/^data: daily \d{4}\/W\d{2} /);
  });

  it("falls back to UTC and ./data when neither flags nor env are set", async () => {
    // Remove env vars so `process.env[key]` returns undefined, exercising
    // the final `?? "UTC"` / `?? "./data"` literal defaults in commit-msg.
    const prevTimezone = process.env.TIMEZONE;
    const prevDataDir = process.env.DATA_DIR;
    delete process.env.TIMEZONE;
    delete process.env.DATA_DIR;

    const { writes, restore } = captureStdout();
    const { Command } = await import("commander");
    const { registerFetch } = await import("./fetch.js");
    const program = new Command();
    registerFetch(program);

    await program.parseAsync(["node", "cli", "commit-msg", "weekly", "--date", "2026-04-07"]);

    restore();
    if (prevTimezone !== undefined) process.env.TIMEZONE = prevTimezone;
    if (prevDataDir !== undefined) process.env.DATA_DIR = prevDataDir;
    expect(writes.join("")).toMatch(/^data: weekly 2026\/W\d{2} /);
  });
});
