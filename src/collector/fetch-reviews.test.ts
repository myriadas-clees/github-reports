import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReviewsForRepos } from "./fetch-reviews.js";

describe("fetchReviewsForRepos", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([false, true])("retains candidate metadata for comment-only reviews (historical: %s)", async (historical) => {
    const candidate = { number: 7, title: "feat(pricing): tiers", html_url: "https://github.com/org/app/pull/7", labels: [{ name: "app: pricing" }], created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-10T20:00:00Z" };
    const comment = { id: 1, user: { login: "alice" }, body: "Looks good", html_url: "comment", path: "a.ts", created_at: "2026-08-10T20:00:00Z", pull_request_url: "https://api.github.com/repos/org/app/pulls/7" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/graphql")) return new Response(JSON.stringify({ data: {} }));
      if (url.includes("/pulls/comments?")) return new Response(JSON.stringify([comment]));
      if (url.includes("/pulls?")) return new Response(JSON.stringify([candidate]));
      if (url.endsWith("/pulls/7")) return new Response(JSON.stringify(candidate));
      if (url.endsWith("/pulls/7/comments")) return new Response(JSON.stringify([comment]));
      return new Response("[]");
    });
    const result = await fetchReviewsForRepos("token", "alice", ["org/app"],
      { from: new Date("2026-08-10T00:00:00Z"), to: new Date("2026-08-10T23:59:59Z") },
      new Date("2026-08-11T00:00:00Z"), historical);
    expect(result.reviews).toEqual([]);
    expect(result.comments).toMatchObject([{ prTitle: "feat(pricing): tiers", prLabels: ["app: pricing"] }]);
  });

  it("matches the conservative scan while avoiding inactive comment threads", async () => {
    const range = { from: new Date("2026-08-10T04:00:00Z"), to: new Date("2026-08-11T03:59:59.999Z") };
    const candidates = Array.from({ length: 40 }, (_, i) => ({
      repo: "private/app", number: i + 1, title: `PR ${i + 1}`, url: `https://github.com/private/app/pull/${i + 1}`, labels: [],
    }));
    const parent = { id: 1, in_reply_to_id: null, user: { login: "codex[bot]" }, body: "Please fix", created_at: "2026-08-09T12:00:00Z", pull_request_url: "https://api.github.com/repos/private/app/pulls/2", html_url: "parent", path: "a.ts" };
    const reply = { ...parent, id: 2, in_reply_to_id: 1, user: { login: "alice" }, body: "Fixed", created_at: range.from.toISOString(), html_url: "reply" };
    let fallback = false;
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls++;
      const url = String(input);
      if (url.endsWith("/graphql")) return new Response(JSON.stringify({ data: {} }));
      if (url.includes("/pulls/comments?")) return fallback
        ? new Response("", { status: 404 })
        : new Response(JSON.stringify([reply]));
      if (url.endsWith("/pulls/2/comments")) return new Response(JSON.stringify([parent, reply]));
      if (url.endsWith("/pulls/3/reviews")) return new Response(JSON.stringify([{
        user: { login: "alice" }, state: "APPROVED", body: "ok", submitted_at: "2026-08-10T12:00:00Z", html_url: "review", pull_request_url: "https://api.github.com/repos/private/app/pulls/3",
      }, {
        user: { login: "cursor[bot]" }, state: "COMMENTED", body: "", submitted_at: "2026-08-10T13:00:00Z", html_url: "ai", pull_request_url: "https://api.github.com/repos/private/app/pulls/3",
      }]));
      return new Response(JSON.stringify([]));
    });
    const collect = () => fetchReviewsForRepos("token", "alice", ["private/app"], range, new Date("2026-09-01"), true, candidates);
    const optimized = await collect();
    const optimizedCalls = calls;
    fallback = true;
    calls = 0;
    const conservative = await collect();
    expect(optimized).toEqual(conservative);
    expect(optimized.comments).toHaveLength(1);
    expect(optimized.reviews).toHaveLength(1);
    expect(optimized.aiReviews.codex.fixed).toBe(1);
    expect(optimizedCalls).toBe(43);
    expect(calls).toBe(82);
  });

  it("falls back to full threads if a later repository comment page fails", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/pulls/comments?since=")) return new Response("[]", { headers: { link: '<https://api.github.com/page2>; rel="next"' } });
      if (url.endsWith("/page2")) return new Response("", { status: 404 });
      return new Response("[]");
    });
    await fetchReviewsForRepos("token", "alice", ["private/app"],
      { from: new Date("2026-08-10"), to: new Date("2026-08-11") }, new Date(), true,
      [{ repo: "private/app", number: 1, title: "Old", url: "https://github.com/private/app/pull/1" }]);
    expect(urls).toContain("https://api.github.com/repos/private/app/pulls/1/comments");
  });

  it("retains in-range reviews when the PR changes after midnight", async () => {
    const range = {
      from: new Date("2026-08-10T04:00:00Z"),
      to: new Date("2026-08-11T03:59:59.999Z"),
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/pulls?")) {
        return new Response(JSON.stringify([{
          number: 7,
          title: "Reviewed work",
          html_url: "https://github.com/org/app/pull/7",
          created_at: "2026-08-01T12:00:00Z",
          updated_at: "2026-08-11T04:30:00Z",
        }]));
      }
      if (url.endsWith("/pulls/7")) {
        return new Response(JSON.stringify({
          number: 7,
          title: "Historical review",
          html_url: "https://github.com/org/app/pull/7",
          created_at: "2026-08-01T12:00:00Z",
          updated_at: "2026-08-20T20:00:00Z",
        }));
      }
      if (url.endsWith("/reviews")) {
        return new Response(JSON.stringify([{
          user: { login: "alice" },
          state: "APPROVED",
          body: "Looks good",
          submitted_at: "2026-08-10T20:00:00Z",
          html_url: "https://github.com/org/app/pull/7#review",
          pull_request_url: "https://api.github.com/repos/org/app/pulls/7",
        }]));
      }
      return new Response(JSON.stringify([]));
    });

    const result = await fetchReviewsForRepos(
      "token",
      "alice",
      ["org/app"],
      range,
      new Date("2026-08-11T05:00:00Z"),
    );

    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]).toMatchObject({ repository: "org/app", prNumber: 7 });
  });

  it("does not inspect PRs first updated after collection", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([{
      number: 8,
      title: "Future update",
      html_url: "https://github.com/org/app/pull/8",
      created_at: "2026-08-01T12:00:00Z",
      updated_at: "2026-08-11T06:00:00Z",
    }])));
    const result = await fetchReviewsForRepos(
      "token",
      "alice",
      ["org/app"],
      { from: new Date("2026-08-10T04:00:00Z"), to: new Date("2026-08-11T03:59:59.999Z") },
      new Date("2026-08-11T05:00:00Z"),
    );
    expect(result.reviews).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("preserves hydrated titles for historical candidates without re-fetching them", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/reviews")) {
        return new Response(JSON.stringify([{
          user: { login: "alice" },
          state: "APPROVED",
          body: "Looks good",
          submitted_at: "2026-08-10T19:00:00Z",
          html_url: "https://github.com/org/app/pull/7#review",
          pull_request_url: "https://api.github.com/repos/org/app/pulls/7",
        }]));
      }
      return new Response(JSON.stringify([]));
    });
    const result = await fetchReviewsForRepos(
      "token",
      "alice",
      ["org/app"],
      { from: new Date("2026-08-10T04:00:00Z"), to: new Date("2026-08-11T03:59:59.999Z") },
      new Date("2026-08-21T00:00:00Z"),
      true,
      [{
        repo: "org/app",
        number: 7,
        title: "Historical review",
        url: "https://github.com/org/app/pull/7",
      }],
    );
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]).toMatchObject({
      prNumber: 7,
      prTitle: "Historical review",
      prUrl: "https://github.com/org/app/pull/7",
    });
    expect(urls.some((url) => /\/pulls\/7$/.test(url))).toBe(false);
  });

  it("retries a secondary rate-limit 403 when listing reviews", async () => {
    let reviewCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/pulls?")) {
        return new Response(JSON.stringify([{
          number: 7,
          title: "Reviewed work",
          html_url: "https://github.com/org/app/pull/7",
          created_at: "2026-08-01T12:00:00Z",
          updated_at: "2026-08-10T20:00:00Z",
        }]));
      }
      if (url.endsWith("/reviews")) {
        reviewCalls += 1;
        if (reviewCalls === 1) {
          return new Response("", {
            status: 403,
            statusText: "Forbidden",
            headers: { "retry-after": "0" },
          });
        }
        return new Response(JSON.stringify([{
          user: { login: "alice" },
          state: "APPROVED",
          body: "Looks good",
          submitted_at: "2026-08-10T20:00:00Z",
          html_url: "https://github.com/org/app/pull/7#review",
          pull_request_url: "https://api.github.com/repos/org/app/pulls/7",
        }]));
      }
      return new Response(JSON.stringify([]));
    });

    const result = await fetchReviewsForRepos(
      "token",
      "alice",
      ["org/app"],
      { from: new Date("2026-08-10T04:00:00Z"), to: new Date("2026-08-11T03:59:59.999Z") },
      new Date("2026-08-11T05:00:00Z"),
    );

    expect(reviewCalls).toBe(2);
    expect(result.reviews).toHaveLength(1);
  });

  it.each([
    { status: 403, statusText: "Forbidden", label: "403" },
    { status: 429, statusText: "Too Many Requests", label: "429" },
  ])("waits at least one minute before retrying a secondary-limit $label without Retry-After", async ({ status, statusText }) => {
    vi.useFakeTimers();
    let reviewCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/pulls?")) {
        return new Response(JSON.stringify([{
          number: 7,
          title: "Reviewed work",
          html_url: "https://github.com/org/app/pull/7",
          created_at: "2026-08-01T12:00:00Z",
          updated_at: "2026-08-10T20:00:00Z",
        }]));
      }
      if (url.endsWith("/reviews")) {
        reviewCalls += 1;
        if (reviewCalls === 1) {
          return new Response(JSON.stringify({
            message: "You have exceeded a secondary rate limit. Please wait a while before making new requests.",
          }), {
            status,
            statusText,
            headers: { "x-ratelimit-remaining": "4999" },
          });
        }
        return new Response(JSON.stringify([{
          user: { login: "alice" },
          state: "APPROVED",
          body: "Looks good",
          submitted_at: "2026-08-10T20:00:00Z",
          html_url: "https://github.com/org/app/pull/7#review",
          pull_request_url: "https://api.github.com/repos/org/app/pulls/7",
        }]));
      }
      return new Response(JSON.stringify([]));
    });

    const resultPromise = fetchReviewsForRepos(
      "token",
      "alice",
      ["org/app"],
      { from: new Date("2026-08-10T04:00:00Z"), to: new Date("2026-08-11T03:59:59.999Z") },
      new Date("2026-08-11T05:00:00Z"),
    );

    await vi.advanceTimersByTimeAsync(59_999);
    expect(reviewCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(reviewCalls).toBe(2);
    expect(result.reviews).toHaveLength(1);
  });

  it("waits until x-ratelimit-reset for a primary-limit 403", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
    const resetUnix = Math.floor(new Date("2026-09-02T12:10:00Z").getTime() / 1000);
    let reviewCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/pulls?")) {
        return new Response(JSON.stringify([{
          number: 7,
          title: "Reviewed work",
          html_url: "https://github.com/org/app/pull/7",
          created_at: "2026-08-01T12:00:00Z",
          updated_at: "2026-08-10T20:00:00Z",
        }]));
      }
      if (url.endsWith("/reviews")) {
        reviewCalls += 1;
        if (reviewCalls === 1) {
          return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
            status: 403,
            statusText: "Forbidden",
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": String(resetUnix),
            },
          });
        }
        return new Response(JSON.stringify([{
          user: { login: "alice" },
          state: "APPROVED",
          body: "Looks good",
          submitted_at: "2026-08-10T20:00:00Z",
          html_url: "https://github.com/org/app/pull/7#review",
          pull_request_url: "https://api.github.com/repos/org/app/pulls/7",
        }]));
      }
      return new Response(JSON.stringify([]));
    });

    const resultPromise = fetchReviewsForRepos(
      "token",
      "alice",
      ["org/app"],
      { from: new Date("2026-08-10T04:00:00Z"), to: new Date("2026-08-11T03:59:59.999Z") },
      new Date("2026-08-11T05:00:00Z"),
    );

    // Reset is 10 minutes out; short secondary backoff must not retry early.
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(reviewCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000 + 1_000);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(reviewCalls).toBe(2);
    expect(result.reviews).toHaveLength(1);
  });

  it("fails immediately on a permission-denied 403", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/pulls?")) {
        return new Response(JSON.stringify([{
          number: 7,
          title: "Reviewed work",
          html_url: "https://github.com/org/app/pull/7",
          created_at: "2026-08-01T12:00:00Z",
          updated_at: "2026-08-10T20:00:00Z",
        }]));
      }
      if (url.endsWith("/reviews")) {
        return new Response(JSON.stringify({
          message: "Resource not accessible by personal access token",
        }), { status: 403, statusText: "Forbidden" });
      }
      return new Response(JSON.stringify([]));
    });

    await expect(fetchReviewsForRepos(
      "token",
      "alice",
      ["org/app"],
      { from: new Date("2026-08-10T04:00:00Z"), to: new Date("2026-08-11T03:59:59.999Z") },
      new Date("2026-08-11T05:00:00Z"),
    )).rejects.toThrow(/Review fetch failed/);
  });
});
