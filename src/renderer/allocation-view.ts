// Template-friendly view model for the "Where the effort went" section.
// All formatting (percentages, hours, colors, flags) lives here; templates only print.

import type {
  Allocation,
  AllocationBucket,
  AllocationItem,
  AllocationTrend,
  WorkType,
} from "../types.js";
import { summarizeVerification } from "../collector/readiness.js";
import { NO_ACTIVITY_INITIATIVE } from "../collector/allocation.js";
import { INITIATIVE_PALETTE } from "./themes/allocation-css.js";
import { engineerDayUnit, formatEngineerDaysValue } from "../collector/work-delivered.js";

/** Categorical slots available to initiatives before folding into "Other". */
export const MAX_INITIATIVE_COLORS = INITIATIVE_PALETTE.length;
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
  "no-activity": "alloc-wn",
};

const WORK_TYPE_FALLBACK_LABELS: Record<WorkType, string> = {
  "no-activity": "No GitHub activity",
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
  /** Archive-wide initiative order so colors match the index page. */
  colorOrder?: string[];
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
  readiness?: { label: string; stage: string; detail?: string; ariaLabel: string };
  /** `label` already carries " · partial" when the file list was incomplete; `partial` drives the dashed style. */
  complexity?: { label: string; level: string; reason: string; risks: string[]; hasRisks: boolean; partial: boolean };
  checksText?: string;
  /** A PR closed without merging (shown under "Other work" with its verification details). */
  closedWithoutMerge?: boolean;
};

export type AllocationVerificationView = {
  title: string;
  readinessLine?: string;
  checksLine: string;
  note?: string;
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

export type AllocationPeriodKind = "day" | "week" | "month";

/** One period (a day, a work week or a calendar month) to show as a panel. */
export type AllocationPanelInput = {
  kind: AllocationPeriodKind;
  /** Stable, unique DOM id, e.g. "day-2026-10-07". */
  id: string;
  /** "Oct 7", "Oct 1–7", "October 2026". */
  label: string;
  allocation: Allocation;
  /** Period still running (this week / this month so far). */
  open?: boolean;
};

export type AllocationPanelView = {
  id: string;
  kind: AllocationPeriodKind;
  /** Option / tab text. */
  label: string;
  /** Block heading, e.g. "Work week of Oct 1–7 (so far)". */
  heading: string;
  lede: string;
  bar: AllocationBarView;
  legend: AllocationSegmentView[];
  workTypeBar?: AllocationBarView;
  workTypes: AllocationSegmentView[];
  initiatives: AllocationInitiativeView[];
  hasInitiatives: boolean;
  verification?: AllocationVerificationView;
  isDefault: boolean;
};

export type AllocationView = {
  title: string;
  /** Panels in tab order; exactly one has isDefault. */
  panels: AllocationPanelView[];
  /** More than one panel: show the Day / Week switch. */
  hasSwitch: boolean;
  hasTrend: boolean;
  trendRows: AllocationTrendRowView[];
  trendLegend: AllocationLegendItem[];
  trendTable?: AllocationTableView;
  /** Collector note; carried for data consumers, not rendered. */
  note: string;
  measureTitle: string;
  measureNote: string;
  /** Inline script that wires tabs / selects to panels (static, no data). */
  script: string;
};

// ---------------------------------------------------------------- formatting

export const HOURS_PER_ENGINEER_DAY = 8;

/**
 * Express an engineer-hour estimate as engineer-days (the only unit used) so it
 * cannot be read as clock time. 1 day = 8h.
 */
export const formatWorkDelivered = (hours: number): { short: string; long: string; plain: string } => {
  const text = formatEngineerDaysValue(hours);
  const one = text === "1";
  return {
    short: `~${text} ${one ? "day" : "days"}`,
    long: `about ${text} ${engineerDayUnit(text)}`,
    /** For sentences that already say "one engineer": "about 13 days". */
    plain: `about ${text} ${one ? "day" : "days"}`,
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
    // The no-activity minimum day is neutral gray and never takes a palette slot.
    if (name === NO_ACTIVITY_INITIATIVE) continue;
    if (!slots.has(name) && slots.size < MAX_INITIATIVE_COLORS) slots.set(name, slots.size + 1);
  }
  return {
    classFor: (name) => (slots.has(name) ? `alloc-c${slots.get(name)}` : "alloc-other"),
    // Not folded into "Other": it keeps its own name and only shares the gray color.
    isOther: (name) => name !== NO_ACTIVITY_INITIATIVE && !slots.has(name),
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
  allocation: Pick<Allocation, "totalHours" | "initiatives">,
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

/**
 * Initiative mix for the homepage (hero + week rows): same color slots as the report pages
 * (driven by the archive-wide `colorOrder`), beyond-palette initiatives folded into "Other".
 */
export const buildInitiativeMix = (
  allocation: Pick<Allocation, "totalHours" | "initiatives">,
  colorOrder: string[],
  order: "size" | "palette",
): AllocationSegmentView[] => {
  const bySize = [...allocation.initiatives].sort((a, b) => b.hours - a.hours).map((b) => b.initiative);
  return initiativeSegments(allocation, buildColorMap([...colorOrder, ...bySize]), order);
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
export const stripConventionalPrefix = (title: string): string => {
  const stripped = title.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, "").trim();
  return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : title;
};

const IMPACT_LABELS: Record<NonNullable<AllocationItem["impact"]>, string> = {
  major: "Large change",
  notable: "Substantial change",
};

const checksText = (item: AllocationItem): string | undefined => {
  const c = item.checks;
  if (!c) return undefined;
  const parts: string[] = [];
  if (!c.automated) parts.push("Checks not collected");
  else if (c.automated.total === 0) parts.push("No automated checks");
  else {
    const { passed, pending, total, partial } = c.automated;
    // Partial: commit statuses were unreadable, so "all passed" would overstate what was checked.
    if (pending > 0) parts.push(`${passed} of ${total} automated checks passed · ${pending} still running`);
    else if (partial) parts.push(`${passed} of ${total} automated checks passed`);
    else parts.push(passed === total
      ? `${total === 1 ? "Automated check" : total === 2 ? "Both automated checks" : `All ${total} automated checks`} passed`
      : `${passed} of ${total} automated checks passed`);
    // Source-neutral: either the check runs or the commit statuses may be the incomplete source.
    if (partial) parts.push("some check results not collected");
  }
  if (c.automatedReviews > 0) parts.push(`${c.automatedReviews} automated ${plural(c.automatedReviews, "review", "reviews")}`);
  if (c.humanReviews > 0) parts.push(`${c.humanReviews} human ${plural(c.humanReviews, "review", "reviews")}`);
  if (c.testsUpdated) parts.push("tests updated");
  return parts.join(" · ");
};

const toItemView = (item: AllocationItem): AllocationItemView => ({
  title: item.kind === "pr" ? stripConventionalPrefix(item.title) : item.title,
  url: safeUrl(item.url),
  repository: item.repository,
  kindLabel: KIND_LABELS[item.kind] ?? item.kind,
  stateLabel: item.state ? STATE_LABELS[item.state] : undefined,
  selfReported: item.kind === "manual",
  ...(item.impact ? { impact: item.impact, impactLabel: IMPACT_LABELS[item.impact] } : {}),
  ...(item.readiness
    ? {
      readiness: {
        label: item.readiness.label,
        stage: item.readiness.stage,
        detail: item.readiness.detail,
        ariaLabel: item.readiness.detail ? `${item.readiness.label}: ${item.readiness.detail}` : item.readiness.label,
      },
    }
    : {}),
  ...(item.complexity
    ? {
      complexity: {
        // Based on an incomplete file list: say so on the chip, not only in the reason.
        label: item.complexity.partial ? `${item.complexity.label} · partial` : item.complexity.label,
        level: item.complexity.level,
        reason: item.complexity.reason,
        risks: item.complexity.risks,
        hasRisks: item.complexity.risks.length > 0,
        partial: item.complexity.partial === true,
      },
    }
    : {}),
  ...(checksText(item) ? { checksText: checksText(item) } : {}),
  ...(item.kind === "pr" && item.state === "closed" ? { closedWithoutMerge: true } : {}),
});

const joinParts = (parts: (string | false | undefined)[]): string => parts.filter(Boolean).join(" · ");

export const VERIFICATION_TITLE = "Checks behind this work";
export const VERIFICATION_NOTE =
  "No process catches every bug. When one gets through, the fix goes through these same checks.";

const buildVerification = (a: Allocation): AllocationVerificationView | undefined => {
  const s = summarizeVerification(a);
  const total = s.completed + s.inReview + s.drafts;
  if (total === 0 && s.aiFindingsAddressed === 0) return undefined;
  const readinessLine = total > 0
    ? `Of ${total} ${plural(total, "change", "changes")}: ` +
      joinParts([
        s.live > 0 && `${s.live} live`,
        s.preview > 0 && `${s.preview} in testing`,
        s.awaitingRelease > 0 && `${s.awaitingRelease} done, not live yet`,
        s.completed - s.live - s.preview - s.awaitingRelease > 0 &&
          `${s.completed - s.live - s.preview - s.awaitingRelease} done`,
        s.inReview > 0 && `${s.inReview} in review`,
        s.drafts > 0 && `${s.drafts} ${plural(s.drafts, "draft or prototype", "drafts or prototypes")}`,
      ])
    : undefined;
  // The blanket "no checks ran" claim needs every PR to be known zero-check; unknown PRs are named separately.
  // Review, test and finding counts are appended even when no PR has automated checks, since they can be the only evidence.
  const checksLead = (): string => {
    if (s.checksCollected > 0) return `${s.withPassingChecks} of ${s.checksCollected} passed automated checks`;
    if (s.withoutChecks > 0) {
      return s.checksUnknown > 0
        ? `${s.withoutChecks} had no automated checks · ${s.checksUnknown} not collected`
        : "No automated checks ran on these changes";
    }
    return "Automated check results not collected yet";
  };
  const checksLine = joinParts([
    checksLead(),
    s.checksCollected > 0 && s.withPendingChecks > 0 && `${s.withPendingChecks} still running`,
    s.checksCollected > 0 && s.withPartialChecks > 0 && `${s.withPartialChecks} with incomplete check results`,
    s.checksCollected > 0 && s.withoutChecks > 0 && `${s.withoutChecks} had no automated checks`,
    s.checksCollected > 0 && s.checksUnknown > 0 && `${s.checksUnknown} not collected`,
    s.withAutomatedReview > 0 && `${s.withAutomatedReview} had automated code review`,
    s.withHumanReview > 0 && `${s.withHumanReview} had human review`,
    s.withTests > 0 && `${s.withTests} included test updates`,
    s.aiFindingsAddressed > 0 && `${s.aiFindingsAddressed} review findings addressed`,
  ]);
  return {
    title: VERIFICATION_TITLE,
    ...(readinessLine ? { readinessLine } : {}),
    checksLine,
    ...(s.completed > 0 ? { note: VERIFICATION_NOTE } : {}),
  };
};

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
    // Self-reported time can fill a week with no daily reports; show it.
    const hasEffort = p.allocation.totalHours > 0;
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

// ---------------------------------------------------------------- panels

const SO_FAR = " (so far)";

const panelHeading = (p: AllocationPanelInput): string => {
  const suffix = p.open ? SO_FAR : "";
  if (p.kind === "week") return `Work week of ${p.label}${suffix}`;
  return `${p.label}${suffix}`;
};

const panelScope = (p: AllocationPanelInput): string => {
  if (p.kind === "day") return p.label === "Today" ? "today" : `on ${p.label}`;
  if (p.kind === "week") return p.open ? `this week so far (${p.label})` : `in the week of ${p.label}`;
  const month = p.label.replace(/\s+\d{4}$/, "");
  return p.open ? `in ${month} so far` : `in ${p.label}`;
};

const buildPanel = (p: AllocationPanelInput, colors: ColorMap, isDefault: boolean): AllocationPanelView => {
  const a = p.allocation;
  const legend = initiativeSegments(a, colors, "size");
  const workTypes = workTypeSegments(a);
  const initiatives = a.initiatives
    .filter((b) => b.hours > 0 || b.shipped?.length || b.inProgress?.length || b.other?.length)
    .map((b) => toInitiativeView(b, a.totalHours, colors));
  const count = a.initiatives.filter((b) => b.hours > 0).length;
  const verification = buildVerification(a);
  const heading = panelHeading(p);
  return {
    id: p.id,
    kind: p.kind,
    label: p.open ? `${p.label}${SO_FAR}` : p.label,
    heading,
    lede: `Work delivered ${panelScope(p)} would typically take one engineer ${formatWorkDelivered(a.totalHours).plain}. ` +
      `Here's where it went across ${count} ${plural(count, "initiative", "initiatives")}.`,
    bar: toBar(legend, `Initiatives, ${heading}`),
    legend,
    workTypeBar: workTypes.length > 0 ? toBar(workTypes, `Work types, ${heading}`) : undefined,
    workTypes,
    initiatives,
    hasInitiatives: initiatives.length > 0,
    ...(verification ? { verification } : {}),
    isDefault,
  };
};

/**
 * Show the panel picked by a tab inside each [data-alloc-root].
 * Without JS the default panel stays visible and the others stay hidden.
 */
export const ALLOCATION_SCRIPT = `<script>(function(){
document.querySelectorAll("[data-alloc-root]").forEach(function(root){
var panels=root.querySelectorAll("[data-alloc-panel]");
var tabs=root.querySelectorAll("[data-alloc-tab]");
function show(id){
panels.forEach(function(p){p.hidden=p.id!==id;});
tabs.forEach(function(t){var on=t.getAttribute("data-alloc-tab")===id;t.setAttribute("aria-selected",on?"true":"false");t.tabIndex=on?0:-1;});
}
tabs.forEach(function(t,i){
t.addEventListener("click",function(){show(t.getAttribute("data-alloc-tab"));});
t.addEventListener("keydown",function(e){
var d=e.key==="ArrowRight"?1:e.key==="ArrowLeft"?-1:0;if(!d)return;
var n=tabs[(i+d+tabs.length)%tabs.length];n.focus();n.click();e.preventDefault();
});
});
});
})();</script>`;

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

/** "Oct 7" for a YYYY-MM-DD date. */
export const formatDayLabel = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
};

/** Build the section view; undefined when there is nothing worth showing. */
export const buildAllocationView = (input: AllocationInput | undefined): AllocationView | undefined => {
  if (!input) return undefined;
  const week = hasTotal(input.week?.allocation) ? input.week : undefined;
  const day = hasTotal(input.day) ? input.day : undefined;
  const trend = input.trend && input.trend.periods.some((p) => p.allocation.totalHours > 0)
    ? input.trend
    : undefined;
  if (!week && !day && !trend) return undefined;

  const order = [
    ...(input.colorOrder ?? []),
    ...(trend?.initiatives ?? []),
    ...(week?.allocation.initiatives.map((b) => b.initiative) ?? []),
    ...(day?.initiatives.map((b) => b.initiative) ?? []),
  ];
  const colors = buildColorMap(order);

  const lastPeriod = trend?.periods.at(-1);
  const weekOpen = !!input.asOf && !!lastPeriod && input.asOf < lastPeriod.to;
  const inputs: AllocationPanelInput[] = [];
  // Identical day and week (first report of the week): one panel says it all.
  if (day && !(week && sameAllocation(day, week.allocation))) {
    inputs.push({ kind: "day", id: `alloc-day-${input.asOf ?? "today"}`, label: input.asOf ? formatDayLabel(input.asOf) : "Today", allocation: day });
  }
  if (week) {
    inputs.push({ kind: "week", id: `alloc-week-${lastPeriod?.id ?? "current"}`, label: week.label, allocation: week.allocation, open: weekOpen });
  }
  const panels = inputs.map((p, i) => buildPanel(p, colors, i === 0));

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
    panels,
    hasSwitch: panels.length > 1,
    hasTrend: !!builtTrend,
    trendRows: builtTrend?.rows ?? [],
    trendLegend,
    trendTable: builtTrend?.table,
    note,
    measureTitle: MEASURE_TITLE,
    measureNote: MEASURE_NOTE,
    script: panels.length > 1 ? ALLOCATION_SCRIPT : "",
  };
};
