import { describe, it, expect } from "vitest";
import { buildReadme, weeklyCronUTC } from "./workflows.js";

describe("weeklyCronUTC", () => {
  // day-of-week: 0=Sunday … 4=Thursday
  // Weekly report runs Thursday morning, 1h after daily midnight fetch.

  it("returns Thursday (4) for UTC", () => {
    expect(weeklyCronUTC("UTC")).toBe("0 1 * * 4");
  });

  it("returns Wednesday (3) for Asia/Tokyo (UTC+9)", () => {
    // daily: 0 15 * * *, weekly: Thu 01:00 JST = Wed 16:00 UTC
    expect(weeklyCronUTC("Asia/Tokyo")).toBe("0 16 * * 3");
  });

  it("returns Thursday (4) for America/New_York (UTC-5)", () => {
    // daily: 0 5 * * *, weekly: Thu 01:00 EST = Thu 06:00 UTC
    expect(weeklyCronUTC("America/New_York")).toBe("0 6 * * 4");
  });

  it("returns Thursday (4) for America/Los_Angeles (UTC-8)", () => {
    expect(weeklyCronUTC("America/Los_Angeles")).toBe("0 9 * * 4");
  });

  it("returns Wednesday (3) for Asia/Shanghai (UTC+8)", () => {
    // Thu 01:00 CST = Wed 17:00 UTC
    expect(weeklyCronUTC("Asia/Shanghai")).toBe("0 17 * * 3");
  });

  it("returns Thursday (4) for Europe/Berlin (UTC+1, standard time)", () => {
    expect(weeklyCronUTC("Europe/Berlin")).toBe("0 0 * * 4");
  });

  it("returns Wednesday (3) for Pacific/Auckland (UTC+13)", () => {
    // Thu 01:00 NZDT = Wed 12:00 UTC
    expect(weeklyCronUTC("Pacific/Auckland")).toBe("0 12 * * 3");
  });
});

describe("buildReadme", () => {
  const baseOpts = {
    siteTitle: "Dev Pulse",
    username: "testuser",
    repo: "testuser/weekly-report",
    pagesUrl: "https://testuser.github.io/weekly-report",
    language: "en" as const,
    timezone: "UTC",
    theme: "brutalist" as const,
  };

  it("includes site title as heading", () => {
    const readme = buildReadme(baseOpts);
    expect(readme).toMatch(/^# Dev Pulse/);
  });

  it("includes github-weekly-reporter link", () => {
    const readme = buildReadme(baseOpts);
    expect(readme).toContain("[github-weekly-reporter](https://github.com/deariary/github-weekly-reporter)");
  });

  it("includes pages URL", () => {
    const readme = buildReadme(baseOpts);
    expect(readme).toContain("https://testuser.github.io/weekly-report");
  });

  it("includes timezone in description", () => {
    const readme = buildReadme({ ...baseOpts, timezone: "Asia/Tokyo" });
    expect(readme).toContain("Asia/Tokyo");
  });

  it("includes language in configuration table", () => {
    const readme = buildReadme(baseOpts);
    expect(readme).toContain("| `en` |");
  });

  it("includes LLM provider when specified", () => {
    const readme = buildReadme({
      ...baseOpts,
      llmProvider: "openrouter",
      llmModel: "test-model",
    });
    expect(readme).toContain("openrouter");
    expect(readme).toContain("test-model");
  });
});
