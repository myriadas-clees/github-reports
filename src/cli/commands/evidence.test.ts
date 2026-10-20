import { describe, expect, it } from "vitest";
import { allLedgerRefs, applyDeploymentFetch, buildKnownDeploymentKeys, carryOverDerivedEvidence, deploymentCutoffIso, evidenceRepositories, findContainingDeployments, markDeploymentsUnavailable, recordReleaseEvidence, selectDeploymentCandidates } from "./evidence.js";
import { emptyLedger, pruneDeployments } from "../../collector/evidence-ledger.js";
import { evidenceArgs } from "./report.js";

describe("evidenceRepositories", () => {
  it("unions configured and activity repositories in stable order", () => {
    expect(evidenceRepositories(["org/configured", "org/shared"], [
      { repo: "org/activity", number: 1, url: "https://github.com/org/activity/pull/1" },
      { repo: "org/shared", number: 2, url: "https://github.com/org/shared/pull/2" },
      { repo: "org/other", number: 3, url: "https://github.com/org/other/pull/3" },
    ])).toEqual(["org/configured", "org/shared", "org/activity", "org/other"]);
  });

  it("discovers repositories when configuration is empty", () => {
    expect(evidenceRepositories([], [
      { repo: "org/activity", number: 1, url: "https://github.com/org/activity/pull/1" },
    ])).toEqual(["org/activity"]);
  });
});

describe("deploymentCutoffIso", () => {
  it("starts one UTC day before the local report date", () => {
    expect(deploymentCutoffIso("2026-10-10")).toBe("2026-10-09T00:00:00.000Z");
  });

  it("handles month and year boundaries", () => {
    expect(deploymentCutoffIso("2026-01-01")).toBe("2025-12-31T00:00:00.000Z");
  });
});

it("retries recent/legacy scans, skips old failures, and keeps recorded successes known", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const recentFailure = "prod|failed|2026-10-18T00:00:00Z";
  const oldFailure = "prod|failed-old|2026-10-10T00:00:00Z";
  const success = { environment: "prod", production: true, ref: "main", sha: "success", createdAt: "2026-10-18T00:00:00Z", succeededAt: "2026-10-18T01:00:00Z" };
  expect(buildKnownDeploymentKeys([success], { [recentFailure]: "failure", [oldFailure]: "failure", "prod|success|2026-10-18T00:00:00Z": "success" }, now)).toEqual(
    new Set(["prod|failed-old|2026-10-10T00:00:00Z", "prod|success|2026-10-18T00:00:00Z"]),
  );
  expect(buildKnownDeploymentKeys([], [oldFailure], now)).toEqual(new Set([oldFailure]));
  expect(buildKnownDeploymentKeys([], [recentFailure], now)).toEqual(new Set());
});

it("re-fetches an evicted success so its deployment record can be rebuilt", () => {
  const key = "prod|sha|2026-10-18T00:00:00Z";
  expect(buildKnownDeploymentKeys([], { [key]: "success" }, new Date("2026-10-20T00:00:00Z"))).not.toContain(key);
});

it("reserves a separate ancestry budget for preview deployments", async () => {
  const deployments = Array.from({ length: 6 }, (_, index) => ({
    environment: "production", production: true, ref: `v${index}`, sha: `${String(index + 1).repeat(40)}`,
    createdAt: `2026-10-${String(20 + index).padStart(2, "0")}T00:00:00Z`, succeededAt: "2026-10-30T00:01:00Z",
  }));
  deployments.push({
    environment: "preview", production: false, ref: "preview", sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    createdAt: "2026-10-30T00:00:00Z", succeededAt: "2026-10-30T00:01:00Z",
  });
  const checked: string[] = [];
  const result = await findContainingDeployments({
    deployments,
    pe: { baseRef: "main", mergeCommitSha: "fedcbafedcbafedcbafedcbafedcbafedcbafedc", mergedAt: "2026-10-19T00:00:00Z" },
    defaultBranch: "main", known: [],
    isContained: async (sha) => { checked.push(sha); return sha.startsWith("abcdef"); },
  });
  expect(result.calls).toEqual({ production: 5, nonProduction: 1 });
  expect(checked).toContain("abcdefabcdefabcdefabcdefabcdefabcdefabcd");
  expect(result.known).toEqual([{ environment: "preview", sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd" }]);
});

it("advances past persisted non-containing production candidates", async () => {
  const deployments = Array.from({ length: 8 }, (_, index) => ({
    environment: "production", production: true, ref: `v${index}`, sha: `${String(index + 1).repeat(40)}`,
    createdAt: `2026-10-${String(20 + index).padStart(2, "0")}T00:00:00Z`, succeededAt: "2026-10-30T00:01:00Z",
  }));
  const pe = { baseRef: "main", mergeCommitSha: "fedcbafedcbafedcbafedcbafedcbafedcbafedc", mergedAt: "2026-10-19T00:00:00Z" };
  const check = async (sha: string) => sha === deployments[7]!.sha;
  const first = await findContainingDeployments({ deployments, pe, defaultBranch: "main", known: [], isContained: check });
  expect(first.calls.production).toBe(5);
  expect(first.nonContainingShas).toHaveLength(5);
  const second = await findContainingDeployments({ deployments, pe, defaultBranch: "main", known: first.known, nonContainingShas: first.nonContainingShas, isContained: check });
  expect(second.calls.production).toBe(3);
  expect(second.known).toEqual([{ environment: "production", sha: deployments[7]!.sha }]);
});

it("leaves unknown ancestry unchecked and reports it", async () => {
  const deployment = { environment: "production", production: true, ref: "v1", sha: "abcdef1234567", createdAt: "2026-10-20T00:00:00Z", succeededAt: "2026-10-20T00:01:00Z" };
  const result = await findContainingDeployments({
    deployments: [deployment], pe: { baseRef: "main", mergeCommitSha: "fedcbafedcbafedcbafedcbafedcbafedcbafedc", mergedAt: "2026-10-19T00:00:00Z" },
    defaultBranch: "main", known: [], isContained: async () => null,
  });
  expect(result.nonContainingShas).toEqual([]);
  expect(result.known).toEqual([]);
  expect(result.unknownKinds.production).toBe(true);
});

it("advances to new candidates before retrying unknown SHAs", async () => {
  const deployments = Array.from({ length: 6 }, (_, i) => ({ environment: "production", production: true, ref: `v${i}`, sha: `${i + 1}`.repeat(40), createdAt: `2026-10-${String(20 + i).padStart(2, "0")}T00:00:00Z`, succeededAt: "2026-10-30T00:01:00Z" }));
  const pe = { baseRef: "main", mergeCommitSha: "f".repeat(40), mergedAt: "2026-10-19T00:00:00Z" };
  const first = await findContainingDeployments({ deployments, pe, defaultBranch: "main", known: [], isContained: async () => null });
  expect(first.unknownShas).toHaveLength(5);
  let checked = "";
  const second = await findContainingDeployments({ deployments, pe, defaultBranch: "main", known: [], unknownShas: first.unknownShas, isContained: async (sha) => { checked = sha; return sha === deployments[5]!.sha; } });
  expect(checked).toBe(deployments[5]!.sha);
  expect(second.known).toEqual([{ environment: "production", sha: deployments[5]!.sha }]);
});

it("rotates null candidates in persisted least-recently-tried order", async () => {
  const deployments = Array.from({ length: 7 }, (_, i) => ({ environment: "production", production: true, ref: `v${i}`, sha: `${i + 1}`.repeat(40), createdAt: `2026-10-${String(20 + i).padStart(2, "0")}T00:00:00Z`, succeededAt: "2026-10-30T00:01:00Z" }));
  const pe = { baseRef: "main", mergeCommitSha: "f".repeat(40), mergedAt: "2026-10-19T00:00:00Z" };
  let queue: string[] = [];
  const orders: string[][] = [];
  let result: Awaited<ReturnType<typeof findContainingDeployments>> | undefined;
  for (let run = 0; run < 5; run++) {
    const checked: string[] = [];
    result = await findContainingDeployments({ deployments, pe, defaultBranch: "main", known: [], unknownShas: queue, isContained: async (sha) => { checked.push(sha); return run === 4 && sha === deployments[6]!.sha ? true : null; } });
    orders.push(checked);
    queue = result.unknownShas;
  }
  expect(orders).toEqual([
    deployments.slice(0, 5).map((d) => d.sha),
    deployments.slice(5, 7).map((d) => d.sha).concat(deployments.slice(0, 3).map((d) => d.sha)),
    deployments.slice(3, 7).map((d) => d.sha).concat(deployments.slice(0, 1).map((d) => d.sha)),
    deployments.slice(1, 6).map((d) => d.sha),
    [deployments[6]!.sha],
  ]);
  expect(result?.known).toEqual([{ environment: "production", sha: deployments[6]!.sha }]);
});

it("preserves deployments and marks failed refreshes unavailable", () => {
  const ledger = emptyLedger();
  const prior = { environment: "production", production: true, ref: "main", sha: "old", createdAt: "2026-01-01T00:00:00Z", succeededAt: "2026-01-01T00:01:00Z" };
  ledger.deployments["org/app"] = [prior];
  applyDeploymentFetch(ledger, "org/app", { records: [], scannedKeys: [], failed: true }, "2026-10-19T00:00:00Z");
  expect(ledger.deployments["org/app"]).toEqual([prior]);
  expect(ledger.deploymentsUnavailable).toEqual({ "org/app": "2026-10-19T00:00:00Z" });
  applyDeploymentFetch(ledger, "org/app", { records: [], scannedKeys: [], failed: false }, "2026-10-20T00:00:00Z");
  expect(ledger.deploymentsUnavailable).toEqual({});
});

it("records scan outcomes so an evicted success can be re-fetched", () => {
  const ledger = emptyLedger();
  const record = { environment: "production", production: true, ref: "main", sha: "s1", createdAt: "2026-10-10T00:00:00Z", succeededAt: "2026-10-10T00:01:00Z" };
  applyDeploymentFetch(ledger, "org/app", { records: [record], scannedKeys: ["production|s1|2026-10-10T00:00:00Z"], failed: false }, "2026-10-20T00:00:00Z");
  ledger.deployments["org/app"] = [];
  expect(ledger.scannedDeployments?.["org/app"]).toEqual({ "production|s1|2026-10-10T00:00:00Z": "success" });
});

it("marks a thrown deployment refresh unavailable without clearing deployments", () => {
  const ledger = emptyLedger();
  ledger.deployments["org/app"] = [{ environment: "production", production: true, ref: "main", sha: "old", createdAt: "2026-01-01T00:00:00Z", succeededAt: "2026-01-01T00:01:00Z" }];
  markDeploymentsUnavailable(ledger, "org/app", "2026-10-19T00:00:00Z");
  expect(ledger.deploymentsUnavailable).toEqual({ "org/app": "2026-10-19T00:00:00Z" });
  expect(ledger.deployments["org/app"]).toHaveLength(1);
});

it("selects tag deployments by commit sha while excluding already matched branch refs", () => {
  const common = { environment: "production", production: true, createdAt: "2026-10-20T00:00:00Z", succeededAt: "2026-10-20T00:01:00Z" };
  const candidates = selectDeploymentCandidates([
    { ...common, ref: "v1.2.0", sha: "abcdef1234567890" },
    { ...common, ref: "main", sha: "1234567890abcdef" },
  ], true, { baseRef: "release", mergeCommitSha: "fedcba9876543210", mergedAt: "2026-10-19T00:00:00Z" }, "main");
  expect(candidates.map((d) => d.ref)).toEqual(["v1.2.0"]);
});

it("merges partial deployment results and marks the repository unavailable", () => {
  const ledger = emptyLedger();
  const record = { environment: "production", production: true, ref: "v1.2.0", sha: "abcdef1234567890", createdAt: "2026-10-20T00:00:00Z", succeededAt: "2026-10-20T00:01:00Z" };
  applyDeploymentFetch(ledger, "org/app", { records: [record], scannedKeys: ["production|abcdef1234567890|2026-10-20T00:00:00Z"], failed: true }, "2026-10-20T00:02:00Z");
  expect(ledger.deployments["org/app"]).toEqual([record]);
  expect(ledger.deploymentsUnavailable).toEqual({ "org/app": "2026-10-20T00:02:00Z" });
});

it("records a live release once and preserves it after deployment eviction", () => {
  const ledger = emptyLedger();
  const url = "https://github.com/org/app/pull/1";
  ledger.prs[url] = {
    url, repository: "org/app", number: 1, author: "a", state: "merged", isDraft: false,
    baseRef: "main", headRef: "feature", headSha: "head", mergeCommitSha: "merge",
    createdAt: "2026-01-01T00:00:00Z", mergedAt: "2026-01-02T00:00:00Z", reviews: [], checks: null, files: [], fetchedAt: "2026-01-03T00:00:00Z",
  };
  const deployment = { environment: "production", production: true, ref: "main", sha: "deploy-sha", createdAt: "2026-01-03T00:00:00Z", succeededAt: "2026-01-03T01:00:00Z" };
  ledger.deployments["org/app"] = [deployment];
  const refs = [{ repo: "org/app", number: 1, url }];
  recordReleaseEvidence(ledger, refs);
  expect(ledger.prs[url]?.release).toEqual({ stage: "live", environment: "production", sha: "deploy-sha", since: deployment.succeededAt });
  ledger.deployments["org/app"] = [];
  recordReleaseEvidence(ledger, refs);
  expect(ledger.prs[url]?.release).toEqual({ stage: "live", environment: "production", sha: "deploy-sha", since: deployment.succeededAt });
});

it("records release history before pruning its only matching old deployment", () => {
  const ledger = emptyLedger();
  const url = "https://github.com/org/app/pull/9";
  ledger.prs[url] = {
    url, repository: "org/app", number: 9, author: "a", state: "merged", isDraft: false,
    baseRef: "main", headRef: "feature", headSha: "head", mergeCommitSha: "merge",
    createdAt: "2026-01-01T00:00:00Z", mergedAt: "2026-01-02T00:00:00Z", reviews: [], checks: null, files: [], fetchedAt: "2026-01-03T00:00:00Z",
  };
  const old = { environment: "production", production: true, ref: "main", sha: "old-match", createdAt: "2026-01-03T00:00:00Z", succeededAt: "2026-01-03T01:00:00Z" };
  ledger.deployments["org/app"] = [old, ...Array.from({ length: 300 }, (_, i) => ({ ...old, sha: `new-${i}`, createdAt: new Date(Date.UTC(2026, 1, i + 1)).toISOString() }))];
  const refs = [{ repo: "org/app", number: 9, url }];
  recordReleaseEvidence(ledger, refs);
  pruneDeployments(ledger, "2026-10-19T00:00:00Z");
  expect(ledger.prs[url]?.release).toEqual({ stage: "live", environment: "production", sha: "old-match", since: old.succeededAt });
  expect(ledger.deployments["org/app"]).not.toContainEqual(old);
});

it("upgrades stored preview release evidence when production is found", () => {
  const ledger = emptyLedger();
  const url = "https://github.com/org/app/pull/2";
  ledger.prs[url] = {
    url, repository: "org/app", number: 2, author: "a", state: "merged", isDraft: false,
    baseRef: "main", headRef: "feature", headSha: "head", mergeCommitSha: "merge",
    createdAt: "2026-01-01T00:00:00Z", mergedAt: "2026-01-02T00:00:00Z", reviews: [], checks: null, files: [], fetchedAt: "2026-01-03T00:00:00Z",
    release: { stage: "preview", environment: "preview", sha: "old", since: "2026-01-03T01:00:00Z" },
  };
  ledger.deployments["org/app"] = [{ environment: "production", production: true, ref: "main", sha: "new", createdAt: "2026-01-04T00:00:00Z", succeededAt: "2026-01-04T01:00:00Z" }];
  recordReleaseEvidence(ledger, [{ repo: "org/app", number: 2, url }]);
  expect(ledger.prs[url]?.release).toEqual({ stage: "live", environment: "production", sha: "new", since: "2026-01-04T01:00:00Z" });
});

describe("report evidence step args", () => {
  const reportOpts = {
    token: "secret", config: "cfg.yml", dataDir: "data", date: "2026-10-10",
    username: "u", outputDir: "out", timezone: "America/New_York", theme: "brutalist",
    language: "en", baseUrl: "https://x", siteTitle: "W", llmProvider: "openai", llmApiKey: "k", llmModel: "m",
  };

  it("forwards only evidence's options and applies the report date as since", () => {
    expect(evidenceArgs(reportOpts))
      .toEqual(["evidence", "--config", "cfg.yml", "--data-dir", "data", "--token", "secret", "--since", "2026-10-10"]);
    expect(evidenceArgs({})).toEqual(["evidence"]);
  });

  it("emits only flags the evidence command actually registers", async () => {
    const { Command } = await import("commander");
    const { registerEvidence } = await import("./evidence.js");
    const program = new Command();
    registerEvidence(program);
    const known = new Set(program.commands.find((c) => c.name() === "evidence")!.options.map((o) => o.long));
    const flags = evidenceArgs(reportOpts).filter((a) => a.startsWith("--"));
    expect(flags.filter((f) => !known.has(f))).toEqual([]);
  });
});

describe("carryOverDerivedEvidence", () => {
  it("keeps release history and ancestry results across a PR evidence refresh", () => {
    const base = {
      url: "https://github.com/o/r/pull/1", repository: "o/r", number: 1, author: "me", state: "merged" as const,
      isDraft: false, baseRef: "main", headRef: "f", headSha: "h", mergeCommitSha: "m",
      createdAt: "2026-01-01T00:00:00Z", mergedAt: "2026-01-02T00:00:00Z", reviews: [], checks: null, files: [],
      fetchedAt: "2026-01-03T00:00:00Z",
    };
    const prior = {
      ...base,
      release: { stage: "live" as const, environment: "production", sha: "s", since: "2026-01-02T10:00:00Z" },
      containingDeployments: [{ environment: "production", sha: "s" }],
      nonContainingDeploymentShas: ["x"],
      ancestryUnknown: true,
    };
    const out = carryOverDerivedEvidence({ ...base, fetchedAt: "2026-02-01T00:00:00Z" }, prior);
    expect(out).toMatchObject({
      fetchedAt: "2026-02-01T00:00:00Z", release: prior.release, containingDeployments: prior.containingDeployments,
      nonContainingDeploymentShas: ["x"], ancestryUnknown: true,
    });
    expect(carryOverDerivedEvidence(base, undefined)).not.toHaveProperty("release");
  });
});

describe("release history before age-based pruning", () => {
  it("records releases for PRs outside the current window before their deployments are pruned", () => {
    const ledger = emptyLedger();
    const url = "https://github.com/org/app/pull/7";
    ledger.defaultBranches["org/app"] = "main";
    ledger.prs[url] = {
      url, repository: "org/app", number: 7, author: "me", state: "merged", isDraft: false,
      baseRef: "main", headRef: "f", headSha: "h", mergeCommitSha: "m",
      createdAt: "2026-06-01T00:00:00Z", mergedAt: "2026-06-02T00:00:00Z",
      reviews: [], checks: null, files: [], fetchedAt: "2026-06-03T00:00:00Z",
    };
    ledger.deployments["org/app"] = [{
      environment: "production", production: true, ref: "main", sha: "s",
      createdAt: "2026-06-02T01:00:00Z", succeededAt: "2026-06-02T02:00:00Z",
    }];
    // The run's --since window starts long after this PR, so it isn't among this run's refs.
    recordReleaseEvidence(ledger, allLedgerRefs(ledger));
    pruneDeployments(ledger, "2026-10-01T00:00:00.000Z");
    expect(ledger.deployments["org/app"]).toEqual([]);
    expect(ledger.prs[url]!.release).toMatchObject({ stage: "live", since: "2026-06-02T02:00:00Z" });
  });
});
