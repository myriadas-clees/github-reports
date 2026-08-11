import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReviewsForRepos } from "./fetch-reviews.js";

describe("fetchReviewsForRepos", () => {
  afterEach(() => vi.restoreAllMocks());

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
          updated_at: "2026-08-11T04:30:00Z",
        }]));
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

  it("bounds historical candidates before applying the per-repo cap", async () => {
    const later = Array.from({ length: 101 }, (_, index) => ({
      number: index + 100,
      title: `Later ${index}`,
      html_url: `https://github.com/org/app/pull/${index + 100}`,
      updated_at: "2026-08-20T12:00:00Z",
    }));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/pulls?")) {
        return new Response(JSON.stringify([...later, {
          number: 7,
          title: "Historical review",
          html_url: "https://github.com/org/app/pull/7",
          updated_at: "2026-08-10T20:00:00Z",
        }]));
      }
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
    );
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]?.prNumber).toBe(7);
  });
});
