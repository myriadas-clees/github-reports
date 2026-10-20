import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectPrRefsFromData, emptyLedger, mergeDeployments, pruneDeployments, needsRefresh,
  readEvidenceLedger, writeEvidenceLedger, EVIDENCE_FILE,
} from "./evidence-ledger.js";
import type { DeploymentRecord, PrEvidence } from "../types.js";

let dir = "";
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = ""; });

const now = new Date("2026-06-20T00:00:00Z");
const pr = (over: Partial<PrEvidence> = {}): PrEvidence => ({
  url: "u", repository: "o/r", number: 1, author: "a", state: "merged", isDraft: false,
  baseRef: "main", headRef: "x", headSha: "s", mergeCommitSha: "m",
  createdAt: "2026-05-01T00:00:00Z", mergedAt: "2026-05-02T00:00:00Z",
  reviews: [], checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: ["ci"] },
  files: [], fetchedAt: "2026-05-03T00:00:00Z", ...over,
});
const dep = (n: number, over: Partial<DeploymentRecord> = {}): DeploymentRecord => ({
  environment: "production", production: true, ref: "main", sha: `s${n}`,
  createdAt: new Date(Date.UTC(2026, 5, 1, 0, n)).toISOString(), succeededAt: "x", ...over,
});

describe("ledger io", () => {
  it("returns null for missing or invalid files and round-trips", async () => {
    dir = await mkdtemp(join(tmpdir(), "ev-"));
    expect(await readEvidenceLedger(dir)).toBeNull();
    await writeFile(join(dir, EVIDENCE_FILE), "- not a map", "utf-8");
    expect(await readEvidenceLedger(dir)).toBeNull();
    const l = emptyLedger();
    l.prs["u"] = pr({ release: { stage: "live", environment: "production", sha: "s1", since: "2026-05-03T00:00:00Z" } });
    await writeEvidenceLedger(dir, l);
    expect((await readEvidenceLedger(dir))?.prs["u"]).toMatchObject({ number: 1, release: { stage: "live", environment: "production", sha: "s1", since: "2026-05-03T00:00:00Z" } });
  });
});

describe("needsRefresh", () => {
  it("refreshes missing, open, unchecked and pending", () => {
    expect(needsRefresh(undefined, now)).toBe(true);
    expect(needsRefresh(pr({ state: "open" }), now)).toBe(true);
    expect(needsRefresh(pr({ checks: null }), now)).toBe(true);
    expect(needsRefresh(pr({ checks: { passed: 0, failed: 0, skipped: 0, pending: 1, names: [] } }), now)).toBe(true);
  });
  it("settles old merged PRs but re-checks recent stale ones", () => {
    expect(needsRefresh(pr(), now)).toBe(false);
    const recent = pr({ mergedAt: "2026-06-15T00:00:00Z", fetchedAt: "2026-06-16T00:00:00Z" });
    expect(needsRefresh(recent, now)).toBe(true);
    expect(needsRefresh({ ...recent, fetchedAt: "2026-06-19T12:00:00Z" }, now)).toBe(false);
  });
  it("refreshes merged PRs when commit statuses were unavailable", () => {
    expect(needsRefresh(pr({ checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: [], statusesUnavailable: true } }), now)).toBe(true);
  });
});

describe("mergeDeployments", () => {
  it("dedupes and sorts newest first without pruning fetched rows", () => {
    const merged = mergeDeployments([dep(1), dep(2)], [dep(2), dep(3)]);
    expect(merged.map((d) => d.sha)).toEqual(["s3", "s2", "s1"]);
    const many = Array.from({ length: 350 }, (_, i) => dep(i));
    expect(mergeDeployments([], many)).toHaveLength(350);
    const ledger = emptyLedger();
    ledger.deployments.repo = many;
    pruneDeployments(ledger);
    expect(ledger.deployments.repo).toHaveLength(300);
    expect(ledger.deployments.repo[0]?.sha).toBe("s349");
  });
  it("prunes scanned deployment keys outside the cutoff margin", () => {
    const ledger = emptyLedger();
    ledger.scannedDeployments = { repo: [
      "prod|recent|2026-06-10T00:00:00Z", "prod|margin|2026-05-27T00:00:00Z", "prod|old|2026-05-01T00:00:00Z",
    ] };
    pruneDeployments(ledger, "2026-06-01T00:00:00Z");
    expect(ledger.scannedDeployments.repo).toEqual(["prod|recent|2026-06-10T00:00:00Z", "prod|margin|2026-05-27T00:00:00Z"]);
  });
});

describe("collectPrRefsFromData", () => {
  it("gathers unique PR urls and honours since", async () => {
    dir = await mkdtemp(join(tmpdir(), "ev-"));
    const write = async (rel: string, body: string) => {
      await mkdir(join(dir, rel), { recursive: true });
      await writeFile(join(dir, rel, "github-data.yaml"), body, "utf-8");
    };
    await write("2026/06/01", "pullRequests:\n  - url: https://github.com/o/r/pull/1\n");
    await write("2026/06/10", "pullRequests:\n  - url: https://github.com/o/r/pull/1\nprsInProgress:\n  - url: https://github.com/o/r/pull/2\n");
    expect((await collectPrRefsFromData(dir)).map((r) => r.number)).toEqual([1, 2]);
    const since = await collectPrRefsFromData(dir, "2026-06-05");
    expect(since).toEqual([{ repo: "o/r", number: 1, url: "https://github.com/o/r/pull/1" }, { repo: "o/r", number: 2, url: "https://github.com/o/r/pull/2" }]);
    expect(await collectPrRefsFromData(dir, "2026-06-11")).toEqual([]);
  });

  it("applies since to weekly archives using their stored dateRange", async () => {
    dir = await mkdtemp(join(tmpdir(), "ev-"));
    const write = async (rel: string, body: string) => {
      await mkdir(join(dir, rel), { recursive: true });
      await writeFile(join(dir, rel, "github-data.yaml"), body, "utf-8");
    };
    await write("2026/W20", "dateRange:\n  from: 2026-05-14\n  to: 2026-05-20\npullRequests:\n  - url: https://github.com/o/r/pull/1\n");
    await write("2026/W24", "dateRange:\n  from: 2026-06-11\n  to: 2026-06-17T23:59:59Z\npullRequests:\n  - url: https://github.com/o/r/pull/2\n");
    await write("2026/W25", "pullRequests:\n  - url: https://github.com/o/r/pull/3\n");
    expect((await collectPrRefsFromData(dir, "2026-06-01")).map((r) => r.number)).toEqual([2]);
    expect((await collectPrRefsFromData(dir)).map((r) => r.number)).toEqual([1, 2, 3]);
  });
});
