import { buildPreviousWorkdayRange, localDateParts, toISODate } from "../collector/date-range.js";

export type DayId = {
  date: string;
  year: number;
  month: number;
  day: number;
  path: string;
};

const fromDate = (date: Date, timezone: string): DayId => {
  const { year, month, day } = localDateParts(date, timezone);
  const dateString = toISODate(date, timezone);
  return {
    date: dateString,
    year,
    month: month + 1,
    day,
    path: `${year}/${String(month + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
  };
};

/** Archive ID for an explicitly selected report day. */
export const getDayId = (date: Date, timezone: string = "UTC"): DayId =>
  fromDate(date, timezone);

/** Archive ID for the last completed local workday. */
export const getPreviousDayId = (
  now: Date = new Date(),
  timezone: string = "UTC",
): DayId => fromDate(buildPreviousWorkdayRange(now, timezone).from, timezone);

/** Explicit dates name that day; omitted dates select the previous workday. */
export const resolveDayId = (
  date: Date | undefined,
  timezone: string = "UTC",
): DayId => date ? getDayId(date, timezone) : getPreviousDayId(new Date(), timezone);
