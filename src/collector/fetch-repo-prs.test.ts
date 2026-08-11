import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapState, fetchAuthoredPRRefsForBackfill, fetchPRsByRefs, searchAuthoredPRRefsForBackfill } from "./fetch-repo-prs.js";
import type { PRRef } from "./fetch-repo-prs.js";

describe("mapState", () => {
  it("returns 'merged' when mergedAt is truthy", () => {
    expect(mapState("closed", "2026-04-01T12:00:00Z")).toBe("merged");
  });

  it("returns 'merged' even when state is open but mergedAt is set", () => {
    expect(mapState("open", "2026-04-01T12:00:00Z")).toBe("merged");
  });

  it("returns 'closed' when state is closed and mergedAt is null", () => {
    expect(mapState("closed", null)).toBe("closed");
  });

  it("returns 'open' when state is open and mergedAt is null", () => {
    expect(mapState("open", null)).toBe("open");
  });

  it("returns 'open' for any non-closed state without mergedAt", () => {
    expect(mapState("draft", null)).toBe("open");
  });
});

describe("fetchPRsByRefs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const makeRawPR = (number: number) => ({
    number,
    title: `PR #${number}`,
    state: "open",
    html_url: `https://github.com/owner/repo/pull/${number}`,
    body: "Some body",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-02T00:00:00Z",
    merged_at: null,
    additions: 10,
    deletions: 5,
    changed_files: 3,
    user: { login: "testuser" },
    labels: [{ name: "feature" }],
  });

  it("fetches and maps PRs correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(makeRawPR(1)), { status: 200 }),
    );

    const refs: PRRef[] = [{ repo: "owner/repo", number: 1 }];
    const result = await fetchPRsByRefs("token", refs);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("PR #1");
    expect(result[0].repository).toBe("owner/repo");
    expect(result[0].state).toBe("open");
    expect(result[0].labels).toEqual(["feature"]);
    expect(result[0].additions).toBe(10);
    expect(result[0].deletions).toBe(5);
    expect(result[0].changedFiles).toBe(3);
  });

  it("hydrates in-range PR commit timestamps for historical work", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/commits?")) {
        return new Response(JSON.stringify([
          { sha: "in-range", commit: { author: { date: "2026-04-01T12:00:00Z" } } },
          { sha: "later", commit: { author: { date: "2026-04-03T12:00:00Z" } } },
        ]));
      }
      if (url.endsWith("/commits/in-range")) {
        return new Response(JSON.stringify({ stats: { additions: 4, deletions: 2 } }));
      }
      return new Response(JSON.stringify(makeRawPR(1)));
    });
    const result = await fetchPRsByRefs(
      "token",
      [{ repo: "owner/repo", number: 1 }],
      { from: new Date("2026-04-01T00:00:00Z"), to: new Date("2026-04-01T23:59:59Z") },
    );
    expect(result[0]?.workTimestamps).toEqual(["2026-04-01T12:00:00Z"]);
    expect(result[0]).toMatchObject({ workAdditions: 4, workDeletions: 2 });
  });

  it("discovers historical authored PRs across private repositories visible to the token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      items: [{ number: 9, repository_url: "https://api.github.com/repos/private-org/private-app" }],
    })));
    const refs = await searchAuthoredPRRefsForBackfill(
      "secret-token",
      "alice",
      { from: new Date("2026-04-01T00:00:00Z"), to: new Date("2026-04-01T23:59:59Z") },
    );
    expect(refs).toEqual([{ repo: "private-org/private-app", number: 9 }]);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer secret-token" }),
    });
  });

  it("enumerates authored PRs that existed by a backfill day", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
      { number: 1, created_at: "2026-04-01T00:00:00Z", user: { login: "Alice" } },
      { number: 2, created_at: "2026-04-03T00:00:00Z", user: { login: "alice" } },
      { number: 3, created_at: "2026-04-01T00:00:00Z", user: { login: "bob" } },
    ])));
    const refs = await fetchAuthoredPRRefsForBackfill(
      "token",
      "alice",
      ["owner/repo"],
      { from: new Date("2026-04-01T00:00:00Z"), to: new Date("2026-04-01T23:59:59Z") },
    );
    expect(refs).toEqual([{ repo: "owner/repo", number: 1 }]);
  });

  it("deduplicates refs before fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(makeRawPR(1)), { status: 200 }),
    );

    const refs: PRRef[] = [
      { repo: "owner/repo", number: 1 },
      { repo: "owner/repo", number: 1 },
    ];
    await fetchPRsByRefs("token", refs);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("skips failed fetches", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 404, statusText: "Not Found" }))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeRawPR(2)), { status: 200 }));

    const refs: PRRef[] = [
      { repo: "owner/repo", number: 1 },
      { repo: "owner/repo", number: 2 },
    ];
    const result = await fetchPRsByRefs("token", refs);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("PR #2");
  });

  it("returns empty array for empty refs", async () => {
    const result = await fetchPRsByRefs("token", []);
    expect(result).toEqual([]);
  });

  it("handles merged PR state correctly", async () => {
    const rawPR = { ...makeRawPR(1), state: "closed", merged_at: "2026-04-02T00:00:00Z" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(rawPR), { status: 200 }),
    );

    const refs: PRRef[] = [{ repo: "owner/repo", number: 1 }];
    const result = await fetchPRsByRefs("token", refs);
    expect(result[0].state).toBe("merged");
    expect(result[0].mergedAt).toBe("2026-04-02T00:00:00Z");
  });

  it("handles null user as unknown author", async () => {
    const rawPR = { ...makeRawPR(1), user: null };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(rawPR), { status: 200 }),
    );

    const refs: PRRef[] = [{ repo: "owner/repo", number: 1 }];
    const result = await fetchPRsByRefs("token", refs);
    expect(result[0].author).toBe("unknown");
  });

  it("retries on 429 honoring retry-after header then succeeds", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("", {
          status: 429,
          statusText: "Too Many Requests",
          headers: { "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeRawPR(1)), { status: 200 }),
      );

    const promise = fetchPRsByRefs("token", [{ repo: "owner/repo", number: 1 }]);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("PR #1");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("429"));
    vi.useRealTimers();
  });

  it("falls back to default delay when retry-after is missing and exhausts retries", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 429, statusText: "Too Many Requests" }),
    );

    const promise = fetchPRsByRefs("token", [{ repo: "owner/repo", number: 1 }]);
    await vi.runAllTimersAsync();
    const result = await promise;

    // MAX_RETRIES = 3 → attempts 0..3 (4 total). On attempt 3, retry guard fails → returns null.
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Warning: 1 of 1 PRs"));
    vi.useRealTimers();
  });

  it("ignores invalid retry-after values and uses default delay", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("", {
          status: 429,
          statusText: "Too Many Requests",
          headers: { "retry-after": "not-a-number" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeRawPR(1)), { status: 200 }),
      );

    const promise = fetchPRsByRefs("token", [{ repo: "owner/repo", number: 1 }]);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    vi.useRealTimers();
  });

  it("logs error message from response body when fetch fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        statusText: "Not Found",
      }),
    );

    const result = await fetchPRsByRefs("token", [{ repo: "owner/repo", number: 1 }]);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Not Found"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("    Not Found"));
  });

  it("omits the indented detail line when error body JSON has no message field", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ documentation_url: "https://docs.github.com" }), {
        status: 422,
        statusText: "Unprocessable Entity",
      }),
    );

    const result = await fetchPRsByRefs("token", [{ repo: "owner/repo", number: 1 }]);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("422"));
    expect(
      warnSpy.mock.calls.some((call) => /^\s{4}\S/.test(String(call[0]))),
    ).toBe(false);
  });
});
