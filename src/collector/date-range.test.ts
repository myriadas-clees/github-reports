import { describe, it, expect } from "vitest";
import { buildWeeklyRange, buildYesterdayRange, toISODate, parseLocalDate } from "./date-range.js";

// Helper: verify the range covers exactly 7 calendar days.
// In non-DST zones this is 7 * 86400000 - 1 ms.
// Across DST transitions it may be +/- 1 hour.
const expectSevenCalendarDays = (
  from: Date,
  to: Date,
  tz: string,
): void => {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const fromParts = fmt.format(from).split("-").map(Number);
  const toParts = fmt.format(to).split("-").map(Number);
  const fromD = new Date(Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]));
  const toD = new Date(Date.UTC(toParts[0], toParts[1] - 1, toParts[2]));
  const calendarDays = (toD.getTime() - fromD.getTime()) / 86_400_000;
  expect(calendarDays).toBe(6); // 6-day difference = 7 calendar days inclusive
};

describe("buildWeeklyRange", () => {
  it("returns previous Thu–Wed range when run on Thursday (UTC)", () => {
    // Thursday 2026-04-02 → previous week Thu Mar 26 – Wed Apr 1
    const now = new Date("2026-04-02T12:00:00Z");
    const range = buildWeeklyRange(now);
    expect(toISODate(range.from)).toBe("2026-03-26");
    expect(toISODate(range.to)).toBe("2026-04-01");
  });

  it("returns previous Thu–Wed when run mid-week (Friday)", () => {
    const now = new Date("2026-04-03T12:00:00Z");
    const range = buildWeeklyRange(now);
    expect(toISODate(range.from)).toBe("2026-03-26");
    expect(toISODate(range.to)).toBe("2026-04-01");
  });

  it("on Wednesday reports the prior completed week (not the in-progress one)", () => {
    // Wednesday 2026-04-01 → previous completed Wed is Mar 25 → Thu Mar 19 – Wed Mar 25
    const now = new Date("2026-04-01T12:00:00Z");
    const range = buildWeeklyRange(now);
    expect(toISODate(range.from)).toBe("2026-03-19");
    expect(toISODate(range.to)).toBe("2026-03-25");
  });

  it("sets from to Thursday midnight and to to Wednesday end-of-day in UTC", () => {
    const now = new Date("2026-04-02T15:30:00Z");
    const range = buildWeeklyRange(now);
    expect(range.from.getUTCHours()).toBe(0);
    expect(range.from.getUTCMinutes()).toBe(0);
    expect(range.to.getUTCHours()).toBe(23);
    expect(range.to.getUTCMinutes()).toBe(59);
    expect(range.to.getUTCSeconds()).toBe(59);
    expect(range.to.getUTCMilliseconds()).toBe(999);
  });

  it("range spans exactly 7 calendar days in UTC", () => {
    const range = buildWeeklyRange(new Date("2026-04-02T12:00:00Z"));
    expectSevenCalendarDays(range.from, range.to, "UTC");
  });

  describe("Asia/Tokyo (+9)", () => {
    it("computes Thu–Wed range in JST", () => {
      // Thursday 2026-04-02 12:00 JST = 2026-04-02 03:00 UTC
      const now = new Date("2026-04-02T03:00:00Z");
      const range = buildWeeklyRange(now, "Asia/Tokyo");
      expect(toISODate(range.from, "Asia/Tokyo")).toBe("2026-03-26");
      expect(toISODate(range.to, "Asia/Tokyo")).toBe("2026-04-01");
    });
  });

  describe("America/New_York", () => {
    it("computes Thu–Wed range in EDT", () => {
      const now = new Date("2026-04-02T16:00:00Z"); // Thu noon EDT
      const range = buildWeeklyRange(now, "America/New_York");
      expect(toISODate(range.from, "America/New_York")).toBe("2026-03-26");
      expect(toISODate(range.to, "America/New_York")).toBe("2026-04-01");
    });
  });

  describe("year boundary", () => {
    it("range can span year boundary", () => {
      // Thursday 2026-01-01 → previous Thu Dec 25 – Wed Dec 31 2025
      const now = new Date("2026-01-01T12:00:00Z");
      const range = buildWeeklyRange(now);
      expect(toISODate(range.from)).toBe("2025-12-25");
      expect(toISODate(range.to)).toBe("2025-12-31");
    });
  });
});


// -------------------------------------------------------------------
// buildYesterdayRange
// -------------------------------------------------------------------

describe("buildYesterdayRange", () => {
  it("returns yesterday's full day range (UTC)", () => {
    // Today is 2026-04-04 -> yesterday is Apr 3
    const now = new Date("2026-04-04T00:05:00Z");
    const range = buildYesterdayRange(now);

    expect(toISODate(range.from)).toBe("2026-04-03");
    expect(toISODate(range.to)).toBe("2026-04-03");
  });

  it("from is midnight, to is end of day", () => {
    const now = new Date("2026-04-04T00:05:00Z");
    const range = buildYesterdayRange(now);

    expect(range.from.getUTCHours()).toBe(0);
    expect(range.from.getUTCMinutes()).toBe(0);
    expect(range.to.getUTCHours()).toBe(23);
    expect(range.to.getUTCMinutes()).toBe(59);
    expect(range.to.getUTCSeconds()).toBe(59);
    expect(range.to.getUTCMilliseconds()).toBe(999);
  });

  it("Monday midnight: yesterday is Sunday (critical for week boundary)", () => {
    // Today is Mon Apr 6 (W15) -> yesterday is Sun Apr 5 (W14)
    const now = new Date("2026-04-06T00:00:00Z");
    const range = buildYesterdayRange(now);

    expect(toISODate(range.from)).toBe("2026-04-05");
    expect(toISODate(range.to)).toBe("2026-04-05");
  });

  it("respects Asia/Tokyo timezone", () => {
    // Midnight JST Apr 6 = 2026-04-05T15:00:00Z
    // Yesterday in JST = Apr 5
    const now = new Date("2026-04-05T15:00:00Z");
    const range = buildYesterdayRange(now, "Asia/Tokyo");

    expect(toISODate(range.from, "Asia/Tokyo")).toBe("2026-04-05");
    expect(toISODate(range.to, "Asia/Tokyo")).toBe("2026-04-05");
  });

  it("respects America/New_York timezone", () => {
    // Midnight EDT Apr 6 = 2026-04-06T04:00:00Z
    // Yesterday in EDT = Apr 5
    const now = new Date("2026-04-06T04:00:00Z");
    const range = buildYesterdayRange(now, "America/New_York");

    expect(toISODate(range.from, "America/New_York")).toBe("2026-04-05");
    expect(toISODate(range.to, "America/New_York")).toBe("2026-04-05");
  });

  it("year boundary: Jan 1 -> yesterday is Dec 31", () => {
    const now = new Date("2026-01-01T00:05:00Z");
    const range = buildYesterdayRange(now);

    expect(toISODate(range.from)).toBe("2025-12-31");
    expect(toISODate(range.to)).toBe("2025-12-31");
  });

  it("month boundary: Mar 1 -> yesterday is Feb 28 (non-leap)", () => {
    const now = new Date("2026-03-01T00:05:00Z");
    const range = buildYesterdayRange(now);

    expect(toISODate(range.from)).toBe("2026-02-28");
    expect(toISODate(range.to)).toBe("2026-02-28");
  });
});

// -------------------------------------------------------------------
// toISODate
// -------------------------------------------------------------------

describe("toISODate", () => {
  it("formats a date as YYYY-MM-DD in UTC", () => {
    const date = new Date("2026-04-03T12:00:00Z");
    expect(toISODate(date)).toBe("2026-04-03");
  });

  it("formats a date as YYYY-MM-DD in Asia/Tokyo", () => {
    const date = new Date("2026-04-03T23:00:00Z");
    expect(toISODate(date, "Asia/Tokyo")).toBe("2026-04-04");
  });

  it("same instant shows different dates in different timezones", () => {
    const date = new Date("2026-04-04T00:30:00Z");
    expect(toISODate(date, "Pacific/Auckland")).toBe("2026-04-04");
    expect(toISODate(date, "Pacific/Honolulu")).toBe("2026-04-03");
  });

  it("handles half-hour offset (Asia/Kolkata)", () => {
    // 2026-04-03 23:00 UTC = 2026-04-04 04:30 IST
    const date = new Date("2026-04-03T23:00:00Z");
    expect(toISODate(date, "Asia/Kolkata")).toBe("2026-04-04");
  });
});

describe("parseLocalDate", () => {
  it("returns noon in the given timezone (UTC)", () => {
    const result = parseLocalDate("2026-04-16", "UTC");
    expect(result.toISOString()).toBe("2026-04-16T12:00:00.000Z");
  });

  it("returns noon in Asia/Tokyo (UTC+9)", () => {
    const result = parseLocalDate("2026-04-16", "Asia/Tokyo");
    // Tokyo noon = UTC 03:00
    expect(result.toISOString()).toBe("2026-04-16T03:00:00.000Z");
  });

  it("returns noon in America/New_York (UTC-4 in April / EDT)", () => {
    const result = parseLocalDate("2026-04-16", "America/New_York");
    // NYC noon = UTC 16:00
    expect(result.toISOString()).toBe("2026-04-16T16:00:00.000Z");
  });

  it("resolves to the correct local date in UTC+14 (Pacific/Kiritimati)", () => {
    const result = parseLocalDate("2026-04-16", "Pacific/Kiritimati");
    // Kiritimati noon = UTC 22:00 on Apr 15
    expect(toISODate(result, "Pacific/Kiritimati")).toBe("2026-04-16");
  });

  it("resolves to the correct local date in UTC-12 (Etc/GMT+12)", () => {
    const result = parseLocalDate("2026-04-16", "Etc/GMT+12");
    // UTC-12 noon = UTC 00:00 on Apr 17
    expect(toISODate(result, "Etc/GMT+12")).toBe("2026-04-16");
  });

  it("handles year boundary (2025-12-31 in Asia/Tokyo)", () => {
    const result = parseLocalDate("2025-12-31", "Asia/Tokyo");
    expect(toISODate(result, "Asia/Tokyo")).toBe("2025-12-31");
  });

  it("handles year boundary (2026-01-01 in America/New_York)", () => {
    const result = parseLocalDate("2026-01-01", "America/New_York");
    expect(toISODate(result, "America/New_York")).toBe("2026-01-01");
  });

  it("handles half-hour offset (Asia/Kolkata)", () => {
    const result = parseLocalDate("2026-04-16", "Asia/Kolkata");
    // Kolkata noon (UTC+5:30) = UTC 06:30
    expect(result.toISOString()).toBe("2026-04-16T06:30:00.000Z");
  });

  it("throws on invalid format", () => {
    expect(() => parseLocalDate("abc", "UTC")).toThrow("Invalid date format");
    expect(() => parseLocalDate("2026-13-01", "UTC")).not.toThrow(); // valid format, invalid date handled by midnightInTz
    expect(() => parseLocalDate("2026/04/16", "UTC")).toThrow("Invalid date format");
  });

  // Asia/Beirut springs forward at 00:00 on the last Sunday of March (in 2026,
  // March 29). The local clock jumps from 23:59 EET directly to 01:00 EEST,
  // so "midnight March 29" never exists in Beirut local time. The midnight
  // resolver must fall back to the closest valid local instant — exercising
  // the DST correction branch in midnightInTz.
  it("resolves DST-skipped midnight in Asia/Beirut (last Sunday of March)", () => {
    const result = parseLocalDate("2026-03-29", "Asia/Beirut");
    // The local date in Beirut should still read 2026-03-29.
    expect(toISODate(result, "Asia/Beirut")).toBe("2026-03-29");
  });

  // Pacific/Norfolk follows Australian DST: clocks fall back at 03:00 NFDT
  // (UTC+12) on the first Sunday of April (April 5 in 2026), becoming
  // 02:00 NFT (UTC+11). The first guess for midnight is computed against the
  // post-DST offset, but the actual midnight instant lies before the
  // transition, so the resolver must subtract the residual local hour to
  // hit true midnight — exercising the "subtract remainMs" recovery branch
  // in midnightInTz.
  it("resolves midnight on Pacific/Norfolk DST-end day via remainMs subtraction", () => {
    const result = parseLocalDate("2026-04-05", "Pacific/Norfolk");
    expect(toISODate(result, "Pacific/Norfolk")).toBe("2026-04-05");
  });

  // America/Havana springs forward at 00:00 local on the second Sunday of
  // March (2026-03-08). Local 00:00 never exists that day, so neither the
  // remainMs subtraction (lands on Mar 7) nor the 24h-remainMs addition
  // (lands on Mar 9) can recover midnight — the resolver falls through to
  // the brute-force search, exercising the false branch of the adjusted2
  // check in midnightInTz.
  it("falls through to brute-force search on America/Havana DST-skipped midnight", () => {
    const result = parseLocalDate("2026-03-08", "America/Havana");
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(false);
  });
});
