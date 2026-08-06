import { describe, it, expect } from "vitest";
import { getWeekId, getCurrentWeekId, isoWeekToMonday } from "./week.js";

describe("getWeekId", () => {
  it("on Thursday returns the previous Thu–Wed week id", () => {
    // Thu 2026-04-02 → previous week starts Thu 2026-03-26 (ISO W13)
    const result = getWeekId(new Date("2026-04-02T12:00:00Z"));
    expect(result.path).toBe("2026/W13");
    expect(result.week).toBe(13);
  });

  it("on Friday still targets the week that ended Wednesday", () => {
    const result = getWeekId(new Date("2026-04-03T12:00:00Z"));
    expect(result.path).toBe("2026/W13");
  });

  it("pads single-digit week numbers", () => {
    const result = getWeekId(new Date("2026-02-05T12:00:00Z")); // Thursday
    expect(result.path).toMatch(/^\d{4}\/W\d{2}$/);
  });

  it("year boundary: first Thursday of 2026", () => {
    // Thu 2026-01-01 → previous week Thu 2025-12-25 (ISO week of Dec 25)
    const result = getWeekId(new Date("2026-01-01T12:00:00Z"));
    expect(result.year).toBe(2025);
    expect(result.path).toMatch(/^2025\/W\d{2}$/);
  });
});

describe("getCurrentWeekId", () => {
  it("on Thursday starts a new work week", () => {
    // Thu 2026-04-02 is the start of the week identified by that Thursday
    const result = getCurrentWeekId(new Date("2026-04-02T12:00:00Z"));
    expect(result.path).toBe("2026/W14");
  });

  it("on Wednesday is still the week that started last Thursday", () => {
    // Wed 2026-04-01 → current week started Thu 2026-03-26 → W13
    const result = getCurrentWeekId(new Date("2026-04-01T12:00:00Z"));
    expect(result.path).toBe("2026/W13");
  });
});

describe("isoWeekToMonday", () => {
  it("returns Monday of ISO week 1", () => {
    const monday = isoWeekToMonday(2026, 1);
    expect(monday.toISOString().startsWith("2025-12-29")).toBe(true);
  });
});
