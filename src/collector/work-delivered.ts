// Present the hours estimate as estimated effort in engineer-days, one unit everywhere.
// The estimate means heuristic manual effort for one engineer to deliver the
// same changes without AI assistance, not clock time or measured time saved.

export const HOURS_PER_ENGINEER_DAY = 8;
const MIN_SHOWN = 0.5;

/** Values below 10 round to the nearest half day; larger values to whole days. */
const roundForDisplay = (value: number): number => {
  if (value < 10) return Math.max(MIN_SHOWN, Math.round(value * 2) / 2);
  return Math.round(value);
};

/** Numeric day count for display, e.g. "4.5", "27", "1,284". Locale independent. */
export const formatEngineerDaysValue = (hours: number): string => {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 0;
  const value = roundForDisplay(safeHours / HOURS_PER_ENGINEER_DAY);
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/** "engineer-day" / "engineer-days" for a value from {@link formatEngineerDaysValue}. */
export const engineerDayUnit = (value: string): string => (value === "1" ? "engineer-day" : "engineer-days");

/**
 * Format an hours estimate as a label, e.g. "~4.5 engineer-days" or "~1,284 engineer-days".
 * Pure: no I/O, no locale dependence.
 */
export const formatWorkDeliveredLabel = (hours: number): string => {
  const value = formatEngineerDaysValue(hours);
  return `~${value} ${engineerDayUnit(value)}`;
};
