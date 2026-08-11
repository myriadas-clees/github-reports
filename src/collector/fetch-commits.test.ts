import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCommitMessages, mergeCommitMessagesWithPRs } from "./fetch-commits.js";
import type { DateRange } from "./date-range.js";

const range: DateRange = {
  from: new Date("2026-03-30T00:00:00Z"),
  to: new Date("2026-04-05T23:59:59Z"),
};

const makeRawCommit = (message: string) => ({
  sha: "abc123",
  html_url: "https://github.com/org/repo/commit/abc123",
  commit: { message, author: { date: "2026-04-01T12:00:00Z" } },
});

// Helper to create a Response with a Link header for pagination
const pagedResponse = (commits: unknown[], nextUrl?: string) => {
  const headers: Record<string, string> = {};
  if (nextUrl) headers["link"] = `<${nextUrl}>; rel="next"`;
  return new Response(JSON.stringify(commits), { status: 200, headers });
};

describe("fetchCommitMessages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches commit messages for multiple repos", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(pagedResponse([
        makeRawCommit("feat: add login"),
        makeRawCommit("fix: typo in header"),
      ]))
      .mockResolvedValueOnce(pagedResponse([
        makeRawCommit("chore: update deps"),
      ]));

    const result = await fetchCommitMessages("token", "user", ["org/repo-a", "org/repo-b"], range);

    expect(result).toHaveLength(2);
    expect(result[0].repo).toBe("org/repo-a");
    expect(result[0].messages).toEqual(["feat: add login", "fix: typo in header"]);
    expect(result[0].commits?.length).toBe(2);
    expect(result[1].repo).toBe("org/repo-b");
    expect(result[1].messages).toEqual(["chore: update deps"]);
  });

  it("paginates through multiple pages", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeRawCommit(`page1-${i}`));
    const page2 = Array.from({ length: 50 }, (_, i) => makeRawCommit(`page2-${i}`));

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(pagedResponse(page1, "https://api.github.com/repos/org/repo/commits?page=2"))
      .mockResolvedValueOnce(pagedResponse(page2));

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range);

    expect(result[0].messages).toHaveLength(150);
    expect(result[0].messages[0]).toBe("page1-0");
    expect(result[0].messages[100]).toBe("page2-0");
  });

  it("extracts only the first line of multi-line commit messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      pagedResponse([makeRawCommit("feat: new feature\n\nLong description here\nMore details")]),
    );

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range);

    expect(result[0].messages).toEqual(["feat: new feature"]);
  });

  it("truncates long commit messages to 200 characters", async () => {
    const longMessage = "a".repeat(300);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      pagedResponse([makeRawCommit(longMessage)]),
    );

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range);

    expect(result[0].messages[0]).toBe("a".repeat(200) + "...");
    expect(result[0].messages[0].length).toBe(203);
  });

  it("skips repos with no commits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(pagedResponse([]));

    const result = await fetchCommitMessages("token", "user", ["org/empty"], range);

    expect(result).toHaveLength(0);
  });

  it("skips repos returning 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 404, statusText: "Not Found" }),
    );

    const result = await fetchCommitMessages("token", "user", ["org/deleted"], range);

    expect(result).toHaveLength(0);
  });

  it("skips repos returning 409 (empty repo)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 409 }),
    );

    const result = await fetchCommitMessages("token", "user", ["org/empty-repo"], range);

    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty repos list", async () => {
    const result = await fetchCommitMessages("token", "user", [], range);

    expect(result).toEqual([]);
  });

  it("skips falsy entries in repos list without calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await fetchCommitMessages("token", "user", [""], range);

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retries on 429 rate limit", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "0" } }),
      )
      .mockResolvedValueOnce(pagedResponse([makeRawCommit("after retry")]));

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range);

    expect(result[0].messages).toEqual(["after retry"]);
  });

  it("falls back to the default delay when retry-after header is missing", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(pagedResponse([makeRawCommit("after default delay")]));

    const promise = fetchCommitMessages("token", "user", ["org/repo"], range);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result[0].messages).toEqual(["after default delay"]);
    vi.useRealTimers();
  });

  it("falls back to the default delay when retry-after value is invalid", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "soon" } }),
      )
      .mockResolvedValueOnce(pagedResponse([makeRawCommit("after invalid delay")]));

    const promise = fetchCommitMessages("token", "user", ["org/repo"], range);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result[0].messages).toEqual(["after invalid delay"]);
    vi.useRealTimers();
  });

  it("gives up after retry exhaustion on persistent 429", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "retry-after": "0" },
      }),
    );

    const promise = fetchCommitMessages("token", "user", ["org/repo"], range);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch commits"));
    vi.useRealTimers();
  });

  it("ignores link header without rel=\"next\"", async () => {
    // Link header present but only contains rel="prev" — parseNextUrl's regex
    // does not match, so pagination should stop after the first page.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([makeRawCommit("only page")]), {
        status: 200,
        headers: { link: '<https://api.github.com/repos/org/repo/commits?page=1>; rel="prev"' },
      }),
    );

    const result = await fetchCommitMessages("token", "user", ["org/repo"], range);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result[0].messages).toEqual(["only page"]);
  });

  it("warns and skips on non-retryable server errors", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 500, statusText: "Internal Server Error" }),
    );

    const result = await fetchCommitMessages("token", "user", ["org/broken"], range);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to fetch commits: 500 Internal Server Error"),
    );
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
