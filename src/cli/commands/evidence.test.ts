import { describe, expect, it } from "vitest";
import { applyDeploymentFetch, evidenceRepositories, selectDeploymentCandidates } from "./evidence.js";
import { emptyLedger } from "../../collector/evidence-ledger.js";
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

it("preserves deployments and marks failed refreshes unavailable", () => {
  const ledger = emptyLedger();
  const prior = { environment: "production", production: true, ref: "main", sha: "old", createdAt: "2026-01-01T00:00:00Z", succeededAt: "2026-01-01T00:01:00Z" };
  ledger.deployments["org/app"] = [prior];
  applyDeploymentFetch(ledger, "org/app", { records: [], failed: true }, "2026-10-19T00:00:00Z");
  expect(ledger.deployments["org/app"]).toEqual([prior]);
  expect(ledger.deploymentsUnavailable).toEqual({ "org/app": "2026-10-19T00:00:00Z" });
  applyDeploymentFetch(ledger, "org/app", { records: [], failed: false }, "2026-10-20T00:00:00Z");
  expect(ledger.deploymentsUnavailable).toEqual({});
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
  applyDeploymentFetch(ledger, "org/app", { records: [record], failed: true }, "2026-10-20T00:02:00Z");
  expect(ledger.deployments["org/app"]).toEqual([record]);
  expect(ledger.deploymentsUnavailable).toEqual({ "org/app": "2026-10-20T00:02:00Z" });
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
