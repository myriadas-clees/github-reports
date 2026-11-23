import { describe, it, expect } from "vitest";
import {
  calendarFromReports,
  dailyPathToDate,
  groupEndDate,
  isWeekOpen,
  weekendNotes,
  weekMonthKey,
  weekPagePath,
} from "./work-weeks.js";

const cal = (dates: [string, number][]) => calendarFromReports(dates.map(([date, hours]) => ({ date, hours })));

describe("website work weeks (Mon-Fri)", () => {
  it("lists a week under the month of its last available weekday report", () => {
    // Mon Sep 28 .. Fri Oct 2.
    expect(weekMonthKey(cal([["2026-09-29", 1], ["2026-09-30", 1]]).group("2026-09-28"), "2026-10-20")).toBe("2026-09");
    expect(weekMonthKey(cal([["2026-09-29", 1], ["2026-10-01", 1]]).group("2026-09-28"), "2026-10-20")).toBe("2026-10");
    // No reports: the nominal Friday decides.
    expect(weekMonthKey(cal([]).group("2026-09-28"), "2026-10-20")).toBe("2026-10");
    expect(weekMonthKey(cal([["2026-12-31", 1]]).group("2026-12-28"), "2027-10-20")).toBe("2026-12");
  });

  it("keeps an in-progress week open until its Friday and lists it no later than the latest report", () => {
    const week = cal([["2026-10-29", 1], ["2026-10-30", 1]]).group("2026-10-26"); // Oct 26-30
    expect(isWeekOpen(week, "2026-10-29")).toBe(true);
    expect(isWeekOpen(week, "2026-10-30")).toBe(false);
    const open = calendarFromReports([{ date: "2026-10-29", hours: 1 }], "2026-10-29").group("2026-10-26");
    expect(weekMonthKey({ to: "2026-11-02" }, "2026-10-30")).toBe("2026-10");
    expect(weekMonthKey(open, "2026-10-29")).toBe("2026-10");
  });

  it("extends a week's end to attributed weekend days and explains the attribution", () => {
    const c = cal([["2026-10-09", 2], ["2026-10-11", 4], ["2026-10-12", 5]]);
    const week = c.group("2026-10-05");
    expect(groupEndDate(week)).toBe("2026-10-11");
    expect(groupEndDate(c.group("2026-10-12"))).toBe("2026-10-16");
    expect(weekendNotes(week)).toEqual([
      "Sun, Oct 11 counted with Friday Oct 9: lower modeled effort than the following Monday (2h vs 5h).",
    ]);
  });

  it("builds Monday page paths and parses daily paths", () => {
    expect(weekPagePath("2026-10-05")).toBe("weeks/2026-10-05/");
    expect(dailyPathToDate("2026/10/01")).toBe("2026-10-01");
    expect(dailyPathToDate("2026/W14")).toBeUndefined();
  });
});
