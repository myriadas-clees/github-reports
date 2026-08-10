import { describe, expect, it, vi, afterEach } from "vitest";
import { getDayId, getPreviousDayId, resolveDayId } from "./day.js";
import { parseLocalDate } from "../collector/date-range.js";

describe("daily report archive IDs", () => {
  afterEach(() => vi.useRealTimers());

  it("uses YYYY/MM/DD paths for an explicit report day", () => {
    const date = parseLocalDate("2026-04-01", "America/New_York");
    expect(getDayId(date, "America/New_York")).toEqual({
      date: "2026-04-01",
      year: 2026,
      month: 4,
      day: 1,
      path: "2026/04/01",
    });
  });

  it("selects the previous completed local workday by default", () => {
    const now = new Date("2026-04-02T05:30:00.000Z"); // 01:30 in New York
    expect(getPreviousDayId(now, "America/New_York").date).toBe("2026-04-01");
  });

  it("reports Friday on Monday", () => {
    const monday = new Date("2026-04-06T13:00:00.000Z"); // Monday morning in New York
    expect(getPreviousDayId(monday, "America/New_York").date).toBe("2026-04-03");
  });

  it("treats --date as the exact report date", () => {
    const explicit = parseLocalDate("2026-04-01", "Asia/Tokyo");
    expect(resolveDayId(explicit, "Asia/Tokyo").path).toBe("2026/04/01");
  });
});
