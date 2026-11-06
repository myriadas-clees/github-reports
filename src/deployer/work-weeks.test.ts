import { describe, it, expect } from "vitest";
import { dailyPathToDate, isWeekOpen, weekMonthKey, weekPagePath, workWeekOf } from "./work-weeks.js";

describe("work weeks (Thu-Wed)", () => {
  it("maps any date to its Thursday-Wednesday week", () => {
    for (const date of ["2026-10-01", "2026-10-03", "2026-10-07"]) {
      expect(workWeekOf(date)).toEqual({ id: "2026-10-01", from: "2026-10-01", to: "2026-10-07", label: "Oct 1-7" });
    }
    expect(workWeekOf("2026-10-08").id).toBe("2026-10-08");
  });

  it("spans months and years", () => {
    expect(workWeekOf("2026-09-30")).toMatchObject({ id: "2026-09-24", to: "2026-09-30" });
    expect(workWeekOf("2026-12-31")).toMatchObject({ id: "2026-12-31", to: "2027-01-06" });
  });

  it("assigns a week to the month of its Wednesday", () => {
    // Thu Sep 24 .. Wed Sep 30 -> September; Thu Sep 30 .. Wed Oct 6 -> October.
    expect(weekMonthKey(workWeekOf("2026-09-26"), "2026-10-20")).toBe("2026-09");
    expect(weekMonthKey(workWeekOf("2026-09-30"), "2026-10-20")).toBe("2026-09");
    expect(weekMonthKey(workWeekOf("2026-10-01"), "2026-10-20")).toBe("2026-10");
    expect(weekMonthKey(workWeekOf("2026-12-31"), "2027-10-20")).toBe("2027-01");
  });

  it("assigns an in-progress week to the month of the latest report", () => {
    const spanning = workWeekOf("2026-10-29"); // Oct 29 - Nov 4
    expect(weekMonthKey(spanning, "2026-10-30")).toBe("2026-10");
    expect(isWeekOpen(spanning, "2026-10-30")).toBe(true);
    expect(weekMonthKey(spanning, "2026-11-04")).toBe("2026-11");
    expect(isWeekOpen(spanning, "2026-11-04")).toBe(false);
  });

  it("builds page paths and parses daily paths", () => {
    expect(weekPagePath("2026-10-01")).toBe("weeks/2026-10-01/");
    expect(dailyPathToDate("2026/10/01")).toBe("2026-10-01");
    expect(dailyPathToDate("2026/W14")).toBeUndefined();
  });
});
