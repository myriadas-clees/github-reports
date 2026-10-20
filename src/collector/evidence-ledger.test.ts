import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, readdir, writeFile, rm } from "node:fs/promises";
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
  it("returns null for missing files and round-trips", async () => {
    dir = await mkdtemp(join(tmpdir(), "ev-"));
    expect(await readEvidenceLedger(dir)).toBeNull();
    const l = emptyLedger();
    l.prs["u"] = pr({ release: { stage: "live", environment: "production", sha: "s1", since: "2026-05-03T00:00:00Z" } });
    await writeEvidenceLedger(dir, l);
    expect((await readEvidenceLedger(dir))?.prs["u"]).toMatchObject({ number: 1, release: { stage: "live", environment: "production", sha: "s1", since: "2026-05-03T00:00:00Z" } });
    expect(await readdir(dir)).toEqual([EVIDENCE_FILE]);
  });

  it.each(["", " \n\t "]) ("throws for an existing empty ledger", async (content) => {
    dir = await mkdtemp(join(tmpdir(), "ev-"));
    const path = join(dir, EVIDENCE_FILE);
    await writeFile(path, content, "utf-8");
    await expect(readEvidenceLedger(dir)).rejects.toThrow(/evidence ledger .* is empty/i);
    await expect(readEvidenceLedger(dir)).rejects.toThrow(path);
  });

  it("throws with the ledger path for malformed YAML and non-object content", async () => {
    dir = await mkdtemp(join(tmpdir(), "ev-"));
    const path = join(dir, EVIDENCE_FILE);
    await writeFile(path, "invalid: [yaml", "utf-8");
    await expect(readEvidenceLedger(dir)).rejects.toThrow(path);
    await writeFile(path, "- not a map", "utf-8");
    await expect(readEvidenceLedger(dir)).rejects.toThrow(path);
  });
});

describe("needsRefresh", () => {
  it("refreshes missing, open, unchecked and pending", () => {
    expect(needsRefresh(undefined, now)).toBe(true);
    expect(needsRefresh(pr({ state: "open" }), now)).toBe(true);
    expect(needsRefresh(pr({ checks: null }), now)).toBe(true);
    expect(needsRefresh(pr({ checks: { passed: 0, failed: 0, skipped: 0, pending: 1, names: [] } }), now)).toBe(true);
  });
  it("retries after a failed evidence refresh", () => {
    expect(needsRefresh(pr({ refreshFailedAt: "2026-10-19T00:00:00Z" }), now)).toBe(true);
  });
  it("refreshes PRs whose reviews or files were only partially fetched", () => {
    expect(needsRefresh(pr({ incomplete: { reviews: true } }), now)).toBe(true);
    expect(needsRefresh(pr({ incomplete: { files: true } }), now)).toBe(true);
  });
  it("settles old merged PRs but re-checks recent stale ones", () => {
    expect(needsRefresh(pr(), now)).toBe(false);
    const recent = pr({ mergedAt: "2026-06-15T00:00:00Z", fetchedAt: "2026-06-16T00:00:00Z" });
    expect(needsRefresh(recent, now)).toBe(true);
    expect(needsRefresh({ ...recent, fetchedAt: "2026-06-19T12:00:00Z" }, now)).toBe(false);
  });
  it("refreshes merged PRs when commit statuses were unavailable", () => {
    expect(needsRefresh(pr({ checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: [], statusesUnavailable: true } }), now)).toBe(true);
    expect(needsRefresh(pr({ checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: [], checkRunsUnavailable: true } }), now)).toBe(true);
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
    expect(ledger.deployments.repo).toHaveLength(350);
  });
  it("keeps deployment records and successful cache keys consistent while pruning by age", () => {
    const ledger = emptyLedger();
    const recent = dep(1, { sha: "recent", createdAt: "2026-06-10T00:00:00Z" });
    ledger.deployments.repo = [recent, dep(2, { sha: "old", createdAt: "2026-05-01T00:00:00Z" })];
    ledger.scannedDeployments = { repo: {
      "production|recent|2026-06-10T00:00:00Z": "success",
      "production|old|2026-05-01T00:00:00Z": "success",
      "production|failed|2026-06-10T00:00:00Z": "failure",
    } };
    pruneDeployments(ledger, "2026-06-01T00:00:00Z");
    expect(ledger.deployments.repo).toEqual([recent]);
    expect(ledger.scannedDeployments.repo).toEqual({
      "production|recent|2026-06-10T00:00:00Z": "success",
      "production|failed|2026-06-10T00:00:00Z": "failure",
    });
  });
  it("loads legacy scanned key arrays as unknown outcomes", async () => {
    dir = await mkdtemp(join(tmpdir(), "ev-"));
    await writeFile(join(dir, EVIDENCE_FILE), "version: '1.0'\nupdatedAt: now\ndefaultBranches: {}\ndeployments: {}\nscannedDeployments:\n  repo:\n    - prod|sha|2026-06-01T00:00:00Z\nprs: {}\n", "utf-8");
    expect((await readEvidenceLedger(dir))?.scannedDeployments?.repo).toEqual({ "prod|sha|2026-06-01T00:00:00Z": "unknown" });
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

  it("collects PRs present only in prsWorkedOnClosed from daily and weekly files", async () => {
    dir = await mkdtemp(join(tmpdir(), "ev-"));
    const write = async (rel: string, body: string) => {
      await mkdir(join(dir, rel), { recursive: true });
      await writeFile(join(dir, rel, "github-data.yaml"), body, "utf-8");
    };
    await write("2026/06/10", "prsWorkedOnClosed:\n  - url: https://github.com/o/r/pull/7\n");
    await write("2026/W24", "dateRange:\n  to: 2026-06-17\nprsWorkedOnClosed:\n  - url: https://github.com/o/r/pull/8\n");
    expect((await collectPrRefsFromData(dir)).map((r) => r.number)).toEqual([7, 8]);
  });
});
