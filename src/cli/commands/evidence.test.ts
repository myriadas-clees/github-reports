import { describe, expect, it } from "vitest";
import { evidenceRepositories } from "./evidence.js";
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
