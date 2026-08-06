// Work-week identifiers: Thursday–Wednesday weeks, archived as YYYY/Wxx.
// Week number uses the ISO week number of the Thursday that starts the work week
// (ISO weeks are defined by their Thursday, so this stays stable).

import { localDateParts, currentWeekThursday, buildWeeklyRange } from "../collector/date-range.js";

export type WeekId = {
  year: number;
  week: number;
  path: string; // e.g. "2026/W14"
};

const getISOWeekNumber = (year: number, month: number, day: number): number => {
  const d = new Date(Date.UTC(year, month, day));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
};

const isoWeekYear = (year: number, month: number, day: number): number => {
  const d = new Date(Date.UTC(year, month, day));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
};

const weekIdFromThursday = (year: number, month: number, day: number): WeekId => {
  const week = getISOWeekNumber(year, month, day);
  const weekYear = isoWeekYear(year, month, day);
  const padded = String(week).padStart(2, "0");
  return { year: weekYear, week, path: `${weekYear}/W${padded}` };
};

/** Week ID for the previous completed Thu–Wed work week (what the report covers). */
export const getWeekId = (
  date: Date = new Date(),
  timezone: string = "UTC",
): WeekId => {
  const range = buildWeeklyRange(date, timezone);
  const { year, month, day } = localDateParts(range.from, timezone);
  return weekIdFromThursday(year, month, day);
};

/** Monday (00:00 UTC) of the given ISO week. Week 1 contains January 4. */
export const isoWeekToMonday = (year: number, week: number): Date => {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const w1Mon = new Date(jan4.getTime() - (dow - 1) * 86_400_000);
  return new Date(w1Mon.getTime() + (week - 1) * 7 * 86_400_000);
};

/** Current in-progress Thu–Wed work week (for daily-fetch storage). */
export const getCurrentWeekId = (
  date: Date = new Date(),
  timezone: string = "UTC",
): WeekId => {
  const thu = currentWeekThursday(date, timezone);
  return weekIdFromThursday(thu.year, thu.month, thu.day);
};
