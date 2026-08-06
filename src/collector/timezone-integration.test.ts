// Integration tests: timezone-aware Thu–Wed ranges + event filtering

import { describe, it, expect } from "vitest";
import { buildWeeklyRange, toISODate } from "./date-range.js";
import { isInRange } from "./fetch-events.js";

describe("isInRange with timezone-aware ranges", () => {
  // Friday Apr 3 → previous Thu–Wed = Mar 26 – Apr 1
  const friday = new Date("2026-04-03T12:00:00Z");

  it("event exactly at range.from is included", () => {
    const range = buildWeeklyRange(friday, "UTC");
    expect(isInRange(range.from.toISOString(), range)).toBe(true);
  });

  it("event exactly at range.to is included", () => {
    const range = buildWeeklyRange(friday, "UTC");
    expect(isInRange(range.to.toISOString(), range)).toBe(true);
  });

  it("event 1ms before range.from is excluded", () => {
    const range = buildWeeklyRange(friday, "UTC");
    const before = new Date(range.from.getTime() - 1).toISOString();
    expect(isInRange(before, range)).toBe(false);
  });

  it("event 1ms after range.to is excluded", () => {
    const range = buildWeeklyRange(friday, "UTC");
    const after = new Date(range.to.getTime() + 1).toISOString();
    expect(isInRange(after, range)).toBe(false);
  });

  describe("JST range filters UTC events correctly", () => {
    // Thu Apr 2 12:00 JST → prev Thu Mar 26 – Wed Apr 1 JST
    // Mar 26 00:00 JST = Mar 25 15:00 UTC
    // Apr 1 23:59:59.999 JST = Apr 1 14:59:59.999 UTC
    const range = buildWeeklyRange(new Date("2026-04-02T03:00:00Z"), "Asia/Tokyo");

    it("event at Mar 25 15:00:00Z (= Mar 26 00:00 JST) is included", () => {
      expect(isInRange("2026-03-25T15:00:00Z", range)).toBe(true);
    });

    it("event at Mar 25 14:59:59Z is excluded", () => {
      expect(isInRange("2026-03-25T14:59:59Z", range)).toBe(false);
    });

    it("event at Apr 1 14:59:59Z (= Apr 1 23:59 JST) is included", () => {
      expect(isInRange("2026-04-01T14:59:59Z", range)).toBe(true);
    });

    it("event at Apr 1 15:00:00Z (= Apr 2 00:00 JST) is excluded", () => {
      expect(isInRange("2026-04-01T15:00:00Z", range)).toBe(false);
    });
  });
});

describe("toISODate output for weekly range", () => {
  it("UTC Thursday run reports Mar 26 – Apr 1", () => {
    const range = buildWeeklyRange(new Date("2026-04-02T12:00:00Z"), "UTC");
    expect(toISODate(range.from, "UTC")).toBe("2026-03-26");
    expect(toISODate(range.to, "UTC")).toBe("2026-04-01");
  });

  it("same calendar window in America/New_York", () => {
    const range = buildWeeklyRange(new Date("2026-04-02T16:00:00Z"), "America/New_York");
    expect(toISODate(range.from, "America/New_York")).toBe("2026-03-26");
    expect(toISODate(range.to, "America/New_York")).toBe("2026-04-01");
  });
});
