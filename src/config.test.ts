import { describe, it, expect } from "vitest";
import { parseConfigObject, resolveConfig, assertNoSecretsInHtml, DEFAULT_CONFIG } from "./config.js";

describe("parseConfigObject", () => {
  it("maps snake_case YAML fields", () => {
    const partial = parseConfigObject({
      username: "bob",
      site_title: "Status",
      repositories: ["org/a", " org/b "],
      session_gap_minutes: 60,
      llm: { provider: "openai", model: "gpt-test" },
    });
    expect(partial.username).toBe("bob");
    expect(partial.siteTitle).toBe("Status");
    expect(partial.repositories).toEqual(["org/a", "org/b"]);
    expect(partial.sessionGapMinutes).toBe(60);
    expect(partial.llm?.provider).toBe("openai");
  });

  it("parses allocation with snake_case and camelCase keys", () => {
    const partial = parseConfigObject({
      allocation: {
        label_prefix: "team:",
        defaultInitiative: "Misc",
        trend_weeks: 4,
        initiatives: { "app: hub": " Hub ", "scope:ofac": "OFAC", bad: 42, "": "x", empty: "  " },
      },
    });
    expect(partial.allocation).toEqual({
      labelPrefix: "team:",
      defaultInitiative: "Misc",
      trendWeeks: 4,
      initiatives: { "app: hub": "Hub", "scope:ofac": "OFAC" },
    });
  });

  it("keeps allocation defaults for unset keys", () => {
    const partial = parseConfigObject({ allocation: { initiatives: { platform: "Platform" } } });
    expect(partial.allocation?.labelPrefix).toBe(DEFAULT_CONFIG.allocation.labelPrefix);
    expect(partial.allocation?.defaultInitiative).toBeNull();
    expect(partial.allocation?.trendWeeks).toBe(DEFAULT_CONFIG.allocation.trendWeeks);
  });

  it("clamps trend_weeks to 1..52", () => {
    expect(parseConfigObject({ allocation: { trend_weeks: 0 } }).allocation?.trendWeeks).toBe(1);
    expect(parseConfigObject({ allocation: { trend_weeks: 900 } }).allocation?.trendWeeks).toBe(52);
  });

  it("parses manual_time and drops invalid entries", () => {
    const partial = parseConfigObject({
      manual_time: [
        { date: "2026-10-07", initiative: "Hub", hours: 2, work_type: "unlogged", note: " Design review " },
        { date: "2026-10-08", initiative: "  Ops ", hours: 1.5, workType: "team-support" },
        { date: "10/07/2026", initiative: "Hub", hours: 1 },
        { date: "2026-10-07", initiative: "", hours: 1 },
        { date: "2026-10-07", initiative: "Hub", hours: 0 },
        { date: "2026-10-07", initiative: "Hub", hours: 25 },
        { date: "2026-10-07", initiative: "Hub", hours: "2" },
        { date: "2026-10-07", initiative: "Hub", hours: 1, work_type: "bogus" },
        null,
      ],
    });
    expect(partial.manualTime).toEqual([
      { date: "2026-10-07", initiative: "Hub", hours: 2, workType: "unlogged", note: "Design review" },
      { date: "2026-10-08", initiative: "Ops", hours: 1.5, workType: "team-support" },
      { date: "2026-10-07", initiative: "Hub", hours: 1 },
    ]);
  });

  it("converts Date-object dates (unquoted YAML dates) to YYYY-MM-DD", () => {
    const partial = parseConfigObject({
      manualTime: [{ date: new Date("2026-10-07T00:00:00Z") as unknown as string, initiative: "Hub", hours: 2 }],
    });
    expect(partial.manualTime).toEqual([{ date: "2026-10-07", initiative: "Hub", hours: 2 }]);
  });

  it("returns empty manualTime when absent or not a list", () => {
    expect(parseConfigObject({ username: "x" }).manualTime).toBeUndefined();
    expect(parseConfigObject({ manual_time: "nope" as unknown as [] }).manualTime).toEqual([]);
  });
});

describe("resolveConfig allocation and manual time", () => {
  it("defaults allocation and manualTime when file has none", () => {
    const cfg = resolveConfig({}, {});
    expect(cfg.allocation).toEqual({
      initiatives: {},
      labelPrefix: "app:",
      defaultInitiative: null,
      trendWeeks: 8,
    });
    expect(cfg.manualTime).toEqual([]);
    // Defaults must not be shared mutable state.
    expect(cfg.allocation.initiatives).not.toBe(DEFAULT_CONFIG.allocation.initiatives);
  });

  it("merges file allocation over defaults", () => {
    const cfg = resolveConfig(
      parseConfigObject({
        allocation: { label_prefix: "team:", initiatives: { "scope:ofac": "OFAC" } },
        manual_time: [{ date: "2026-10-07", initiative: "OFAC", hours: 1 }],
      }),
      {},
    );
    expect(cfg.allocation.labelPrefix).toBe("team:");
    expect(cfg.allocation.trendWeeks).toBe(8);
    expect(cfg.allocation.initiatives).toEqual({ "scope:ofac": "OFAC" });
    expect(cfg.manualTime).toEqual([{ date: "2026-10-07", initiative: "OFAC", hours: 1 }]);
  });
});

describe("resolveConfig", () => {
  it("merges defaults, file, and env-style cli overrides", () => {
    const prevUser = process.env.GITHUB_USERNAME;
    const prevTz = process.env.TIMEZONE;
    delete process.env.GITHUB_USERNAME;
    delete process.env.TIMEZONE;
    try {
      const cfg = resolveConfig(
        { username: "from-file", repositories: ["a/b"] },
        { timezone: "America/New_York", language: "en" },
      );
      expect(cfg.username).toBe("from-file");
      expect(cfg.timezone).toBe("America/New_York");
      expect(cfg.repositories).toEqual(["a/b"]);
      expect(cfg.theme).toBe(DEFAULT_CONFIG.theme);
    } finally {
      if (prevUser === undefined) delete process.env.GITHUB_USERNAME;
      else process.env.GITHUB_USERNAME = prevUser;
      if (prevTz === undefined) delete process.env.TIMEZONE;
      else process.env.TIMEZONE = prevTz;
    }
  });
});

describe("assertNoSecretsInHtml", () => {
  it("throws when a secret value would leak", () => {
    const prev = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_supersecrettoken99";
    try {
      expect(() => assertNoSecretsInHtml("<html>ghp_supersecrettoken99</html>")).toThrow(/secret/i);
      expect(() => assertNoSecretsInHtml("<html>safe</html>")).not.toThrow();
    } finally {
      if (prev === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prev;
    }
  });
});
