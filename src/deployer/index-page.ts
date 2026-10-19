// Generate the index.html that lists all archived reports

import Handlebars from "handlebars";
import type { Allocation, Language, Theme, UserProfile } from "../types.js";
import { getLocale, getFontConfig } from "../i18n/index.js";
import { loadTheme, readThemeTemplate } from "../renderer/themes/index.js";
import {
  buildInitiativeMix,
  formatPercent,
  stripConventionalPrefix,
  type AllocationSegmentView,
} from "../renderer/allocation-view.js";
import { INDEX_HERO_PARTIAL, INDEX_LEDGER_PARTIAL, INDEX_PLANNING_PARTIAL } from "../renderer/themes/index-home.js";
import { engineerDayUnit, formatEngineerDaysValue } from "../collector/work-delivered.js";
import {
  dailyPathToDate,
  isWeekOpen,
  weekMonthKey,
  weekPagePath,
  workWeekOf,
} from "./work-weeks.js";

export type IndexPageData = {
  username?: string;
  avatarUrl?: string;
  profile?: UserProfile;
};

export type ReportEntryStats = {
  commits: number;
  prs: number;
  reviews: number;
  /** Estimated engineering hours for the report day (drives month-tape height). */
  hours?: number;
};

export type ReportEntry = {
  path: string;
  week: string;
  year: string;
  title?: string;
  subtitle?: string;
  overview?: string; // LLM-generated multi-paragraph overview text
  dateLabel: string;
  dateTo?: string; // ISO date (YYYY-MM-DD) of the week's last day
  stats?: ReportEntryStats;
  dayLabel?: string;
  weekdayLabel?: string;
  activityPercent?: number;
};

type YearGroup = {
  year: string;
  reports: ReportEntry[];
};

export type WeekInitiativeShare = { name: string; percent: string; colorClass?: string };

/** "≈ 27 engineer-days"; undefined when there is no estimate to show. */
export type EffortEstimate = { value: string; unit: string; label: string };

export type MixSegment = { name: string; colorClass: string; percent: string; grow: string; title: string };
export type MixBar = { segments: MixSegment[]; ariaLabel: string };

export const ESTIMATE_NOTE =
  "Estimated effort: how long a typical engineer would need to build the same changes. Not hours worked.";

const toEstimate = (hours: number | undefined): EffortEstimate | undefined => {
  if (!(typeof hours === "number" && Number.isFinite(hours) && hours > 0)) return undefined;
  const value = formatEngineerDaysValue(hours);
  const unit = engineerDayUnit(value);
  return { value, unit, label: `\u2248 ${value} ${unit}` };
};

const toMixSegments = (segments: AllocationSegmentView[]): MixSegment[] =>
  segments.map((s) => ({
    name: s.name,
    colorClass: s.colorClass,
    percent: s.percent,
    grow: s.grow,
    title: `${s.name} ${s.percent}`,
  }));

const toMixBar = (segments: AllocationSegmentView[], subject: string): MixBar => {
  const mapped = toMixSegments(segments);
  return {
    segments: mapped,
    ariaLabel: mapped.length === 0 ? `${subject}: no data` : `${subject}: ${mapped.map((s) => `${s.name} ${s.percent}`).join(", ")}`,
  };
};

const MAX_OUTCOMES = 3;

const completedItems = (allocation: Allocation | undefined) => (allocation?.initiatives ?? [])
  .flatMap((b) => b.shipped)
  .filter((item) => item.title.trim() !== "");

const byEffortDesc = <T extends { effortHours?: number; title: string }>(a: T, b: T): number =>
  (b.effortHours ?? 0) - (a.effortHours ?? 0) || a.title.localeCompare(b.title);

const cleanTitle = (item: { kind: string; title: string }): string =>
  item.kind === "pr" ? stripConventionalPrefix(item.title) : item.title.trim();

const uniqueTitles = (items: { kind: string; title: string }[], limit: number, seen = new Set<string>()): string[] => {
  const titles: string[] = [];
  if (limit <= 0) return titles;
  for (const item of items) {
    const title = cleanTitle(item);
    if (seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    titles.push(title);
    if (titles.length >= limit) break;
  }
  return titles;
};

/**
 * One plain line about what a week produced: "Live: A, B · Done: C" (at most 3 items, live
 * first, then by estimated effort), else "In progress: ..." from open work, else "".
 */
export const buildOutcomeLine = (allocation: Allocation | undefined): string => {
  const done = completedItems(allocation).sort(byEffortDesc);
  const seen = new Set<string>();
  const live = uniqueTitles(done.filter((i) => i.readiness?.stage === "live"), MAX_OUTCOMES, seen);
  const merged = uniqueTitles(done.filter((i) => i.readiness?.stage !== "live"), MAX_OUTCOMES - live.length, seen);
  const parts: string[] = [];
  if (live.length > 0) parts.push(`Live: ${live.join(", ")}`);
  if (merged.length > 0) parts.push(`Done: ${merged.join(", ")}`);
  if (parts.length > 0) return parts.join(" \u00b7 ");
  const open = (allocation?.initiatives ?? []).flatMap((b) => b.inProgress).sort(byEffortDesc);
  const progress = uniqueTitles(open, MAX_OUTCOMES);
  return progress.length > 0 ? `In progress: ${progress.join(", ")}` : "";
};

/** One Thu–Wed work week row under a month. */
export type WeekRow = {
  /** The Thursday, YYYY-MM-DD. */
  id: string;
  href: string;
  /** "Oct 1-7". */
  label: string;
  from: string;
  to: string;
  open: boolean;
  /** Estimated effort (summed hours / 8): the allocation total when present (includes manual time), else the reports' hours. */
  estimate?: EffortEstimate;
  /** Hours behind `estimate`; month and archive totals are sums of these. */
  effortHours: number;
  /** Week effort relative to the largest week on the page (largest = 100). */
  barWidth: string;
  mixBar: MixBar;
  initiatives: WeekInitiativeShare[];
  hasInitiatives: boolean;
  /** "Live: A, B · Done: C" or "In progress: ..."; empty when nothing to say. */
  outcome: string;
  stats: ReportEntryStats;
  dayCount: number;
  dayCountLabel: string;
  /** Newest first. */
  reports: ReportEntry[];
};

type MonthGroup = {
  key: string;
  /** Anchor id, e.g. "month-2026-10". */
  anchor: string;
  label: string;
  year: string;
  /** Every report listed under the month (drives the tape). */
  reports: ReportEntry[];
  /** Work weeks, newest first. */
  weeks: WeekRow[];
  /** Reports that are not part of a work week (legacy weekly archives). */
  looseReports: ReportEntry[];
  stats: ReportEntryStats;
  estimate?: EffortEstimate;
};

type ArchiveOverview = {
  reportCount: number;
  commits: number;
  prs: number;
  reviews: number;
  rangeLabel: string;
  estimate?: EffortEstimate;
  mixBar: MixBar;
  legend: MixSegment[];
  hasMix: boolean;
};

const pathToDateLabel = (path: string): string => {
  const [year, month, day] = path.split("/");
  return month && day ? `${year}-${month}-${day}` : path.replace("/", " ");
};

const groupByYear = (reports: ReportEntry[]): YearGroup[] => {
  const sorted = [...reports].sort((a, b) => b.path.localeCompare(a.path));
  const groups = new Map<string, ReportEntry[]>();

  sorted.forEach((r) => {
    const existing = groups.get(r.year) ?? [];
    existing.push(r);
    groups.set(r.year, existing);
  });

  return [...groups.entries()].map(([year, reps]) => ({ year, reports: reps }));
};

/** Absolute scale: 0h → 4% tick, 8h → ~33%, 24h+ → 100%. */
const FULL_DAY_HOURS = 24;
const MIN_ACTIVITY_PERCENT = 4;

export const hoursToActivityPercent = (hours: number): number => {
  if (!Number.isFinite(hours) || hours <= 0) return MIN_ACTIVITY_PERCENT;
  return Math.min(100, Math.max(MIN_ACTIVITY_PERCENT, Math.round((hours / FULL_DAY_HOURS) * 100)));
};

const enrichActivity = (reports: ReportEntry[]): ReportEntry[] =>
  reports.map((report) => ({
    ...report,
    activityPercent: hoursToActivityPercent(report.stats?.hours ?? 0),
  }));

const sumStats = (reports: ReportEntry[]): ReportEntryStats => reports.reduce<ReportEntryStats>((total, report) => ({
  commits: total.commits + (report.stats?.commits ?? 0),
  prs: total.prs + (report.stats?.prs ?? 0),
  reviews: total.reviews + (report.stats?.reviews ?? 0),
  hours: (total.hours ?? 0) + (report.stats?.hours ?? 0),
}), { commits: 0, prs: 0, reviews: 0, hours: 0 });

const TOP_INITIATIVES = 3;

const topInitiatives = (allocation: Allocation | undefined): WeekInitiativeShare[] => {
  if (!allocation || !(allocation.totalHours > 0)) return [];
  return [...allocation.initiatives]
    .filter((b) => b.hours > 0)
    .sort((a, b) => b.hours - a.hours || a.initiative.localeCompare(b.initiative))
    .slice(0, TOP_INITIATIVES)
    .map((b) => ({ name: b.initiative, percent: formatPercent(b.hours / allocation.totalHours) }));
};

/** A week's effort: its allocation's total (which includes manual time) when it has hours, else the reports' hours. */
const effortHoursFor = (allocation: Allocation | undefined, reportHours: number): number =>
  allocation && allocation.totalHours > 0 ? allocation.totalHours : reportHours;

const buildWeekRows = (
  daily: ReportEntry[],
  latest: string,
  weekAllocations: ReadonlyMap<string, Allocation> | undefined,
  colorOrder: string[],
): { monthKey: string; row: WeekRow }[] => {
  const byWeek = new Map<string, ReportEntry[]>();
  for (const report of daily) {
    const id = workWeekOf(dailyPathToDate(report.path)!).id;
    byWeek.set(id, [...(byWeek.get(id) ?? []), report]);
  }
  const weekHours = new Map([...byWeek.entries()].map(([id, reports]) => [
    id,
    effortHoursFor(weekAllocations?.get(id), sumStats(reports).hours ?? 0),
  ]));
  // Shared scale: the busiest week on the page is a full-width bar.
  const maxHours = Math.max(0, ...weekHours.values());
  return [...byWeek.entries()].map(([id, reports]) => {
    const span = workWeekOf(id);
    const stats = sumStats(reports);
    const allocation = weekAllocations?.get(id);
    const hours = weekHours.get(id) ?? 0;
    const mix = allocation && allocation.totalHours > 0 ? buildInitiativeMix(allocation, colorOrder, "size") : [];
    // Labels follow the bar's own segments (same order and colors, "Other" included),
    // so every name can be found in the bar.
    const initiatives: WeekInitiativeShare[] = mix.length > 0
      ? mix.slice(0, TOP_INITIATIVES).map((seg) => ({ name: seg.name, percent: seg.percent, colorClass: seg.colorClass }))
      : topInitiatives(allocation);
    return {
      monthKey: weekMonthKey(span, latest),
      row: {
        id,
        href: weekPagePath(id),
        label: span.label,
        from: span.from,
        to: span.to,
        open: isWeekOpen(span, latest),
        estimate: toEstimate(hours),
        effortHours: hours,
        barWidth: maxHours > 0 ? ((hours / maxHours) * 100).toFixed(1).replace(/\.0$/, "") : "0",
        mixBar: toMixBar(mix, `Initiatives, week of ${span.label}`),
        initiatives,
        hasInitiatives: initiatives.length > 0,
        outcome: buildOutcomeLine(allocation),
        stats,
        dayCount: reports.length,
        dayCountLabel: `${reports.length} daily ${reports.length === 1 ? "report" : "reports"}`,
        reports: [...reports].sort((a, b) => b.path.localeCompare(a.path)),
      },
    };
  });
};

const groupByMonth = (
  reports: ReportEntry[],
  language: Language,
  weekAllocations?: ReadonlyMap<string, Allocation>,
  colorOrder: string[] = [],
): MonthGroup[] => {
  const enriched = enrichActivity(
    [...reports]
      .filter((report) => /^\d{4}\/(?:\d{2}\/\d{2}|W\d{2})$/.test(report.path))
      .sort((a, b) => b.path.localeCompare(a.path)),
  );
  const daily = enriched.filter((report) => dailyPathToDate(report.path));
  const loose = enriched.filter((report) => !dailyPathToDate(report.path));
  const latest = daily.length > 0 ? dailyPathToDate(daily[0].path)! : "";

  const weeksByMonth = new Map<string, WeekRow[]>();
  for (const { monthKey, row } of buildWeekRows(daily, latest, weekAllocations, colorOrder)) {
    weeksByMonth.set(monthKey, [...(weeksByMonth.get(monthKey) ?? []), row]);
  }
  const keys = [...weeksByMonth.keys()].sort((a, b) => b.localeCompare(a));
  const groups: MonthGroup[] = keys.map((key) => {
    const weeks = weeksByMonth.get(key)!.sort((a, b) => b.id.localeCompare(a.id));
    const [year, month] = key.split("-").map(Number);
    const monthReports = weeks.flatMap((week) => week.reports);
    return {
      key,
      anchor: `month-${key}`,
      label: new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" })
        .format(new Date(Date.UTC(year, month - 1, 1))),
      year: String(year),
      reports: monthReports,
      weeks,
      looseReports: [],
      stats: sumStats(monthReports),
      estimate: toEstimate(weeks.reduce((total, week) => total + week.effortHours, 0)),
    };
  });
  const looseByYear = new Map<string, ReportEntry[]>();
  for (const report of loose) {
    const year = report.path.split("/")[0];
    looseByYear.set(year, [...(looseByYear.get(year) ?? []), report]);
  }
  for (const [year, items] of [...looseByYear.entries()].sort(([a], [b]) => b.localeCompare(a))) {
    groups.push({
      key: `${year}-weekly`,
      anchor: `month-${year}-weekly`,
      label: "Weekly",
      year,
      reports: items,
      weeks: [],
      looseReports: items,
      stats: sumStats(items),
    });
  }
  return groups;
};

/** Merge every week's allocation into one period mix for the hero bar. */
const mergeAllocations = (allocations: Iterable<Allocation>): Pick<Allocation, "totalHours" | "initiatives"> => {
  const hours = new Map<string, number>();
  let totalHours = 0;
  for (const a of allocations) {
    for (const b of a.initiatives) {
      if (!(b.hours > 0)) continue;
      hours.set(b.initiative, (hours.get(b.initiative) ?? 0) + b.hours);
      totalHours += b.hours;
    }
  }
  return {
    totalHours,
    initiatives: [...hours.entries()].map(([initiative, h]) => ({
      initiative,
      hours: h,
      share: totalHours > 0 ? h / totalHours : 0,
      byWorkType: {},
      shipped: [],
      inProgress: [],
      other: [],
    })),
  };
};

const buildOverview = (
  reports: ReportEntry[],
  monthGroups: MonthGroup[],
  weekAllocations: ReadonlyMap<string, Allocation> | undefined,
  colorOrder: string[],
): ArchiveOverview => {
  const sorted = [...reports].sort((a, b) => a.path.localeCompare(b.path));
  const totals = reports.reduce((total, report) => ({
    commits: total.commits + (report.stats?.commits ?? 0),
    prs: total.prs + (report.stats?.prs ?? 0),
    reviews: total.reviews + (report.stats?.reviews ?? 0),
  }), { commits: 0, prs: 0, reviews: 0 });
  // Hero total and mix come from the same weeks as the week rows, so they share one source.
  const weeks = monthGroups.flatMap((group) => group.weeks);
  const weekPaths = new Set(weeks.flatMap((week) => week.reports.map((report) => report.path)));
  const otherHours = sumStats(reports.filter((report) => !weekPaths.has(report.path))).hours ?? 0;
  const effortHours = weeks.reduce((total, week) => total + week.effortHours, 0) + otherHours;
  const weekAllocationList = weeks.flatMap((week) => {
    const allocation = weekAllocations?.get(week.id);
    return allocation ? [allocation] : [];
  });
  return {
    reportCount: reports.length,
    ...totals,
    estimate: toEstimate(effortHours),
    ...(() => {
      const merged = mergeAllocations(weekAllocationList);
      const segments = merged.totalHours > 0 ? buildInitiativeMix(merged, colorOrder, "size") : [];
      return {
        mixBar: toMixBar(segments, "Initiative mix, reporting window"),
        legend: toMixSegments(segments),
        hasMix: segments.length > 0,
      };
    })(),
    rangeLabel: sorted.length > 0
      ? `${sorted[0].dateLabel} — ${sorted[sorted.length - 1].dateLabel}`
      : "No reports yet",
  };
};

export type IndexPageOptions = {
  /** Show the "Thinking about new work?" links to estimate/?kind=... (the calculator page exists). */
  hasEstimatePage?: boolean;
  /** Show the "Have a new app idea?" link; false until past apps/products exist (matches the calculator's app option). */
  hasAppEstimates?: boolean;
  /** Allocation per work week (key: Thursday YYYY-MM-DD) for the top-initiatives line. */
  weekAllocations?: ReadonlyMap<string, Allocation>;
  /** Archive-wide initiative order so colors match the report pages. */
  colorOrder?: string[];
};

export const renderIndexPage = (
  reports: ReportEntry[],
  pageData?: IndexPageData,
  language: Language = "en",
  siteTitle?: string,
  baseUrl?: string,
  repoUrl?: string,
  themeName: Theme = "brutalist",
  options: IndexPageOptions = {},
): string => {
  const locale = getLocale(language);
  const fontConfig = getFontConfig(language);
  const theme = loadTheme(themeName);
  const resolvedSiteTitle = (siteTitle ?? "Dev\nPulse").replace(/\\n/g, "\n");
  const siteTitleInline = resolvedSiteTitle.replace(/\n/g, " ");
  const username = pageData?.username ?? "";
  const description = `Daily reports by @${username}`;
  const ogImageUrl = baseUrl ? `${baseUrl}/og.png` : "og.png";
  const indexTemplate = readThemeTemplate(theme, "index-page.hbs");
  const hbs = Handlebars.create();
  hbs.registerPartial("index-hero", INDEX_HERO_PARTIAL);
  hbs.registerPartial("index-ledger", INDEX_LEDGER_PARTIAL);
  hbs.registerPartial("index-planning", INDEX_PLANNING_PARTIAL);
  const colorOrder = options.colorOrder ?? [];
  const monthGroups = groupByMonth(reports, language, options.weekAllocations, colorOrder);
  const template = hbs.compile(indexTemplate);
  return template({
    yearGroups: groupByYear(reports),
    monthGroups,
    overview: buildOverview(reports, monthGroups, options.weekAllocations, colorOrder),
    estimateNote: ESTIMATE_NOTE,
    hasEstimatePage: options.hasEstimatePage === true,
    hasAppEstimates: options.hasAppEstimates === true,
    css: theme.buildCSS(language),
    indexCss: theme.buildIndexCSS(language),
    username,
    avatarUrl: pageData?.avatarUrl,
    profile: pageData?.profile,
    displayName: pageData?.profile?.name ?? username,
    siteTitle: resolvedSiteTitle,
    siteTitleInline,
    description,
    ogImageUrl,
    baseUrl,
    repoUrl,
    lang: language,
    weeklyReports: locale.weeklyReports,
    poweredBy: locale.poweredBy,
    generatedWith: locale.generatedWith,
    monoFamily: fontConfig.monoFamily,
    accentColor: theme.colors.accent,
    themeInitScript: theme.themeInitScript ?? "",
    themeToggleScript: theme.themeToggleScript ?? "",
  });
};

export const buildReportEntry = (
  path: string,
  title?: string,
  subtitle?: string,
  stats?: ReportEntryStats,
  dateTo?: string,
  overview?: string,
): ReportEntry => {
  const [year, month, day] = path.split("/");
  const date = year && month && day ? new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))) : null;
  return {
    path,
    week: path.split("/").slice(1).join("-") || path,
    year: year ?? "",
    title,
    subtitle,
    overview,
    dateLabel: pathToDateLabel(path),
    dateTo,
    stats,
    dayLabel: day,
    weekdayLabel: date ? new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(date) : undefined,
  };
};
