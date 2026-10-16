// Present the hours estimate as "work delivered" in engineer-days / engineer-weeks.
// The estimate means "how long a typical engineer would need to build the same
// changes", not clock time, so we avoid hour-based labels in stakeholder output.

const HOURS_PER_DAY = 8;
const HOURS_PER_WEEK = 40;
/** Switch from days to weeks at this many hours (10 engineer-days). */
const WEEKS_THRESHOLD_HOURS = 80;
const MIN_SHOWN = 0.5;

/** Values below 10 round to the nearest half unit; larger values to whole units. */
const roundForDisplay = (value: number): number => {
  if (value < 10) return Math.max(MIN_SHOWN, Math.round(value * 2) / 2);
  return Math.round(value);
};

/**
 * Format an hours estimate as a work-delivered label, e.g. "~4.5 engineer-days"
 * or "~13 engineer-weeks". Pure: no I/O, no locale dependence.
 */
export const formatWorkDeliveredLabel = (hours: number): string => {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 0;
  const useWeeks = safeHours >= WEEKS_THRESHOLD_HOURS;
  const value = roundForDisplay(useWeeks ? safeHours / HOURS_PER_WEEK : safeHours / HOURS_PER_DAY);
  const unit = useWeeks ? "engineer-week" : "engineer-day";
  return `~${value} ${value === 1 ? unit : `${unit}s`}`;
};
