// Mon–Fri website work weeks shared by the index page, week pages and the sitemap.
// Grouping rules (weekend attribution, holidays, cutoffs) live in collector/work-calendar.ts.

import {
  buildWorkCalendar,
  describeWeekendAttribution,
  isWeekendDate,
  type CalendarReport,
  type WorkCalendar,
  type WorkGroup,
} from "../collector/work-calendar.js";

export type { WorkCalendar, WorkGroup } from "../collector/work-calendar.js";

const DAILY_PATH = /^(\d{4})\/(\d{2})\/(\d{2})$/;

/** YYYY-MM-DD for a daily report path (YYYY/MM/DD), otherwise undefined. */
export const dailyPathToDate = (path: string): string | undefined => {
  const m = DAILY_PATH.exec(path);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
};

/** Site-relative directory of a week page, e.g. "weeks/2026-10-05/". */
export const weekPagePath = (weekId: string): string => `weeks/${weekId}/`;

/**
 * Month (YYYY-MM) a week is listed under: where its last available weekday report falls
 * (nominal end when it has none), never after the latest report.
 */
export const weekMonthKey = (
  week: Pick<WorkGroup, "to" | "lastReport">,
  latestReportDate: string,
): string => {
  const end = week.lastReport ?? week.to;
  return (latestReportDate && end > latestReportDate ? latestReportDate : end).slice(0, 7);
};

/** A week is open while its nominal end (Friday, or Sunday for a weekend entry) is after the latest report. */
export const isWeekOpen = (week: Pick<WorkGroup, "to">, latestReportDate: string): boolean =>
  week.to > latestReportDate;

/** Last date a group can hold: its nominal end or a later attributed weekend day. */
export const groupEndDate = (group: WorkGroup): string =>
  [group.to, ...group.weekends.flatMap((w) => w.activeDates)].sort().at(-1)!;

/** One sentence per attributed weekend, so readers can see where weekend effort went. */
export const weekendNotes = (group: WorkGroup): string[] => group.weekends.map(describeWeekendAttribution);

/** True for Saturday and Sunday report dates (listed under the week they are attributed to). */
export const isWeekendReport = (date: string): boolean => isWeekendDate(date);

/** Calendar from report entries' stored hours (fallback when allocations are unavailable). */
export const calendarFromReports = (reports: Iterable<CalendarReport>, cutoff?: string): WorkCalendar =>
  buildWorkCalendar(reports, cutoff ? { cutoff } : {});
