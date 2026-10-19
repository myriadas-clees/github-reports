import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchDeployments, fetchPrEvidence, summarizeCheckRuns } from "./fetch-evidence.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const mockRoutes = (routes: Array<[RegExp, () => Response]>) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    for (const [re, fn] of routes) if (re.test(url)) return fn();
    return json({ message: "nf" }, 404);
  }));
};

afterEach(() => vi.unstubAllGlobals());

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
      [/commits\/abc\/status/, () => json({ statuses: [
        { context: "unit", state: "success", created_at: "2026-06-01T00:00:00Z" },
        { context: "deploy", state: "failure", created_at: "2026-06-01T00:01:00Z" },
        { context: "queue", state: "pending", created_at: "2026-06-01T00:02:00Z" },
      ] })], [/pulls\/5$/, () => json(pr)],
    ]);
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5 });
    expect(ev?.checks).toEqual({ passed: 1, failed: 1, skipped: 0, pending: 1, names: ["deploy", "queue", "unit"] });
  });

  it("merges status contexts while check runs win duplicate names", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ check_runs: [{ name: "same", status: "completed", conclusion: "success" }] })],
      [/commits\/abc\/status/, () => json({ statuses: [
        { context: "same", state: "failure", created_at: "2026-06-01T00:00:00Z" },
        { context: "legacy", state: "success", created_at: "2026-06-01T00:01:00Z" },
      ] })], [/pulls\/5$/, () => json(pr)],
    ]);
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5 });
    expect(ev?.checks).toEqual({ passed: 2, failed: 0, skipped: 0, pending: 0, names: ["legacy", "same"] });
  });

  it("uses check runs when the commit status endpoint returns 404", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ check_runs: [{ name: "ci", status: "completed", conclusion: "success" }] })],
      [/commits\/abc\/status/, () => json({ message: "nf" }, 404)], [/pulls\/5$/, () => json(pr)],
    ]);
    const ev = await fetchPrEvidence("t", { repo: "o/r", number: 5 });
    expect(ev?.checks).toEqual({ passed: 1, failed: 0, skipped: 0, pending: 0, names: ["ci"] });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/commits\/abc\/status$/), expect.anything());
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
      [/commits\/abc\/status/, () => json({ statuses: [] })], [/pulls\/5$/, () => json(pr)],
    ]);
    expect((await fetchPrEvidence("t", { repo: "o/r", number: 5 }))?.checks).toBeNull();
  });

  it("counts statuses when check-runs fail and preserves zero checks when statuses fail", async () => {
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ message: "no" }, 403)],
      [/commits\/abc\/status/, () => json({ statuses: [{ context: "ci", state: "success" }] })], [/pulls\/5$/, () => json(pr)],
    ]);
    expect((await fetchPrEvidence("t", { repo: "o/r", number: 5 }))?.checks?.passed).toBe(1);
    mockRoutes([
      [/pulls\/5\/reviews/, () => json([])], [/pulls\/5\/files/, () => json([])],
      [/check-runs/, () => json({ check_runs: [] })], [/commits\/abc\/status/, () => json({}, 404)], [/pulls\/5$/, () => json(pr)],
    ]);
    expect((await fetchPrEvidence("t", { repo: "o/r", number: 5 }))?.checks).toEqual({ passed: 0, failed: 0, skipped: 0, pending: 0, names: [] });
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
    expect(Object.fromEntries(out.map((r) => [r.sha, r.production]))).toEqual({ a: true, b: false, c: true });
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
    expect(out.map((r) => [r.sha, r.production, r.succeededAt])).toEqual([
      ["sha1", true, "2026-06-10T00:05:00Z"],
      ["sha3", false, "2026-06-08T00:05:00Z"],
    ]);
  });
});
