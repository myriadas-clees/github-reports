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
