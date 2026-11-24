// Website work weeks: Monday–Friday, with each weekend attributed to exactly one place.
//
// - A week is identified by its Monday (a stable page id) and nominally spans Mon–Fri.
// - Its label uses the first and last *available* weekday reports, so holidays and gaps
//   shrink the displayed range instead of inventing days.
// - A weekend (Sat + Sun) joins the adjacent Friday or Monday whose own modeled manual
//   effort (that day's report, before any weekend additions) is lower; ties go to Friday.
//   When only one of those two reports exists (the other day may be a holiday), it joins
//   that one. When neither exists it stays an explicit weekend entry (id = the Saturday).
// - Reports keep their original dates; the attribution is exposed, never hidden, and every
//   date maps to exactly one group, so effort is neither duplicated nor dropped.
// - `cutoff` ignores reports and activity after a date, so a historical view never depends
//   on a later report (e.g. a Saturday page cannot know Monday's effort).
//
// This is the website calendar only. Legacy weekly archives (YYYY/Wxx, Thu–Wed) keep their
// own contract in deployer/week.ts and allocation.ts weekStart/weekEnd.

import { formatShortWeekTitle } from "./stakeholder-summary.js";

const DAY_MS = 86_400_000;
const EPSILON = 1e-6;

const parseUtc = (date: string): number => {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const formatUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** YYYY-MM-DD shifted by whole days. */
export const addDays = (date: string, days: number): string => formatUtc(parseUtc(date) + days * DAY_MS);

/** 0 = Sunday … 6 = Saturday. */
const weekday = (date: string): number => new Date(parseUtc(date)).getUTCDay();

export const isWeekendDate = (date: string): boolean => {
  const dow = weekday(date);
  return dow === 0 || dow === 6;
};

/** Monday of the Mon–Sun calendar week containing `date`. */
export const mondayOf = (date: string): string => addDays(date, -((weekday(date) + 6) % 7));

/** Saturday of the weekend containing a Saturday or Sunday. */
const saturdayOf = (date: string): string => (weekday(date) === 0 ? addDays(date, -1) : date.slice(0, 10));

export type CalendarReport = {
  /** YYYY-MM-DD of a daily report. */
  date: string;
  /** That day's modeled manual-effort hours (its own allocation total, no weekend additions). */
  hours: number;
};

export type WeekendTarget = "friday" | "monday" | "weekend";

export type WeekendReason = "lower-effort" | "tie" | "only-friday" | "only-monday" | "no-adjacent-report";

export type WeekendAttribution = {
  saturday: string;
  sunday: string;
  /** Group the weekend is counted in: a Monday id, or the Saturday for an explicit weekend entry. */
  groupId: string;
  target: WeekendTarget;
  reason: WeekendReason;
  friday: string;
  monday: string;
  fridayHours?: number;
  mondayHours?: number;
  /** Weekend dates with a report or self-reported time (oldest first). */
  activeDates: string[];
};

export type WorkGroupKind = "week" | "weekend";

export type WorkGroup = {
  /** Monday (week) or Saturday (explicit weekend entry), YYYY-MM-DD. Stable page id. */
  id: string;
  kind: WorkGroupKind;
  /** Nominal start: the Monday, or the Saturday. */
  from: string;
  /** Nominal end: the Friday, or the Sunday. */
  to: string;
  /** First available weekday report (weekend entries: first weekend report). */
  firstReport?: string;
  /** Last available weekday report (weekend entries: last weekend report). */
  lastReport?: string;
  /** "Oct 6-9" from the first/last available weekday reports; nominal Mon–Fri when none. */
  label: string;
  /** Every report date counted here, attributed weekend days included (oldest first). */
  reportDates: string[];
  /** Weekends with activity counted in this group. */
  weekends: WeekendAttribution[];
};

export type WorkCalendar = {
  cutoff?: string;
  /** Group a date's effort is counted in (weekends follow their attribution). */
  groupIdOf: (date: string) => string;
  /** Group by id; ids with no reports get their nominal span. */
  group: (id: string) => WorkGroup;
  /** Attribution for a Saturday/Sunday; undefined for weekdays. */
  weekendOf: (date: string) => WeekendAttribution | undefined;
  /** Groups holding a report or self-reported activity, oldest first. */
  groups: WorkGroup[];
};

export type WorkCalendarOptions = {
  /** Ignore reports and activity after this YYYY-MM-DD. */
  cutoff?: string;
  /** Dates with self-reported time (no report needed); lets weekend-only time get a home. */
  activityDates?: Iterable<string>;
};

const weekendLabel = (from: string, to: string): string => `${formatShortWeekTitle(from, to)} weekend`;

export const buildWorkCalendar = (
  reports: Iterable<CalendarReport>,
  options: WorkCalendarOptions = {},
): WorkCalendar => {
  const cutoff = options.cutoff?.slice(0, 10);
  const inScope = (date: string): boolean => !cutoff || date <= cutoff;
  const hours = new Map<string, number>();
  for (const report of reports) {
    const date = report.date.slice(0, 10);
    if (!inScope(date)) continue;
    const value = Number.isFinite(report.hours) ? Math.max(0, report.hours) : 0;
    hours.set(date, (hours.get(date) ?? 0) + value);
  }
  const activity = new Set<string>(hours.keys());
  for (const raw of options.activityDates ?? []) {
    const date = raw.slice(0, 10);
    if (inScope(date)) activity.add(date);
  }

  const attributionCache = new Map<string, WeekendAttribution>();
  const weekendOf = (date: string): WeekendAttribution | undefined => {
    if (!isWeekendDate(date)) return undefined;
    const saturday = saturdayOf(date);
    const cached = attributionCache.get(saturday);
    if (cached) return cached;
    const sunday = addDays(saturday, 1);
    const friday = addDays(saturday, -1);
    const monday = addDays(saturday, 2);
    const fridayHours = hours.get(friday);
    const mondayHours = hours.get(monday);
    let target: WeekendTarget;
    let reason: WeekendReason;
    if (fridayHours !== undefined && mondayHours !== undefined) {
      if (Math.abs(fridayHours - mondayHours) <= EPSILON) {
        target = "friday";
        reason = "tie";
      } else {
        target = fridayHours < mondayHours ? "friday" : "monday";
        reason = "lower-effort";
      }
    } else if (fridayHours !== undefined) {
      target = "friday";
      reason = "only-friday";
    } else if (mondayHours !== undefined) {
      target = "monday";
      reason = "only-monday";
    } else {
      target = "weekend";
      reason = "no-adjacent-report";
    }
    const attribution: WeekendAttribution = {
      saturday,
      sunday,
      groupId: target === "friday" ? mondayOf(friday) : target === "monday" ? monday : saturday,
      target,
      reason,
      friday,
      monday,
      ...(fridayHours !== undefined ? { fridayHours } : {}),
      ...(mondayHours !== undefined ? { mondayHours } : {}),
      activeDates: [saturday, sunday].filter((d) => activity.has(d)),
    };
    attributionCache.set(saturday, attribution);
    return attribution;
  };

  const groupIdOf = (date: string): string => {
    const d = date.slice(0, 10);
    return weekendOf(d)?.groupId ?? mondayOf(d);
  };

  const members = new Map<string, string[]>();
  for (const date of [...activity].sort()) {
    const id = groupIdOf(date);
    members.set(id, [...(members.get(id) ?? []), date]);
  }

  const groupCache = new Map<string, WorkGroup>();
  const group = (rawId: string): WorkGroup => {
    const id = rawId.slice(0, 10);
    const cached = groupCache.get(id);
    if (cached) return cached;
    const kind: WorkGroupKind = weekday(id) === 6 ? "weekend" : "week";
    const from = kind === "week" ? mondayOf(id) : id;
    const to = addDays(from, kind === "week" ? 4 : 1);
    const dates = members.get(id) ?? [];
    const reportDates = dates.filter((d) => hours.has(d));
    const labelDates = kind === "week" ? reportDates.filter((d) => !isWeekendDate(d)) : reportDates;
    const firstReport = labelDates[0];
    const lastReport = labelDates.at(-1);
    const label = kind === "week"
      ? formatShortWeekTitle(firstReport ?? from, lastReport ?? to)
      : weekendLabel(firstReport ?? from, lastReport ?? to);
    const saturdays = [...new Set(dates.filter(isWeekendDate).map(saturdayOf))].sort();
    const result: WorkGroup = {
      id,
      kind,
      from,
      to,
      ...(firstReport ? { firstReport } : {}),
      ...(lastReport ? { lastReport } : {}),
      label,
      reportDates,
      weekends: saturdays.map((s) => weekendOf(s)!),
    };
    groupCache.set(id, result);
    return result;
  };

  return {
    ...(cutoff ? { cutoff } : {}),
    groupIdOf,
    group,
    weekendOf,
    groups: [...members.keys()].sort().map(group),
  };
};

const DAY_NAME = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const dayName = (date: string): string => DAY_NAME.format(new Date(parseUtc(date)));
const monthDay = (date: string): string => MONTH_DAY.format(new Date(parseUtc(date)));
const hoursText = (h: number | undefined): string => `${Math.round((h ?? 0) * 10) / 10}h`;

/** Plain sentence explaining where a weekend's effort is counted. */
export const describeWeekendAttribution = (a: WeekendAttribution): string => {
  const days = a.activeDates.length > 0 ? a.activeDates : [a.saturday, a.sunday];
  const subject = days.map(dayName).join(" and ");
  switch (a.reason) {
    case "lower-effort":
      return a.target === "friday"
        ? `${subject} counted with Friday ${monthDay(a.friday)}: lower modeled effort than the following Monday (${hoursText(a.fridayHours)} vs ${hoursText(a.mondayHours)}).`
        : `${subject} counted with Monday ${monthDay(a.monday)}: lower modeled effort than the preceding Friday (${hoursText(a.mondayHours)} vs ${hoursText(a.fridayHours)}).`;
    case "tie":
      return `${subject} counted with Friday ${monthDay(a.friday)}: equal modeled effort with the following Monday (${hoursText(a.fridayHours)}); ties go to Friday.`;
    case "only-friday":
      return `${subject} counted with Friday ${monthDay(a.friday)}: no report for the following Monday.`;
    case "only-monday":
      return `${subject} counted with Monday ${monthDay(a.monday)}: no report for the preceding Friday.`;
    case "no-adjacent-report":
      return `${subject} shown as its own weekend entry: no report for the adjacent Friday or Monday.`;
  }
};
