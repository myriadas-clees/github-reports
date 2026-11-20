// Thu–Wed work-week grouping shared by the index page, week pages and the sitemap.

import { weekEnd, weekStart } from "../collector/allocation.js";
import { formatShortWeekTitle } from "../collector/stakeholder-summary.js";

const DAILY_PATH = /^(\d{4})\/(\d{2})\/(\d{2})$/;

/** YYYY-MM-DD for a daily report path (YYYY/MM/DD), otherwise undefined. */
export const dailyPathToDate = (path: string): string | undefined => {
  const m = DAILY_PATH.exec(path);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
};

export type WorkWeekSpan = {
  /** The Thursday, YYYY-MM-DD (also the page id). */
  id: string;
  from: string;
  /** The Wednesday. */
  to: string;
  /** "Oct 1-7". */
  label: string;
};

export const workWeekOf = (date: string): WorkWeekSpan => {
  const from = weekStart(date);
  const to = weekEnd(from);
  return { id: from, from, to, label: formatShortWeekTitle(from, to) };
};

/** Site-relative directory of a week page, e.g. "weeks/2026-10-01/". */
export const weekPagePath = (weekId: string): string => `weeks/${weekId}/`;

/**
 * Month (YYYY-MM) a week is listed under: where its Wednesday falls, or, for a week
 * still running after the latest report, the month of that latest report.
 */
export const weekMonthKey = (week: Pick<WorkWeekSpan, "to">, latestReportDate: string): string =>
  (week.to > latestReportDate ? latestReportDate : week.to).slice(0, 7);

/** A week is open while its Wednesday is after the latest report date. */
export const isWeekOpen = (week: Pick<WorkWeekSpan, "to">, latestReportDate: string): boolean =>
  week.to > latestReportDate;
