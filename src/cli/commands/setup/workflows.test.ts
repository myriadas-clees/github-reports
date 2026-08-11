import { describe, it, expect } from "vitest";
import { buildReadme, midnightCronUTC, weeklyCronUTC } from "./workflows.js";

describe("midnightCronUTC", () => {
  it("runs after midnight in UTC", () => {
    expect(midnightCronUTC("UTC")).toBe("0 1 * * 1-5");
  });

  it("uses the standard-time offset for southern-hemisphere DST", () => {
    // 15:00 UTC is 01:00 AEST and 02:00 AEDT, never 23:00 the prior day.
    expect(midnightCronUTC("Australia/Sydney")).toBe("0 15 * * 0-4");
  });

  it("keeps positive-offset weekdays aligned to the preceding UTC day", () => {
    expect(midnightCronUTC("Asia/Tokyo")).toBe("0 16 * * 0-4");
  });
});

describe("weeklyCronUTC", () => {
  // day-of-week: 0=Sunday … 4=Thursday
  // Weekly report runs Thursday morning after the daily fetch.

  it("returns Thursday (4) for UTC", () => {
    expect(weeklyCronUTC("UTC")).toBe("0 2 * * 4");
  });

  it("returns Wednesday (3) for Asia/Tokyo (UTC+9)", () => {
    expect(weeklyCronUTC("Asia/Tokyo")).toBe("0 17 * * 3");
  });

  it("returns Thursday (4) for America/New_York (UTC-5)", () => {
    expect(weeklyCronUTC("America/New_York")).toBe("0 7 * * 4");
  });

  it("returns Thursday (4) for America/Los_Angeles (UTC-8)", () => {
    expect(weeklyCronUTC("America/Los_Angeles")).toBe("0 10 * * 4");
  });

  it("returns Wednesday (3) for Asia/Shanghai (UTC+8)", () => {
    expect(weeklyCronUTC("Asia/Shanghai")).toBe("0 18 * * 3");
  });

  it("returns Thursday (4) for Europe/Berlin (UTC+1, standard time)", () => {
    expect(weeklyCronUTC("Europe/Berlin")).toBe("0 1 * * 4");
  });

  it("returns Wednesday (3) for Pacific/Auckland (UTC+13)", () => {
    expect(weeklyCronUTC("Pacific/Auckland")).toBe("0 14 * * 3");
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
    expect(readme).toContain("[github-reports](https://github.com/myriadas-clees/github-reports)");
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
