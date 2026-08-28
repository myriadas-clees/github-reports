import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCommitMessages, mergeCommitMessagesWithPRs } from "./fetch-commits.js";
import type { DateRange } from "./date-range.js";

const range: DateRange = {
  from: new Date("2026-03-30T00:00:00Z"),
  to: new Date("2026-04-05T23:59:59Z"),
};

const makeRawCommit = (message: string, sha = "abc123", date = "2026-04-01T12:00:00Z") => ({
  sha,
  html_url: `https://github.com/org/repo/commit/${sha}`,
  commit: { message, author: { date } },
});

const makeSearchItem = (message: string, sha: string, date: string) => ({
  sha,
  html_url: `https://github.com/org/repo/commit/${sha}`,
  commit: { message, author: { date } },
});

const emptySearchResponse = () =>
  new Response(JSON.stringify({ total_count: 0, items: [] }), { status: 200 });

const searchResponse = (items: unknown[], nextUrl?: string) => {
  const headers: Record<string, string> = {};
  if (nextUrl) headers["link"] = `<${nextUrl}>; rel="next"`;
  return new Response(JSON.stringify({ total_count: items.length, items }), {
    status: 200,
    headers,
  });
};

// Helper to create a Response with a Link header for pagination
const pagedResponse = (commits: unknown[], nextUrl?: string) => {
  const headers: Record<string, string> = {};
  if (nextUrl) headers["link"] = `<${nextUrl}>; rel="next"`;
  return new Response(JSON.stringify(commits), { status: 200, headers });
};

const isCommitDetailUrl = (url: string) => /\/repos\/[^/]+\/[^/]+\/commits\/[^/?]+$/.test(url);

const defaultStatsResponse = () =>
  new Response(JSON.stringify({
    stats: { additions: 10, deletions: 2 },
    files: [{ filename: "a.ts" }],
  }), { status: 200 });

const defaultStatsFields = { additions: 10, deletions: 2, filesChanged: 1 };

/** Route /search/commits separately so REST mocks stay sequential. */
const mockRestThenEmptySearch = (...restResponses: Response[]) => {
  const queue = [...restResponses];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/search/commits")) return emptySearchResponse();
    if (isCommitDetailUrl(url)) return defaultStatsResponse();
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected REST fetch: ${url}`);
    return next;
  });
};

describe("fetchCommitMessages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches commit messages for multiple repos", async () => {
    mockRestThenEmptySearch(
      pagedResponse([
        makeRawCommit("feat: add login", "a1"),
        makeRawCommit("fix: typo in header", "a2"),
      ]),
      pagedResponse([
        makeRawCommit("chore: update deps", "b1"),
      ]),
    );

    const result = await fetchCommitMessages("token", "user", ["org/repo-a", "org/repo-b"], range, "UTC");

    expect(result).toHaveLength(2);
    const byRepo = Object.fromEntries(result.map((r) => [r.repo, r]));
    expect(byRepo["org/repo-a"].messages).toEqual(["feat: add login", "fix: typo in header"]);
    expect(byRepo["org/repo-a"].commits?.length).toBe(2);
    expect(byRepo["org/repo-b"].messages).toEqual(["chore: update deps"]);
  });

  it("paginates through multiple pages", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeRawCommit(`page1-${i}`, `p1-${i}`));
    const page2 = Array.from({ length: 50 }, (_, i) => makeRawCommit(`page2-${i}`, `p2-${i}`));

    mockRestThenEmptySearch(
      pagedResponse(page1, "https://api.github.com/repos/org/repo/commits?page=2"),
      pagedResponse(page2),
    );

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].messages).toHaveLength(150);
    expect(result[0].messages[0]).toBe("page1-0");
    expect(result[0].messages[100]).toBe("page2-0");
  });

  it("extracts only the first line of multi-line commit messages", async () => {
    mockRestThenEmptySearch(
      pagedResponse([makeRawCommit("feat: new feature\n\nLong description here\nMore details")]),
    );

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].messages).toEqual(["feat: new feature"]);
  });

  it("truncates long commit messages to 200 characters", async () => {
    const longMessage = "a".repeat(300);
    mockRestThenEmptySearch(pagedResponse([makeRawCommit(longMessage)]));

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].messages[0]).toBe("a".repeat(200) + "...");
    expect(result[0].messages[0].length).toBe(203);
  });

  it("skips repos with no commits", async () => {
    mockRestThenEmptySearch(pagedResponse([]));

    const result = await fetchCommitMessages("token", "user", ["org/empty"], range, "UTC");

    expect(result).toHaveLength(0);
  });

  it("skips repos returning 404", async () => {
    mockRestThenEmptySearch(new Response("", { status: 404, statusText: "Not Found" }));

    const result = await fetchCommitMessages("token", "user", ["org/deleted"], range, "UTC");

    expect(result).toHaveLength(0);
  });

  it("skips repos returning 409 (empty repo)", async () => {
    mockRestThenEmptySearch(new Response("", { status: 409 }));

    const result = await fetchCommitMessages("token", "user", ["org/empty-repo"], range, "UTC");

    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty repos list", async () => {
    const result = await fetchCommitMessages("token", "user", [], range, "UTC");

    expect(result).toEqual([]);
  });

  it("skips falsy entries in repos list without calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await fetchCommitMessages("token", "user", [""], range, "UTC");

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retries on 429 rate limit", async () => {
    mockRestThenEmptySearch(
      new Response("", { status: 429, headers: { "retry-after": "0" } }),
      pagedResponse([makeRawCommit("after retry")]),
    );

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].messages).toEqual(["after retry"]);
  });

  it("falls back to the default delay when retry-after header is missing", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = mockRestThenEmptySearch(
      new Response("", { status: 429 }),
      pagedResponse([makeRawCommit("after default delay")]),
    );

    const promise = fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/repos/"))).toBe(true);
    expect(result[0].messages).toEqual(["after default delay"]);
    vi.useRealTimers();
  });

  it("falls back to the default delay when retry-after value is invalid", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockRestThenEmptySearch(
      new Response("", { status: 429, headers: { "retry-after": "soon" } }),
      pagedResponse([makeRawCommit("after invalid delay")]),
    );

    const promise = fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result[0].messages).toEqual(["after invalid delay"]);
    vi.useRealTimers();
  });

  it("fails closed after retry exhaustion on persistent 429", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/search/commits")) return emptySearchResponse();
      return new Response("", {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "retry-after": "0" },
      });
    });

    const promise = fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");
    const rejection = expect(promise).rejects.toThrow(/GitHub API rate limit is exhausted/);
    await vi.runAllTimersAsync();
    await rejection;

    expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/repos/")).length).toBe(4);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("429"));
    vi.useRealTimers();
  });

  it("ignores link header without rel=\"next\"", async () => {
    mockRestThenEmptySearch(
      new Response(JSON.stringify([makeRawCommit("only page")]), {
        status: 200,
        headers: { link: '<https://api.github.com/repos/org/repo/commits?page=1>; rel="prev"' },
      }),
    );

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].messages).toEqual(["only page"]);
  });

  it("warns and skips on non-retryable server errors", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockRestThenEmptySearch(
      new Response("", { status: 500, statusText: "Internal Server Error" }),
    );

    const result = await fetchCommitMessages("token", "user", ["org/broken"], range, "UTC");

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to fetch commits: 500 Internal Server Error"),
    );
  });

  it("includes Search-only commits when the default branch listing is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/search/commits")) {
        return searchResponse([
          makeSearchItem("chore: seed monorepo", "search1", "2026-04-01T15:00:00Z"),
        ]);
      }
      if (isCommitDetailUrl(url)) return defaultStatsResponse();
      return pagedResponse([]);
    });

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result).toEqual([{
      repo: "org/repo",
      messages: ["chore: seed monorepo"],
      commits: [{
        sha: "search1",
        message: "chore: seed monorepo",
        url: "https://github.com/org/repo/commit/search1",
        authoredAt: "2026-04-01T15:00:00Z",
        ...defaultStatsFields,
      }],
    }]);
  });

  it("deduplicates the same sha from REST and Search, preferring REST fields", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/search/commits")) {
        return searchResponse([
          makeSearchItem("feat: from search", "shared", "2026-04-01T10:00:00Z"),
          makeSearchItem("feat: search only", "search-only", "2026-04-01T11:00:00Z"),
        ]);
      }
      if (isCommitDetailUrl(url)) return defaultStatsResponse();
      return pagedResponse([
        makeRawCommit("feat: from rest", "shared", "2026-04-01T10:00:00Z"),
      ]);
    });

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].commits).toEqual([
      {
        sha: "shared",
        message: "feat: from rest",
        url: "https://github.com/org/repo/commit/shared",
        authoredAt: "2026-04-01T10:00:00Z",
        ...defaultStatsFields,
      },
      {
        sha: "search-only",
        message: "feat: search only",
        url: "https://github.com/org/repo/commit/search-only",
        authoredAt: "2026-04-01T11:00:00Z",
        ...defaultStatsFields,
      },
    ]);
  });

  it("retries commit search on 429 then succeeds", async () => {
    let searchAttempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/search/commits")) {
        searchAttempts += 1;
        if (searchAttempts === 1) {
          return new Response("", { status: 429, headers: { "retry-after": "0" } });
        }
        return searchResponse([
          makeSearchItem("after search retry", "s1", "2026-04-01T12:00:00Z"),
        ]);
      }
      if (isCommitDetailUrl(url)) return defaultStatsResponse();
      return pagedResponse([]);
    });

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(searchAttempts).toBe(2);
    expect(result[0].messages).toEqual(["after search retry"]);
  });

  it("filters Search commits whose authoredAt is outside the report range", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/search/commits")) {
        return searchResponse([
          makeSearchItem("inside", "in", "2026-04-01T12:00:00Z"),
          makeSearchItem("before", "out", "2026-03-29T12:00:00Z"),
        ]);
      }
      if (isCommitDetailUrl(url)) return defaultStatsResponse();
      return pagedResponse([]);
    });

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].commits?.map((c) => c.sha)).toEqual(["in"]);
  });

  it("keeps REST commits when Search fails after retries", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/search/commits")) {
        return new Response("", { status: 500, statusText: "Internal Server Error" });
      }
      if (isCommitDetailUrl(url)) return defaultStatsResponse();
      return pagedResponse([makeRawCommit("from rest", "r1")]);
    });

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].messages).toEqual(["from rest"]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to search commits for org/repo: 500"),
    );
  });

  it("maps commit stats onto listed commits", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/search/commits")) return emptySearchResponse();
      if (url.endsWith("/commits/big")) {
        return new Response(JSON.stringify({
          stats: { additions: 4000, deletions: 200 },
          files: [{ filename: "a.ts" }, { filename: "b.ts" }],
        }), { status: 200 });
      }
      if (isCommitDetailUrl(url)) return defaultStatsResponse();
      return pagedResponse([makeRawCommit("feat: large seed", "big")]);
    });

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].commits).toEqual([{
      sha: "big",
      message: "feat: large seed",
      url: "https://github.com/org/repo/commit/big",
      authoredAt: "2026-04-01T12:00:00Z",
      additions: 4000,
      deletions: 200,
      filesChanged: 2,
    }]);
  });

  it("leaves stats undefined when commit detail returns 404", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/search/commits")) return emptySearchResponse();
      if (isCommitDetailUrl(url)) return new Response("", { status: 404, statusText: "Not Found" });
      return pagedResponse([makeRawCommit("feat: missing detail", "gone")]);
    });

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range, "UTC");

    expect(result[0].commits?.[0]).toEqual({
      sha: "gone",
      message: "feat: missing detail",
      url: "https://github.com/org/repo/commit/gone",
      authoredAt: "2026-04-01T12:00:00Z",
    });
  });
});

describe("mergeCommitMessagesWithPRs", () => {
  it("adds PR-only commits and deduplicates commits already on the default branch", () => {
    const shared = {
      sha: "shared",
      message: "feat: shared",
      url: "https://github.com/org/repo/commit/shared",
      authoredAt: "2026-04-01T10:00:00Z",
    };
    const prOnly = {
      sha: "pr-only",
      message: "fix: still on PR branch",
      url: "https://github.com/org/repo/commit/pr-only",
      authoredAt: "2026-04-01T11:00:00Z",
    };
    const merged = mergeCommitMessagesWithPRs(
      [{ repo: "org/repo", messages: [shared.message], commits: [shared] }],
      [{
        title: "PR",
        body: null,
        url: "https://github.com/org/repo/pull/1",
        repository: "org/repo",
        state: "open",
        labels: [],
        additions: 1,
        deletions: 0,
        changedFiles: 1,
        author: "alice",
        createdAt: "2026-04-01T09:00:00Z",
        mergedAt: null,
        workCommits: [shared, prOnly],
      }],
    );

    expect(merged).toEqual([{
      repo: "org/repo",
      messages: ["feat: shared", "fix: still on PR branch"],
      commits: [shared, prOnly],
    }]);
  });
});
