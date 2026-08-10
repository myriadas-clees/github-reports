// Compute work-week date ranges (Thursday–Wednesday), timezone-aware

export type DateRange = {
  from: Date;
  to: Date;
};

// Resolve the local date components (year, month, day) in the given timezone.
export const localDateParts = (
  now: Date,
  tz: string,
): { year: number; month: number; day: number } => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formats as YYYY-MM-DD
  const [year, month, day] = fmt.format(now).split("-").map(Number);
  return { year, month: month - 1, day };
};

// Get the local hour and minute at a given UTC instant in the given timezone.
const localTimeParts = (
  utcInstant: Date,
  tz: string,
): { hour: number; minute: number; day: number; month: number } => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const parts = dtf.formatToParts(utcInstant);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? 0),
    day: Number(parts.find((p) => p.type === "day")?.value ?? 0),
    month: Number(parts.find((p) => p.type === "month")?.value ?? 0),
  };
};

// Find the UTC instant that corresponds to midnight (00:00:00) of the given
// local date in `tz`. Uses an iterative approach to handle DST correctly.
const midnightInTz = (
  year: number,
  month: number,
  day: number,
  tz: string,
): Date => {
  // Start with UTC midnight of that calendar date as initial guess
  const rough = new Date(Date.UTC(year, month, day));

  // See what local time our guess corresponds to
  const local = localTimeParts(rough, tz);
  const localOffsetMs = (local.hour * 60 + local.minute) * 60_000;

  let candidate: Date;
  if (local.day === day && local.month === month + 1) {
    // Same day: subtract local time to reach midnight
    candidate = new Date(rough.getTime() - localOffsetMs);
  } else if (local.day > day || local.month > month + 1) {
    // Local date ahead (positive offset, e.g. JST +9)
    candidate = new Date(rough.getTime() - localOffsetMs);
  } else {
    // Local date behind (negative offset, e.g. EST -5)
    candidate = new Date(rough.getTime() + (24 * 60 * 60_000 - localOffsetMs));
  }

  // Verify: the candidate should be midnight of the target date.
  // If DST shifted the offset, the candidate might be off by an hour.
  const check = localTimeParts(candidate, tz);
  if (check.day === day && check.month === month + 1 && check.hour === 0 && check.minute === 0) {
    return candidate;
  }

  // Correction: adjust by the remaining local time at the candidate
  const remainMs = (check.hour * 60 + check.minute) * 60_000;
  if (remainMs > 0) {
    // If local time is ahead of midnight, subtract
    const adjusted = new Date(candidate.getTime() - remainMs);
    const recheck = localTimeParts(adjusted, tz);
    if (recheck.day === day && recheck.month === month + 1) {
      return adjusted;
    }
    // If subtracting went to previous day, try adding (24h - remain)
    const adjusted2 = new Date(candidate.getTime() + (24 * 60 * 60_000 - remainMs));
    const recheck2 = localTimeParts(adjusted2, tz);
    if (recheck2.day === day && recheck2.month === month + 1) {
      return adjusted2;
    }
  }

  // Fallback: brute-force search in 30-minute increments around the rough guess
  for (let offsetH = -14; offsetH <= 14; offsetH += 0.5) {
    const probe = new Date(rough.getTime() - offsetH * 3_600_000);
    const p = localTimeParts(probe, tz);
    if (p.day === day && p.month === month + 1 && p.hour === 0 && p.minute === 0) {
      return probe;
    }
  }

  return candidate;
};

// Parse a "YYYY-MM-DD" string as a date in the given timezone.
// Returns the UTC instant corresponding to noon of that local date,
// so that getWeekId / buildWeeklyRange resolve the correct day.
export const parseLocalDate = (dateStr: string, timezone: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
  const [, y, m, d] = match.map(Number);
  const midnight = midnightInTz(y, m - 1, d, timezone);
  return new Date(midnight.getTime() + 12 * 3_600_000);
};

/**
 * Previous completed work week: Thursday 00:00 through Wednesday 23:59:59.999.
 * When run Thursday morning, that is last Thursday through yesterday (Wednesday).
 * On other days, reports the most recently completed Thu–Wed window.
 */
export const buildWeeklyRange = (
  now: Date = new Date(),
  timezone: string = "UTC",
): DateRange => {
  const { year, month, day } = localDateParts(now, timezone);
  const d = new Date(Date.UTC(year, month, day));
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat

  // Most recently completed Wednesday (do not treat "today" as complete if Wed)
  const daysBackToCompletedWed = dow === 3 ? 7 : ((dow - 3 + 7) % 7);
  const lastWednesday = new Date(Date.UTC(year, month, day - daysBackToCompletedWed));
  const prevThursday = new Date(lastWednesday.getTime() - 6 * 86_400_000);

  const fromParts = {
    year: prevThursday.getUTCFullYear(),
    month: prevThursday.getUTCMonth(),
    day: prevThursday.getUTCDate(),
  };
  const from = midnightInTz(fromParts.year, fromParts.month, fromParts.day, timezone);

  // "to" is end of Wednesday (next day's midnight - 1ms)
  const nextDay = new Date(lastWednesday.getTime() + 86_400_000);
  const toParts = {
    year: nextDay.getUTCFullYear(),
    month: nextDay.getUTCMonth(),
    day: nextDay.getUTCDate(),
  };
  const to = new Date(midnightInTz(toParts.year, toParts.month, toParts.day, timezone).getTime() - 1);

  return { from, to };
};

/** Thursday that starts the in-progress work week containing `now`. */
export const currentWeekThursday = (
  now: Date = new Date(),
  timezone: string = "UTC",
): { year: number; month: number; day: number } => {
  const { year, month, day } = localDateParts(now, timezone);
  const d = new Date(Date.UTC(year, month, day));
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  const daysSinceThursday = (dow - 4 + 7) % 7;
  const thu = new Date(Date.UTC(year, month, day - daysSinceThursday));
  return {
    year: thu.getUTCFullYear(),
    month: thu.getUTCMonth(),
    day: thu.getUTCDate(),
  };
};

// Yesterday's full day (00:00:00.000 to 23:59:59.999 local time).
// Used by daily-fetch: the cron fires at midnight, so yesterday is fully
// complete and its events can be collected reliably.
export const buildYesterdayRange = (
  now: Date = new Date(),
  timezone: string = "UTC",
): DateRange => {
  const { year, month, day } = localDateParts(now, timezone);

  // Yesterday in the local timezone
  const todayUTC = new Date(Date.UTC(year, month, day));
  const yesterdayUTC = new Date(todayUTC.getTime() - 86_400_000);
  const yParts = {
    year: yesterdayUTC.getUTCFullYear(),
    month: yesterdayUTC.getUTCMonth(),
    day: yesterdayUTC.getUTCDate(),
  };

  const from = midnightInTz(yParts.year, yParts.month, yParts.day, timezone);
  // "to" is end of yesterday (today's midnight - 1ms)
  const to = new Date(midnightInTz(year, month, day, timezone).getTime() - 1);

  return { from, to };
};

/** One exact local calendar day. */
export const buildDayRange = (
  date: Date,
  timezone: string = "UTC",
): DateRange => {
  const { year, month, day } = localDateParts(date, timezone);
  const from = midnightInTz(year, month, day, timezone);
  const nextDate = new Date(Date.UTC(year, month, day + 1));
  const to = new Date(midnightInTz(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth(),
    nextDate.getUTCDate(),
    timezone,
  ).getTime() - 1);
  return { from, to };
};

/** Previous completed weekday; Monday resolves to the preceding Friday. */
export const buildPreviousWorkdayRange = (
  now: Date = new Date(),
  timezone: string = "UTC",
): DateRange => {
  const { year, month, day } = localDateParts(now, timezone);
  const localDay = new Date(Date.UTC(year, month, day)).getUTCDay();
  const daysBack = localDay === 1 ? 3 : localDay === 0 ? 2 : localDay === 6 ? 1 : 1;
  const target = new Date(Date.UTC(year, month, day - daysBack));
  return buildDayRange(parseLocalDate(
    `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`,
    timezone,
  ), timezone);
};

export const toISODate = (date: Date, timezone: string = "UTC"): string => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
};
