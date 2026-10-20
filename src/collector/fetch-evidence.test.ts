import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchDeployments, fetchPrEvidence, isCommitContained, summarizeCheckRuns } from "./fetch-evidence.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const mockRoutes = (routes: Array<[RegExp, () => Response]>) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    for (const [re, fn] of routes) if (re.test(url)) return fn();
    return json({ message: "nf" }, 404);
  }));
};

afterEach(() => vi.unstubAllGlobals());

describe("isCommitContained", () => {
  it.each([["ahead", true], ["identical", true], ["behind", false], ["diverged", false]] as const)("maps %s comparisons", async (status, expected) => {
    mockRoutes([[ /compare\//, () => json({ status }) ]]);
    expect(await isCommitContained("t", "o/r", "base", "head")).toBe(expected);
  });
  it("returns null for inaccessible comparisons", async () => {
    mockRoutes([[ /compare\//, () => json({ message: "not found" }, 404) ]]);
    expect(await isCommitContained("t", "o/r", "base", "head")).toBeNull();
  });
});

describe("summarizeCheckRuns", () => {
  it("counts conclusions and dedupes by name keeping the latest", () => {
    const s = summarizeCheckRuns([
      { name: "ci", status: "completed", conclusion: "failure", completed_at: "2026-01-01T00:00:00Z" },
      { name: "ci", status: "completed", conclusion: "success", completed_at: "2026-01-01T01:00:00Z" },
      { name: "lint", status: "completed", conclusion: "cancelled", completed_at: "2026-01-01T00:00:00Z" },
      { name: "docs", status: "completed", conclusion: "skipped", completed_at: "2026-01-01T00:00:00Z" },
      { name: "e2e", status: "in_progress", conclusion: null, started_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(s).toEqual({ passed: 1, failed: 1, skipped: 1, pending: 1, names: ["ci", "e2e", "lint"] });
  });

  it("keeps same-named checks from different suites as independent totals", () => {
    const s = summarizeCheckRuns([
      { name: "build", app: { id: 1 }, check_suite: { id: 10 }, status: "completed", conclusion: "failure", completed_at: "2026-01-01T00:00:00Z" },
      { name: "build", app: { id: 1 }, check_suite: { id: 20 }, status: "completed", conclusion: "success", completed_at: "2026-01-01T01:00:00Z" },
    ]);
    expect(s).toEqual({ passed: 1, failed: 1, skipped: 0, pending: 0, names: ["build"] });
  });

  it("dedupes reruns within the same app and check suite", () => {
    const s = summarizeCheckRuns([
      { name: "build", app: { id: 1 }, check_suite: { id: 10 }, status: "completed", conclusion: "failure", completed_at: "2026-01-01T00:00:00Z" },
      { name: "build", app: { id: 1 }, check_suite: { id: 10 }, status: "completed", conclusion: "success", completed_at: "2026-01-01T01:00:00Z" },
    ]);
    expect(s).toEqual({ passed: 1, failed: 0, skipped: 0, pending: 0, names: ["build"] });
  });

  it("falls back to name-only deduplication when app or suite metadata is missing", () => {
    const s = summarizeCheckRuns([
      { name: "build", app: { id: 1 }, status: "completed", conclusion: "failure", completed_at: "2026-01-01T00:00:00Z" },
      { name: "build", check_suite: { id: 10 }, status: "completed", conclusion: "success", completed_at: "2026-01-01T01:00:00Z" },
    ]);
    expect(s).toEqual({ passed: 1, failed: 0, skipped: 0, pending: 0, names: ["build"] });
  });
});

describe("fetchPrEvidence", () => {
  const pr = {
    draft: true, state: "closed", merged_at: "2026-06-02T00:00:00Z", created_at: "2026-06-01T00:00:00Z",
    merge_commit_sha: "mc", user: { login: "Me" }, base: { ref: "main" }, head: { ref: "feat", sha: "abc" },
  };
  it("builds evidence, excluding the author's own reviews and flagging bots", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([
        { user: { login: "me" }, state: "COMMENTED", submitted_at: "2026-06-01T01:00:00Z" },
        { user: { login: "alice" }, state: "APPROVED", submitted_at: "2026-06-01T02:00:00Z" },
        { user: { login: "copilot-pull-request-reviewer[bot]", type: "Bot" }, state: "COMMENTED", submitted_at: "2026-06-01T03:00:00Z" },
        { user: { login: "codex", type: "Bot" }, state: "COMMENTED", submitted_at: "2026-06-01T04:00:00Z" },
      ])],
      [/pulls\/5\/files/, () => json([{ filename: "a.ts" }, { filename: "b.ts" }])],
      [/check-runs/, () => json({ check_runs: [{ name: "ci", status: "completed", conclusion: "success" }] })],
      [/pulls\/5$/, () => json(pr)],
    ]);
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5, url: "https://github.com/o/r/pull/5" }, new Date("2026-06-03T00:00:00Z"));
    expect(ev).toMatchObject({ state: "merged", isDraft: true, baseRef: "main", headSha: "abc", mergeCommitSha: "mc", files: ["a.ts", "b.ts"] });
    expect(ev?.reviews.map((r) => [r.reviewer, r.bot])).toEqual([
      ["alice", false], ["copilot-pull-request-reviewer[bot]", true], ["codex", true],
    ]);
    expect(ev?.checks?.passed).toBe(1);
  });

  it("counts commit statuses when check runs are empty", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ check_runs: [] })],
      [/statuses\?per_page=100/, () => json([
        { context: "unit", state: "success", created_at: "2026-06-01T00:00:00Z" },
        { context: "deploy", state: "failure", created_at: "2026-06-01T00:01:00Z" },
        { context: "queue", state: "pending", created_at: "2026-06-01T00:02:00Z" },
      ])], [/pulls\/5$/, () => json(pr)],
    ]);
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5 });
    expect(ev?.checks).toEqual({ passed: 1, failed: 1, skipped: 0, pending: 1, names: ["deploy", "queue", "unit"] });
  });

  it("paginates commit statuses so older distinct contexts are included", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (/pulls\/5\/reviews/.test(url) || /pulls\/5\/files/.test(url)) return json([]);
      if (/check-runs/.test(url)) return json({ check_runs: [] });
      if (/statuses\?per_page=100$/.test(url)) return new Response(JSON.stringify([{ context: "new", state: "success", created_at: "2026-06-02T00:00:00Z" }]), {
        headers: { "content-type": "application/json", link: '<https://api.github.com/repos/o/r/commits/abc/statuses?per_page=100&page=2>; rel="next"' },
      });
      if (/statuses\?per_page=100&page=2/.test(url)) return json([{ context: "old", state: "failure", created_at: "2026-06-01T00:00:00Z" }]);
      if (/pulls\/5$/.test(url)) return json(pr);
      return json({}, 404);
    }));
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5 });
    expect(ev?.checks).toEqual({ passed: 1, failed: 1, skipped: 0, pending: 0, names: ["new", "old"] });
    expect(calls).toContain("https://api.github.com/repos/o/r/commits/abc/statuses?per_page=100&page=2");
  });

  it("marks paginated commit statuses unavailable on a soft 403", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ check_runs: [{ name: "ci", status: "completed", conclusion: "success" }] })],
      [/statuses\?per_page=100/, () => json({ message: "no" }, 403)], [/pulls\/5$/, () => json(pr)],
    ]);
    expect((await fetchPrEvidence("t", { repo: "o/r", number: 5 }))?.checks).toMatchObject({ passed: 1, statusesUnavailable: true });
  });

  it("counts same-named commit statuses independently from check runs", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ check_runs: [{ name: "same", status: "completed", conclusion: "success" }] })],
      [/statuses\?per_page=100/, () => json([
        { context: "same", state: "failure", created_at: "2026-06-01T00:00:00Z" },
        { context: "legacy", state: "success", created_at: "2026-06-01T00:01:00Z" },
      ])], [/pulls\/5$/, () => json(pr)],
    ]);
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5 });
    expect(ev?.checks).toEqual({ passed: 2, failed: 1, skipped: 0, pending: 0, names: ["legacy", "same"] });
  });

  it("counts a passing build check run and failing build status separately", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ check_runs: [{ name: "build", status: "completed", conclusion: "success" }] })],
      [/statuses\?per_page=100/, () => json([
        { context: "build", state: "failure", created_at: "2026-06-01T00:00:00Z" },
      ])], [/pulls\/5$/, () => json(pr)],
    ]);
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5 });
    expect(ev?.checks).toEqual({ passed: 1, failed: 1, skipped: 0, pending: 0, names: ["build"] });
  });

  it("uses check runs when the commit status endpoint returns 404", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ check_runs: [{ name: "ci", status: "completed", conclusion: "success" }] })],
      [/statuses\?per_page=100/, () => json({ message: "nf" }, 404)], [/pulls\/5$/, () => json(pr)],
    ]);
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5 });
    expect(ev?.checks).toEqual({ passed: 1, failed: 0, skipped: 0, pending: 0, names: ["ci"], statusesUnavailable: true });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/commits\/abc\/statuses\?per_page=100$/), expect.anything());
  });

  it("sets checks to null when check-runs are forbidden", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])],
      [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ message: "no" }, 403)],
      [/pulls\/5$/, () => json({ ...pr, merged_at: null, state: "open" })],
    ]);
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5 });
    expect(ev?.checks).toBeNull();
    expect(ev?.state).toBe("open");
  });

  it("keeps checks unknown when check-runs fail and statuses are empty", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ message: "no" }, 403)],
      [/statuses\?per_page=100/, () => json([])], [/pulls\/5$/, () => json(pr)],
    ]);
    expect((await fetchPrEvidence("t", { repo: "o/r", number: 5 }))?.checks).toBeNull();
  });

  it("counts statuses when check-runs fail and preserves zero checks when statuses fail", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ message: "no" }, 403)],
      [/statuses\?per_page=100/, () => json([{ context: "ci", state: "success" }])], [/pulls\/5$/, () => json(pr)],
    ]);
    expect((await fetchPrEvidence("t", { repo: "o/r", number: 5 }))?.checks?.passed).toBe(1);
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ check_runs: [] })], [/statuses\?per_page=100/, () => json({}, 404)], [/pulls\/5$/, () => json(pr)],
    ]);
    expect((await fetchPrEvidence("t", { repo: "o/r", number: 5 }))?.checks).toEqual({ passed: 0, failed: 0, skipped: 0, pending: 0, names: [], statusesUnavailable: true });
  });
});

describe("fetchDeployments", () => {
  it("uses GitHub's production flag and falls back to the environment name only when absent", async () => {
    mockRoutes([
      [/deployments\/1\/statuses/, () => json([{ state: "success", created_at: "2026-06-10T00:05:00Z" }])],
      [/deployments\/2\/statuses/, () => json([{ state: "success", created_at: "2026-06-10T00:05:00Z" }])],
      [/deployments\/3\/statuses/, () => json([{ state: "success", created_at: "2026-06-10T00:05:00Z" }])],
      [/deployments\?/, () => json([
        { id: 1, environment: "github-pages", production_environment: true, ref: "main", sha: "a", created_at: "2026-06-10T00:00:00Z" },
        { id: 2, environment: "production", production_environment: false, ref: "main", sha: "b", created_at: "2026-06-10T00:00:00Z" },
        { id: 3, environment: "production", ref: "main", sha: "c", created_at: "2026-06-10T00:00:00Z" },
      ])],
    ]);
    const out = await fetchDeployments("t", "o/r", "2026-06-01T00:00:00Z");
    expect(Object.fromEntries(out.records.map((r) => [r.sha, r.production]))).toEqual({ a: true, b: false, c: true });
    expect(out.failed).toBe(false);
  });

  it("keeps only successful deployments, detects production and skips known", async () => {
    const d = (id: number, environment: string, created_at: string) => ({ id, environment, ref: "main", sha: `sha${id}`, created_at });
    mockRoutes([
      [/deployments\/1\/statuses/, () => json([{ state: "success", created_at: "2026-06-10T00:05:00Z" }, { state: "pending", created_at: "2026-06-10T00:00:00Z" }])],
      [/deployments\/2\/statuses/, () => json([{ state: "failure", created_at: "2026-06-09T00:05:00Z" }])],
      [/deployments\/3\/statuses/, () => json([{ state: "success", created_at: "2026-06-08T00:05:00Z" }])],
      [/deployments\/4\/statuses/, () => { throw new Error("should be skipped"); }],
      [/deployments\?/, () => json([
        d(1, "production", "2026-06-10T00:00:00Z"),
        d(2, "production", "2026-06-09T00:00:00Z"),
        d(3, "Preview", "2026-06-08T00:00:00Z"),
        d(4, "production", "2026-06-07T00:00:00Z"),
        d(5, "production", "2026-05-01T00:00:00Z"),
      ])],
    ]);
    const out = await fetchDeployments("t", "o/r", "2026-06-01T00:00:00Z", new Set(["production|sha4|2026-06-07T00:00:00Z"]));
    expect(out.records.map((r) => [r.sha, r.production, r.succeededAt])).toEqual([
      ["sha1", true, "2026-06-10T00:05:00Z"],
      ["sha3", false, "2026-06-08T00:05:00Z"],
    ]);
  });

  it("reports forbidden deployment collection as unavailable", async () => {
    mockRoutes([[/deployments\?/, () => new Response("forbidden", { status: 403 })]]);
    await expect(fetchDeployments("t", "o/r", "2026-06-01T00:00:00Z")).resolves.toEqual({ records: [], failed: true });
  });

  it("returns successful records and marks failed deployment statuses unavailable", async () => {
    mockRoutes([
      [/deployments\/1\/statuses/, () => json([{ state: "success", created_at: "2026-06-10T00:05:00Z" }])],
      [/deployments\/2\/statuses/, () => json({ message: "forbidden" }, 403)],
      [/deployments\?/, () => json([
        { id: 1, environment: "production", ref: "main", sha: "one", created_at: "2026-06-10T00:00:00Z" },
        { id: 2, environment: "production", ref: "main", sha: "two", created_at: "2026-06-10T00:01:00Z" },
      ])],
    ]);
    const out = await fetchDeployments("t", "o/r", "2026-06-01T00:00:00Z");
    expect(out.records.map((record) => record.sha)).toEqual(["one"]);
    expect(out.failed).toBe(true);
  });
});
