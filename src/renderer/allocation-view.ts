// Template-friendly view model for the "Where the effort went" section.
// All formatting (percentages, hours, colors, flags) lives here; templates only print.

import type {
  Allocation,
  AllocationBucket,
  AllocationItem,
  AllocationTrend,
  WorkType,
} from "../types.js";

/** Categorical slots available to initiatives before folding into "Other". */
export const MAX_INITIATIVE_COLORS = 6;
/** Segments below this share get no inline label (they still render, with a title). */
export const MIN_LABEL_PERCENT = 3;
/** Segments at or above this share also show their name inline. */
export const MIN_NAME_PERCENT = 14;

export const OTHER_LABEL = "Other";
/** Max shipped items shown per initiative before the rest fold into a <details>. */
export const MAX_VISIBLE_SHIPPED = 8;
export const MEASURE_TITLE = "How we measure this";
export const MEASURE_NOTE =
  "Work delivered estimates how long a typical engineer would need to build the same changes, based on their size, breadth, tests, and code reviews. " +
  "It measures output, not hours worked: a major fix finished in one focused session counts the same as one spread across a day. " +
  "Percentages show where this period's delivered work went. " +
  "Items marked Self-reported (e.g. meetings, design) are logged by hand.";

const WORK_TYPE_SLOTS: Record<WorkType, string> = {
  "new-capability": "alloc-w1",
  quality: "alloc-w2",
  maintenance: "alloc-w3",
  documentation: "alloc-w4",
  "team-support": "alloc-w5",
  unlogged: "alloc-wn",
};

const WORK_TYPE_FALLBACK_LABELS: Record<WorkType, string> = {
  "new-capability": "New capability",
  quality: "Quality & bug fixes",
  maintenance: "Maintenance & tooling",
  documentation: "Documentation",
  "team-support": "Supporting the team",
  unlogged: "Meetings & unlogged (self-reported)",
};

export type AllocationInput = {
  day?: Allocation;
  week?: { label: string; allocation: Allocation };
  trend?: AllocationTrend;
  /** Report date (YYYY-MM-DD); the last trend week is "so far" only while it is still open. */
  asOf?: string;
};

export type AllocationSegmentView = {
  name: string;
  /** CSS class selecting the series color, e.g. "alloc-c2", "alloc-other", "alloc-w1". */
  colorClass: string;
  /** "42%" or "<1%". */
  percent: string;
  percentValue: number;
  /** flex-grow weight (share of total, 0-100, 2 decimals). */
  grow: string;
  /** Relative size used for ordering (not displayed). */
  value: number;
  /** "Pricing: 42% of work delivered". */
  title: string;
  showLabel: boolean;
  showName: boolean;
  isOther: boolean;
};

export type AllocationBarView = {
  segments: AllocationSegmentView[];
  ariaLabel: string;
};

export type AllocationItemView = {
  title: string;
  url?: string;
  repository?: string;
  kindLabel: string;
  stateLabel?: string;
  selfReported: boolean;
  impact?: "major" | "notable";
  impactLabel?: string;
};

export type AllocationInitiativeView = {
  name: string;
  colorClass: string;
  percent: string;
  percentValue: number;
  width: string;
  title: string;
  /** First MAX_VISIBLE_SHIPPED shipped items. */
  shipped: AllocationItemView[];
  /** Remaining shipped items, folded into a <details>. */
  shippedMore: AllocationItemView[];
  hasShippedMore: boolean;
  shippedMoreCount: number;
  inProgress: AllocationItemView[];
  other: AllocationItemView[];
  hasShipped: boolean;
  hasInProgress: boolean;
  hasOther: boolean;
  otherCount: number;
  hasSelfReported: boolean;
  isEmpty: boolean;
};

export type AllocationLegendItem = {
  name: string;
  colorClass: string;
  percent?: string;
};

export type AllocationTrendRowView = {
  label: string;
  days: number;
  hasReports: boolean;
  /** Shown instead of the bar when there is nothing to plot. */
  emptyText: string;
  total: string;
  isCurrent: boolean;
  bar: AllocationBarView;
};

export type AllocationTableView = {
  headers: string[];
  rows: { label: string; days: number; total: string; cells: string[] }[];
};

export type AllocationView = {
  title: string;
  lede: string;
  hasWeek: boolean;
  periodLabel: string;
  weekBar?: AllocationBarView;
  weekLegend: AllocationSegmentView[];
  weekWorkTypeBar?: AllocationBarView;
  weekWorkTypes: AllocationSegmentView[];
  initiatives: AllocationInitiativeView[];
  hasInitiatives: boolean;
  hasDay: boolean;
  dayBar?: AllocationBarView;
  dayLegend: AllocationSegmentView[];
  hasTrend: boolean;
  trendRows: AllocationTrendRowView[];
  trendLegend: AllocationLegendItem[];
  trendTable?: AllocationTableView;
  /** Collector note; carried for data consumers, not rendered. */
  note: string;
  measureTitle: string;
  measureNote: string;
};

// ---------------------------------------------------------------- formatting

export const HOURS_PER_ENGINEER_DAY = 8;
export const HOURS_PER_ENGINEER_WEEK = 40;
const DAYS_BELOW_HOURS = 80;

/** Nearest 0.5 below 10, integer from 10 up; never below 0.5. */
const roundUnits = (value: number): number => {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rounded = v < 10 ? Math.round(v * 2) / 2 : Math.round(v);
  return Math.max(0.5, rounded);
};

/**
 * Express an engineer-hour estimate as engineer-days (< 80h) or engineer-weeks so it
 * cannot be read as clock time. 1 day = 8h, 1 week = 40h.
 */
export const formatWorkDelivered = (hours: number): { short: string; long: string; plain: string } => {
  const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const weeks = h >= DAYS_BELOW_HOURS;
  const n = roundUnits(h / (weeks ? HOURS_PER_ENGINEER_WEEK : HOURS_PER_ENGINEER_DAY));
  const text = String(n);
  const unit = weeks ? "week" : "day";
  const one = n === 1;
  return {
    short: `~${text} eng-${weeks ? "wk" : "day"}${one ? "" : "s"}`,
    long: `about ${text} engineer-${unit}${one ? "" : "s"}`,
    /** For sentences that already say "one engineer": "about 13 weeks". */
    plain: `about ${text} ${unit}${one ? "" : "s"}`,
  };
};

/** "42%", "<1%". */
export const formatPercent = (ratio: number): string => {
  const pct = ratio * 100;
  if (!(pct > 0)) return "0%";
  if (pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
};

const toPercentValue = (hours: number, total: number): number =>
  total > 0 ? Math.max(0, (hours / total) * 100) : 0;

const segmentTitle = (name: string, percent: string): string =>
  `${name}: ${percent} of work delivered`;

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

const safeUrl = (url: string | undefined): string | undefined =>
  url && /^https?:\/\//i.test(url) ? url : undefined;

// ---------------------------------------------------------------- colors

type ColorMap = {
  classFor: (initiative: string) => string;
  isOther: (initiative: string) => boolean;
};

const buildColorMap = (order: string[]): ColorMap => {
  const slots = new Map<string, number>();
  for (const name of order) {
    if (!slots.has(name) && slots.size < MAX_INITIATIVE_COLORS) slots.set(name, slots.size + 1);
  }
  return {
    classFor: (name) => (slots.has(name) ? `alloc-c${slots.get(name)}` : "alloc-other"),
    isOther: (name) => !slots.has(name),
  };
};

const slotIndex = (colorClass: string): number => {
  const m = /^alloc-c(\d)$/.exec(colorClass);
  return m ? Number(m[1]) : 99;
};

// ---------------------------------------------------------------- bars

const makeSegment = (
  name: string,
  hours: number,
  total: number,
  colorClass: string,
  isOther: boolean,
): AllocationSegmentView => {
  const percentValue = toPercentValue(hours, total);
  const percent = formatPercent(percentValue / 100);
  return {
    name,
    colorClass,
    percent,
    percentValue,
    grow: percentValue.toFixed(2),
    value: hours,
    title: segmentTitle(name, percent),
    showLabel: percentValue >= MIN_LABEL_PERCENT,
    showName: percentValue >= MIN_NAME_PERCENT,
    isOther,
  };
};

const toBar = (segments: AllocationSegmentView[], subject: string): AllocationBarView => ({
  segments,
  ariaLabel: segments.length === 0
    ? `${subject}: no data`
    : `${subject}: ${segments.map((s) => `${s.name} ${s.percent}`).join(", ")}`,
});

/** Initiative segments; buckets beyond the palette fold into one trailing "Other". */
const initiativeSegments = (
  allocation: Allocation,
  colors: ColorMap,
  order: "size" | "palette",
): AllocationSegmentView[] => {
  const total = allocation.totalHours;
  const named: AllocationSegmentView[] = [];
  let otherHours = 0;
  for (const b of allocation.initiatives) {
    if (!(b.hours > 0)) continue;
    if (colors.isOther(b.initiative)) otherHours += b.hours;
    else named.push(makeSegment(b.initiative, b.hours, total, colors.classFor(b.initiative), false));
  }
  if (order === "palette") named.sort((a, b) => slotIndex(a.colorClass) - slotIndex(b.colorClass));
  else named.sort((a, b) => b.value - a.value);
  if (otherHours > 0) named.push(makeSegment(OTHER_LABEL, otherHours, total, "alloc-other", true));
  return named;
};

const workTypeSegments = (allocation: Allocation): AllocationSegmentView[] =>
  allocation.workTypes
    .filter((w) => w.hours > 0)
    .map((w) => makeSegment(
      w.label || WORK_TYPE_FALLBACK_LABELS[w.workType] || w.workType,
      w.hours,
      allocation.totalHours,
      WORK_TYPE_SLOTS[w.workType] ?? "alloc-wn",
      false,
    ));

// ---------------------------------------------------------------- items

const KIND_LABELS: Record<AllocationItem["kind"], string> = {
  pr: "Pull request",
  review: "Review",
  commits: "Direct commits",
  manual: "Self-reported",
};

const STATE_LABELS: Record<NonNullable<AllocationItem["state"]>, string> = {
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};

/** Stakeholder lists read better without "feat(scope):" prefixes. */
const stripConventionalPrefix = (title: string): string => {
  const stripped = title.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, "").trim();
  return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : title;
};

const IMPACT_LABELS: Record<NonNullable<AllocationItem["impact"]>, string> = {
  major: "Major",
  notable: "Notable",
};

const toItemView = (item: AllocationItem): AllocationItemView => ({
  title: item.kind === "pr" ? stripConventionalPrefix(item.title) : item.title,
  url: safeUrl(item.url),
  repository: item.repository,
  kindLabel: KIND_LABELS[item.kind] ?? item.kind,
  stateLabel: item.state ? STATE_LABELS[item.state] : undefined,
  selfReported: item.kind === "manual",
  ...(item.impact ? { impact: item.impact, impactLabel: IMPACT_LABELS[item.impact] } : {}),
});

const toInitiativeView = (
  bucket: AllocationBucket,
  total: number,
  colors: ColorMap,
): AllocationInitiativeView => {
  const percentValue = toPercentValue(bucket.hours, total);
  const percent = formatPercent(percentValue / 100);
  const allShipped = (bucket.shipped ?? []).map(toItemView);
  const shipped = allShipped.slice(0, MAX_VISIBLE_SHIPPED);
  const shippedMore = allShipped.slice(MAX_VISIBLE_SHIPPED);
  const inProgress = (bucket.inProgress ?? []).map(toItemView);
  const other = (bucket.other ?? []).map(toItemView);
  return {
    name: bucket.initiative,
    colorClass: colors.classFor(bucket.initiative),
    percent,
    percentValue,
    width: `${Math.min(100, percentValue).toFixed(2)}%`,
    title: segmentTitle(bucket.initiative, percent),
    shipped,
    shippedMore,
    hasShippedMore: shippedMore.length > 0,
    shippedMoreCount: shippedMore.length,
    inProgress,
    other,
    hasShipped: allShipped.length > 0,
    hasInProgress: inProgress.length > 0,
    hasOther: other.length > 0,
    otherCount: other.length,
    hasSelfReported: [...allShipped, ...inProgress, ...other].some((i) => i.selfReported),
    isEmpty: allShipped.length + inProgress.length + other.length === 0,
  };
};

// ---------------------------------------------------------------- trend

const buildTrend = (
  trend: AllocationTrend,
  colors: ColorMap,
  asOf?: string,
): { rows: AllocationTrendRowView[]; table: AllocationTableView } | undefined => {
  if (trend.periods.length === 0) return undefined;
  const last = trend.periods.length - 1;
  const rows = trend.periods.map((p, i): AllocationTrendRowView => {
    const hasReports = p.days > 0;
    const hasEffort = hasReports && p.allocation.totalHours > 0;
    return {
      label: p.label,
      days: p.days,
      hasReports,
      emptyText: hasReports ? "No estimated effort" : "No reports",
      total: hasEffort ? formatWorkDelivered(p.allocation.totalHours).short : "",
      isCurrent: i === last && (!asOf || asOf < p.to),
      bar: hasEffort
        ? toBar(initiativeSegments(p.allocation, colors, "palette"), p.label)
        : { segments: [], ariaLabel: `${p.label}: ${hasReports ? "no estimated effort" : "no reports"}` },
    };
  });

  const names = trend.initiatives;
  const table: AllocationTableView = {
    headers: ["Work week", "Days", "Work delivered", ...names],
    rows: trend.periods.map((p) => {
      const total = p.allocation.totalHours;
      return {
        label: p.label,
        days: p.days,
        total: total > 0 ? formatWorkDelivered(total).short : "-",
        cells: names.map((n) => {
          const b = p.allocation.initiatives.find((x) => x.initiative === n);
          if (!b || !(b.hours > 0)) return "-";
          return formatPercent(toPercentValue(b.hours, total) / 100);
        }),
      };
    }),
  };
  return { rows, table };
};

// ---------------------------------------------------------------- same-as-week check

const round1 = (n: number): number => Math.round(n * 10) / 10;

const sameAllocation = (a: Allocation, b: Allocation): boolean => {
  if (round1(a.totalHours) !== round1(b.totalHours)) return false;
  if (a.initiatives.length !== b.initiatives.length) return false;
  const byName = new Map(b.initiatives.map((x) => [x.initiative, x.hours]));
  return a.initiatives.every((x) => byName.has(x.initiative) && round1(byName.get(x.initiative)!) === round1(x.hours));
};

// ---------------------------------------------------------------- entry

const hasTotal = (a: Allocation | undefined): a is Allocation => !!a && a.totalHours > 0;

/** Build the section view; undefined when there is nothing worth showing. */
export const buildAllocationView = (input: AllocationInput | undefined): AllocationView | undefined => {
  if (!input) return undefined;
  const week = hasTotal(input.week?.allocation) ? input.week : undefined;
  const day = hasTotal(input.day) ? input.day : undefined;
  const trend = input.trend && input.trend.periods.some((p) => p.allocation.totalHours > 0)
    ? input.trend
    : undefined;
  if (!week && !day && !trend) return undefined;

  const primary = week?.allocation ?? day;
  const order = [
    ...(trend?.initiatives ?? []),
    ...(week?.allocation.initiatives.map((b) => b.initiative) ?? []),
    ...(day?.initiatives.map((b) => b.initiative) ?? []),
  ];
  const colors = buildColorMap(order);

  const weekLegend = week ? initiativeSegments(week.allocation, colors, "size") : [];
  const weekWorkTypes = week ? workTypeSegments(week.allocation) : [];
  const initiativeSource = primary;
  const initiatives = initiativeSource
    ? initiativeSource.initiatives
        .filter((b) => b.hours > 0 || b.shipped?.length || b.inProgress?.length || b.other?.length)
        .map((b) => toInitiativeView(b, initiativeSource.totalHours, colors))
    : [];

  const initiativeCount = primary ? primary.initiatives.filter((b) => b.hours > 0).length : 0;
  const scope = week ? `this week (${week.label})` : "today";
  const lede = primary
    ? `Work delivered ${scope} would typically take one engineer ${formatWorkDelivered(primary.totalHours).plain}. Here's where it went across ${initiativeCount} ${plural(initiativeCount, "initiative", "initiatives")}.`
    : "Share of delivered work over recent work weeks.";

  const showDay = !!day && !(week && sameAllocation(day, week.allocation));
  const dayLegend = showDay && day ? initiativeSegments(day, colors, "size") : [];

  const builtTrend = trend ? buildTrend(trend, colors, input.asOf) : undefined;
  const trendLegend: AllocationLegendItem[] = [];
  if (trend && builtTrend) {
    for (const name of trend.initiatives) {
      const item = { name: colors.isOther(name) ? OTHER_LABEL : name, colorClass: colors.classFor(name) };
      if (!trendLegend.some((l) => l.colorClass === item.colorClass)) trendLegend.push(item);
    }
  }

  const note = (week?.allocation.note ?? day?.note ?? trend?.periods.at(-1)?.allocation.note ?? "").trim();

  return {
    title: "Where the effort went",
    lede,
    hasWeek: !!week,
    periodLabel: week?.label ?? "",
    weekBar: week ? toBar(weekLegend, "Initiatives this work week") : undefined,
    weekLegend,
    weekWorkTypeBar: week && weekWorkTypes.length > 0 ? toBar(weekWorkTypes, "Work types this work week") : undefined,
    weekWorkTypes,
    initiatives,
    hasInitiatives: initiatives.length > 0,
    hasDay: showDay,
    dayBar: showDay ? toBar(dayLegend, "Initiatives today") : undefined,
    dayLegend,
    hasTrend: !!builtTrend,
    trendRows: builtTrend?.rows ?? [],
    trendLegend,
    trendTable: builtTrend?.table,
    note,
    measureTitle: MEASURE_TITLE,
    measureNote: MEASURE_NOTE,
  };
};
