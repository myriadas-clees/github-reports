// render command: read github-data.yaml + llm-data.yaml and produce HTML

import { Command } from "commander";
import { readFile, writeFile, readdir, mkdir, access, cp } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { renderReport } from "../../renderer/index.js";
import { renderEstimatePage } from "../../deployer/estimate-page.js";
import { renderIndexPage, buildReportEntry, type ReportEntry } from "../../deployer/index-page.js";
import { resolveDayId } from "../../deployer/day.js";
import { getWeekId } from "../../deployer/week.js";
import { parseLocalDate } from "../../collector/date-range.js";
import { generateOGImage, generateIndexOGImage } from "../../renderer/og-image.js";
import { generateCard, generateDarkCard } from "../../renderer/card.js";
import { buildRSSFeed } from "../../renderer/rss.js";
import { assertNoSecretsInHtml, loadConfigFile, resolveConfig } from "../../config.js";
import { applyHoursEstimate } from "../../collector/estimate-hours.js";
import type {
  AIContent,
  Allocation,
  EvidenceLedger,
  AllocationConfig,
  Language,
  ManualTimeEntry,
  Theme,
  WeeklyReportData,
} from "../../types.js";
import {
  DEFAULT_ALLOCATION_CONFIG,
  buildAllocationTrend,
  computeAllocation,
  weekEnd,
  weekStart,
} from "../../collector/allocation.js";
import { formatShortWeekTitle } from "../../collector/stakeholder-summary.js";
import { renderWeekPage, type WeekPageData } from "../../deployer/week-page.js";
import { dailyPathToDate, isWeekOpen, weekMonthKey, weekPagePath, workWeekOf } from "../../deployer/work-weeks.js";
import { type AllocationInput } from "../../renderer/allocation-view.js";
import { annotateAllocation } from "../../collector/readiness.js";
import { readEvidenceLedger } from "../../collector/evidence-ledger.js";
import { buildEstimateCalibration, type EstimateCalibration } from "../../collector/estimate-calibration.js";
import { buildEstimateCalculatorView } from "../../renderer/estimate-view.js";
import { AVAILABLE_THEMES } from "../../renderer/themes/index.js";

/** Prefer current formula from hoursInputs; fall back to stored estimate. */
export const withRecomputedHours = (data: WeeklyReportData): WeeklyReportData =>
  data.hoursInputs ? applyHoursEstimate(data) : data; // structural HoursBearing

const env = (key: string): string | undefined => process.env[key];
const __dirname = dirname(fileURLToPath(import.meta.url));
const brandAssetsSrc = resolve(__dirname, "../../../assets/brand");

export type RenderCommandOptions = {
  dataDir: string;
  outputDir: string;
  baseUrl: string;
  siteTitle?: string;
  language: Language;
  timezone: string;
  theme: Theme;
  date?: Date;
  mode?: "daily" | "weekly";
  /** Initiative mapping + trend window for the "Where the effort went" section. */
  allocation?: AllocationConfig;
  /** Self-reported time folded into the allocation. */
  manualTime?: ManualTimeEntry[];
};

const DAILY_PATH = /^\d{4}\/\d{2}\/\d{2}$/;

const fileExists = async (path: string): Promise<boolean> => {
  try { await access(path); return true; } catch { return false; }
};

const listCompletedReportDirs = async (dir: string): Promise<string[]> => {
  const paths: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return paths;
  }
  for (const year of entries.filter((n) => /^\d{4}$/.test(n))) {
    const months = await readdir(join(dir, year));
    for (const week of months.filter((n) => /^W\d{2}$/.test(n))) {
      if (await fileExists(join(dir, year, week, "llm-data.yaml"))) paths.push(`${year}/${week}`);
    }
    for (const month of months.filter((n) => /^\d{2}$/.test(n))) {
      const days = await readdir(join(dir, year, month));
      for (const day of days.filter((n) => /^\d{2}$/.test(n))) {
        if (await fileExists(join(dir, year, month, day, "llm-data.yaml"))) {
          paths.push(`${year}/${month}/${day}`);
        }
      }
    }
  }
  return paths;
};

const tryReadYaml = async <T>(path: string): Promise<T | null> => {
  try {
    const raw = await readFile(path, "utf-8");
    return parseYaml(raw) as T;
  } catch {
    return null;
  }
};

const buildReportEntries = async (
  dataDir: string,
  reportPaths: string[],
): Promise<ReportEntry[]> => {
  const entries = await Promise.all(
    reportPaths.map(async (path) => {
      const [llmData, ghData] = await Promise.all([
        tryReadYaml<AIContent>(join(dataDir, path, "llm-data.yaml")),
        tryReadYaml<WeeklyReportData>(join(dataDir, path, "github-data.yaml")),
      ]);
      if (!llmData) return null;
      const hoursData = ghData ? withRecomputedHours(ghData) : null;
      const stats = hoursData ? {
        commits: hoursData.stats.totalCommits,
        prs: hoursData.stats.prsOpened,
        reviews: hoursData.stats.prsReviewed,
        hours: hoursData.stats.estimatedHours ?? hoursData.hoursEstimate?.hours ?? 0,
      } : undefined;
      const dateTo = ghData?.dateRange?.to;
      return buildReportEntry(path, llmData.title, llmData.subtitle, stats, dateTo, llmData.overview);
    }),
  );
  return entries.filter((e): e is ReportEntry => e !== null);
};

/** Keep legacy weekly fixtures and archives renderable after newer collectors add fields. */
export const normalizeReportData = (data: WeeklyReportData): WeeklyReportData => ({
  ...data,
  commitMessages: data.commitMessages ?? [],
  releases: data.releases ?? [],
  externalContributions: data.externalContributions ?? [],
});

/**
 * Build the allocation input (day / 8-week trend, or the report itself in weekly mode).
 * Daily mode: trend covers all daily reports up to and including `current.date`.
 * Weekly mode: only `week` is set (the report itself).
 * Never throws; a bug here must not block a report.
 */
export const buildAllocationInput = (params: {
  mode?: "daily" | "weekly";
  current: { date: string; data: WeeklyReportData };
  /** Daily reports keyed by YYYY-MM-DD (may include `current`). */
  dailyReports: ReadonlyMap<string, WeeklyReportData>;
  config?: AllocationConfig;
  manualTime?: ManualTimeEntry[];
  colorOrder?: string[];
  /** Evidence ledger (data/evidence.yaml); null/absent degrades to "not collected". */
  evidence?: EvidenceLedger | null;
}): AllocationInput | undefined => {
  try {
    const config = params.config ?? DEFAULT_ALLOCATION_CONFIG;
    const manual = params.manualTime ?? [];
    const annotate = (a: Allocation): Allocation => annotateAllocation(a, params.evidence ?? null, config.systems);
    const prepare = (d: WeeklyReportData): WeeklyReportData =>
      withRecomputedHours(normalizeReportData(d));
    const currentData = prepare(params.current.data);

    if (params.mode === "weekly") {
      const allocation = annotate(computeAllocation(currentData, config, manual));
      const { from, to } = currentData.dateRange;
      return { week: { label: `${from} – ${to}`, allocation }, colorOrder: params.colorOrder };
    }

    const date = params.current.date;
    const reports = new Map<string, WeeklyReportData>();
    for (const [d, data] of params.dailyReports) {
      if (d < date) reports.set(d, prepare(data));
    }
    reports.set(date, currentData);
    const list = [...reports.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, data]) => ({ date: d, data }));

    const rawTrend = buildAllocationTrend(list, date, config, manual);
    const trend = { ...rawTrend, periods: rawTrend.periods.map((p) => ({ ...p, allocation: annotate(p.allocation) })) };
    // The whole-week breakdown lives on the week page; daily pages show only their day + trend.
    return {
      day: annotate(computeAllocation(currentData, config, manual)),
      asOf: date,
      colorOrder: params.colorOrder,
      trend,
    };
  } catch (error) {
    console.warn(
      `Skipping allocation section: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
};

/** Initiatives by total work delivered across every daily report: one color per initiative site-wide. */
/** Window (days before the latest report) whose initiatives get colors first. */
export const COLOR_RECENT_DAYS = 56;

export const buildInitiativeColorOrder = (
  dailyReports: ReadonlyMap<string, WeeklyReportData>,
  config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG,
  manualTime: ManualTimeEntry[] = [],
): string[] => {
  try {
    // Palette slots go to initiatives that are large either recently or overall, so
    // neither current work nor the biggest all-time initiatives fold into gray "Other".
    const dates = [...dailyReports.keys()].sort();
    const latest = dates.at(-1) ?? "";
    const recentFrom = latest
      ? new Date(Date.parse(`${latest.slice(0, 10)}T00:00:00Z`) - COLOR_RECENT_DAYS * 86_400_000).toISOString().slice(0, 10)
      : "";
    const totals = new Map<string, number>();
    const recent = new Map<string, number>();
    for (const [date, data] of dailyReports) {
      const allocation = computeAllocation(withRecomputedHours(normalizeReportData(data)), config, manualTime);
      for (const b of allocation.initiatives) {
        totals.set(b.initiative, (totals.get(b.initiative) ?? 0) + b.hours);
        if (date.slice(0, 10) > recentFrom) recent.set(b.initiative, (recent.get(b.initiative) ?? 0) + b.hours);
      }
    }
    const sum = (m: Map<string, number>): number => [...m.values()].reduce((t, h) => t + h, 0) || 1;
    const allTotal = sum(totals);
    const recentTotal = sum(recent);
    const score = (name: string): number =>
      Math.max((recent.get(name) ?? 0) / recentTotal, totals.get(name)! / allTotal);
    return [...totals.keys()].sort((a, b) => score(b) - score(a) || totals.get(b)! - totals.get(a)! || a.localeCompare(b));
  } catch {
    return [];
  }
};

/**
 * Allocation (week panel + 8-week trend ending at that week) for every Thu–Wed work week
 * that has at least one daily report, keyed by the Thursday (YYYY-MM-DD). A week still
 * running is "so far": it ends at the latest report. Never throws.
 */
export const buildWeekAllocationInputs = (params: {
  /** Daily reports keyed by YYYY-MM-DD. */
  dailyReports: ReadonlyMap<string, WeeklyReportData>;
  config?: AllocationConfig;
  manualTime?: ManualTimeEntry[];
  colorOrder?: string[];
  /** Evidence ledger (data/evidence.yaml); null/absent degrades to "not collected". */
  evidence?: EvidenceLedger | null;
}): Map<string, AllocationInput> => {
  const result = new Map<string, AllocationInput>();
  try {
    const config = params.config ?? DEFAULT_ALLOCATION_CONFIG;
    const manual = params.manualTime ?? [];
    const annotate = (a: Allocation): Allocation => annotateAllocation(a, params.evidence ?? null, config.systems);
    const list = [...params.dailyReports.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, data: withRecomputedHours(normalizeReportData(data)) }));
    const latest = list.at(-1)?.date;
    if (!latest) return result;
    // Weeks with only self-reported time (no daily report) still need an allocation, so seed them from manual entries.
    const manualWeeks = manual
      .filter((entry) => entry.hours > 0 && entry.date <= latest)
      .map((entry) => weekStart(entry.date));
    for (const id of new Set([...list.map(({ date }) => weekStart(date)), ...manualWeeks])) {
      try {
        const endDate = weekEnd(id) < latest ? weekEnd(id) : latest;
        const trend = buildAllocationTrend(list.filter(({ date }) => date <= endDate), endDate, config, manual);
        const annotated = { ...trend, periods: trend.periods.map((p) => ({ ...p, allocation: annotate(p.allocation) })) };
        const period = annotated.periods.find((p) => p.id === id);
        if (!period) continue;
        result.set(id, {
          week: { label: period.label, allocation: period.allocation },
          asOf: endDate,
          colorOrder: params.colorOrder,
          trend: annotated,
        });
      } catch (error) {
        console.warn(`Skipping week ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    console.warn(`Skipping week allocations: ${error instanceof Error ? error.message : String(error)}`);
  }
  return result;
};

export const sortReportPathsChronologically = (
  paths: string[],
  reportDates: ReadonlyMap<string, string>,
): string[] => [...paths].sort((a, b) => {
  const dailyDate = (path: string) => /^\d{4}\/\d{2}\/\d{2}$/.test(path) ? path.replaceAll("/", "-") : undefined;
  const dateA = dailyDate(a) ?? reportDates.get(a);
  const dateB = dailyDate(b) ?? reportDates.get(b);
  if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;
  return a.localeCompare(b);
});

const WEEK_MONTH = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEK_DAY = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Write weeks/YYYY-MM-DD/index.html for every work week with a daily report or an allocation
 * (self-reported time only); returns the week ids (oldest first).
 */
const writeWeekPages = async (params: {
  entries: ReportEntry[];
  weekAllocations: ReadonlyMap<string, AllocationInput>;
  outputDir: string;
  baseUrl: string;
  language: Language;
  siteTitle?: string;
  theme: Theme;
  username: string;
  avatarUrl?: string;
}): Promise<string[]> => {
  const daily = params.entries
    .flatMap((entry) => { const date = dailyPathToDate(entry.path); return date ? [{ entry, date }] : []; })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (daily.length === 0) return [];
  const latest = daily.at(-1)!.date;
  const byWeek = new Map<string, typeof daily>();
  for (const item of daily) {
    const id = workWeekOf(item.date).id;
    byWeek.set(id, [...(byWeek.get(id) ?? []), item]);
  }
  const ids = [...new Set([...byWeek.keys(), ...params.weekAllocations.keys()])].sort();
  for (const [index, id] of ids.entries()) {
    const span = workWeekOf(id);
    const monthKey = weekMonthKey(span, latest);
    const [year, month] = monthKey.split("-").map(Number);
    const link = (otherId: string | undefined): WeekPageData["prev"] => otherId
      ? { href: `../${otherId}/`, label: `Work week of ${formatShortWeekTitle(otherId, workWeekOf(otherId).to)}` }
      : undefined;
    const data: WeekPageData = {
      id,
      label: span.label,
      from: span.from,
      to: span.to,
      open: isWeekOpen(span, latest),
      monthLabel: WEEK_MONTH.format(new Date(Date.UTC(year, month - 1, 1))),
      monthAnchor: `month-${monthKey}`,
      days: (byWeek.get(id) ?? []).map(({ entry, date }) => {
        const [y, m, d] = date.split("-").map(Number);
        return {
          date,
          href: `../../${entry.path}/`,
          label: WEEK_DAY.format(new Date(Date.UTC(y, m - 1, d))),
          title: entry.title,
        };
      }),
      prev: link(ids[index - 1]),
      next: link(ids[index + 1]),
      allocation: params.weekAllocations.get(id),
    };
    const html = renderWeekPage(data, {
      language: params.language,
      siteTitle: params.siteTitle,
      baseUrl: params.baseUrl,
      themeName: params.theme,
      username: params.username,
      avatarUrl: params.avatarUrl,
    });
    assertNoSecretsInHtml(html);
    const dir = join(params.outputDir, "weeks", id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html, "utf-8");
  }
  console.log(`Week pages written (${ids.length}).`);
  return ids;
};

/** Render HTML for a day from github-data + llm-data. Throws if data is missing. */
export const runRender = async (options: RenderCommandOptions): Promise<void> => {
  const dayId = options.mode === "weekly"
    ? getWeekId(options.date ?? new Date(), options.timezone)
    : resolveDayId(options.date, options.timezone);
  const dataWeekDir = join(options.dataDir, dayId.path);
  const outputWeekDir = join(options.outputDir, dayId.path);

  const githubDataPath = join(dataWeekDir, "github-data.yaml");
  console.log(`Reading ${githubDataPath}...`);
  const githubData = await tryReadYaml<WeeklyReportData>(githubDataPath);
  if (!githubData) {
    throw new Error(`GitHub data not found at ${githubDataPath}. Run 'fetch' or 'report' first.`);
  }

  const llmDataPath = join(dataWeekDir, "llm-data.yaml");
  const aiContent = await tryReadYaml<AIContent>(llmDataPath);
  if (!aiContent) {
    throw new Error(`LLM data not found at ${llmDataPath}. Run 'generate' or 'report' first.`);
  }
  console.log("Loaded LLM data.");

  const data: WeeklyReportData = {
    ...withRecomputedHours(normalizeReportData(githubData)),
    aiContent,
  };

  // Determine previous/next report paths for internal linking.
  let allPaths = await listCompletedReportDirs(options.dataDir);
  if (options.mode !== "weekly") {
    allPaths = allPaths.filter((path) => /^\d{4}\/\d{2}\/\d{2}$/.test(path));
  }
  if (!allPaths.includes(dayId.path)) allPaths.push(dayId.path);
  const reportDates = new Map<string, string>([[dayId.path, githubData.dateRange.to]]);
  // Raw github-data of every other report, kept for the allocation trend / previous-report re-render.
  const loadedReports = new Map<string, WeeklyReportData>();
  await Promise.all(allPaths.filter((path) => path !== dayId.path).map(async (path) => {
    const report = await tryReadYaml<WeeklyReportData>(join(options.dataDir, path, "github-data.yaml"));
    if (report) loadedReports.set(path, report);
    if (report?.dateRange?.to) reportDates.set(path, report.dateRange.to);
  }));
  const dailyReports = new Map<string, WeeklyReportData>();
  for (const [path, report] of loadedReports) {
    if (DAILY_PATH.test(path)) dailyReports.set(path.replaceAll("/", "-"), report);
  }
  // Every daily report, including the one being rendered.
  const allDailyReports = new Map(dailyReports);
  if (DAILY_PATH.test(dayId.path)) allDailyReports.set(dayId.path.replaceAll("/", "-"), githubData);
  const colorOrder = buildInitiativeColorOrder(allDailyReports, options.allocation, options.manualTime);
  const evidence = await readEvidenceLedger(options.dataDir).catch(() => null);
  const allocationFor = (path: string, report: WeeklyReportData): AllocationInput | undefined =>
    buildAllocationInput({
      colorOrder,
      mode: options.mode,
      current: { date: path.replaceAll("/", "-"), data: report },
      dailyReports,
      config: options.allocation,
      manualTime: options.manualTime,
      evidence,
    });
  /** Link from a daily page to its Thu–Wed work-week page. */
  const weekLinkFor = (path: string, prefix: string): { href: string; label: string } | undefined => {
    const date = dailyPathToDate(path);
    if (!date) return undefined;
    const week = workWeekOf(date);
    return { href: `${prefix}${weekPagePath(week.id)}`, label: week.label };
  };
  allPaths = sortReportPathsChronologically(allPaths, reportDates);
  const currentIdx = allPaths.indexOf(dayId.path);
  const prevWeek = currentIdx > 0 ? allPaths[currentIdx - 1] : undefined;
  const nextWeek = currentIdx < allPaths.length - 1 ? allPaths[currentIdx + 1] : undefined;

  const base = options.baseUrl.replace(/\/+$/, "");

  const rootPrefix = "../".repeat(dayId.path.split("/").length);

  // Brand assets for Myriad logo in nav.
  const brandOut = join(options.outputDir, "assets", "brand");
  await mkdir(brandOut, { recursive: true });
  try {
    await cp(brandAssetsSrc, brandOut, { recursive: true });
  } catch {
    console.warn(`Brand assets not found at ${brandAssetsSrc}; logo may be missing.`);
  }

  console.log(`Rendering report (lang: ${options.language}, theme: ${options.theme})...`);
  const html = renderReport(data, {
    language: options.language,
    timezone: options.timezone,
    baseUrl: base,
    weekPath: dayId.path,
    rootPrefix,
    siteTitle: options.siteTitle,
    theme: options.theme,
    prevWeek: prevWeek ? `${rootPrefix}${prevWeek}/` : undefined,
    nextWeek: nextWeek ? `${rootPrefix}${nextWeek}/` : undefined,
    allocation: allocationFor(dayId.path, data),
    weekLink: weekLinkFor(dayId.path, rootPrefix),
  });

  await mkdir(outputWeekDir, { recursive: true });
  assertNoSecretsInHtml(html);
  const reportPath = join(outputWeekDir, "index.html");
  await writeFile(reportPath, html, "utf-8");
  console.log(`Report written to ${reportPath}`);

  // Re-render the previous report so its "next day" link points here.
  if (prevWeek) {
    const prevGhData = await tryReadYaml<WeeklyReportData>(join(options.dataDir, prevWeek, "github-data.yaml"));
    const prevAiContent = await tryReadYaml<AIContent>(join(options.dataDir, prevWeek, "llm-data.yaml"));
    if (prevGhData && prevAiContent) {
      const prevData = withRecomputedHours(normalizeReportData(prevGhData));
      const prevIdx = currentIdx - 1;
      const prevPrev = prevIdx > 0 ? allPaths[prevIdx - 1] : undefined;
      const prevHtml = renderReport({ ...prevData, aiContent: prevAiContent }, {
        language: options.language,
        timezone: options.timezone,
        baseUrl: base,
        weekPath: prevWeek,
        rootPrefix: "../".repeat(prevWeek.split("/").length),
        siteTitle: options.siteTitle,
        theme: options.theme,
        prevWeek: prevPrev ? `${"../".repeat(prevWeek.split("/").length)}${prevPrev}/` : undefined,
        nextWeek: `${"../".repeat(prevWeek.split("/").length)}${dayId.path}/`,
        allocation: allocationFor(prevWeek, prevData),
        weekLink: weekLinkFor(prevWeek, "../".repeat(prevWeek.split("/").length)),
      });
      const prevOutputDir = join(options.outputDir, prevWeek);
      await mkdir(prevOutputDir, { recursive: true });
      await writeFile(join(prevOutputDir, "index.html"), prevHtml, "utf-8");
      console.log(`Updated previous report (${prevWeek}) with next-report link.`);
    }
  }

  // Generate OG image
  const ogImage = await generateOGImage({
    title: aiContent.title,
    subtitle: aiContent.subtitle,
    username: githubData.username,
    dateRange: `${githubData.dateRange.from} - ${githubData.dateRange.to}`,
    language: options.language,
    stats: {
      commits: githubData.stats.totalCommits,
      prs: githubData.stats.prsOpened,
      reviews: githubData.stats.prsReviewed,
    },
  });
  const ogPath = join(outputWeekDir, "og.png");
  await writeFile(ogPath, ogImage);
  console.log(`OG image written to ${ogPath}`);

  // Generate animated SVG summary cards (light + dark)
  const dateRange = `${githubData.dateRange.from} – ${githubData.dateRange.to}`;
  const cardData = {
    username: githubData.username,
    weekLabel: "date" in dayId ? dayId.date : dayId.path.split("/").at(-1)!,
    dateRange,
    title: aiContent.title,
    summaries: aiContent.summaries,
    ticker: aiContent.ticker,
    reportUrl: `${base}/${dayId.path}/`,
  };
  const cardSvg = generateCard(cardData);
  const cardDarkSvg = generateDarkCard(cardData);
  const cardPath = join(options.outputDir, "card.svg");
  const cardDarkPath = join(options.outputDir, "card-dark.svg");
  await Promise.all([
    writeFile(cardPath, cardSvg, "utf-8"),
    writeFile(cardDarkPath, cardDarkSvg, "utf-8"),
  ]);
  console.log(`SVG cards written to ${cardPath} and ${cardDarkPath}`);

  // Write index page with titles from each day's report data.
  const entries = await buildReportEntries(options.dataDir, allPaths);
  const ghRepo = env("GITHUB_REPOSITORY");
  const repoUrl = ghRepo ? `https://github.com/${ghRepo}` : undefined;
  let calculator: EstimateCalibration | undefined;
  if (options.mode !== "weekly") {
    try {
      calculator = buildEstimateCalibration(
        new Map([...allDailyReports].map(([date, data]) => [date, normalizeReportData(data)])),
        options.allocation ?? DEFAULT_ALLOCATION_CONFIG,
      );
    } catch (error) {
      console.warn(`Skipping estimate calculator: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Same source as the estimate page's calculator, so the homepage never advertises an app estimate the page lacks.
  const calculatorView = buildEstimateCalculatorView(calculator);
  const estimateHtml = renderEstimatePage(calculator, {
    username: githubData.username,
    language: options.language,
    siteTitle: options.siteTitle,
    baseUrl: base,
    themeName: options.theme,
  });
  if (estimateHtml) {
    assertNoSecretsInHtml(estimateHtml);
    const estimateDir = join(options.outputDir, "estimate");
    await mkdir(estimateDir, { recursive: true });
    await writeFile(join(estimateDir, "index.html"), estimateHtml, "utf-8");
    console.log(`Estimate page written to ${join(estimateDir, "index.html")}`);
  }

  // One page per Thu–Wed work week that has at least one daily report.
  const weekAllocations = options.mode === "weekly"
    ? new Map<string, AllocationInput>()
    : buildWeekAllocationInputs({
      dailyReports: allDailyReports,
      config: options.allocation,
      manualTime: options.manualTime,
      colorOrder,
      evidence,
    });
  const weekIds = await writeWeekPages({
    entries,
    weekAllocations,
    outputDir: options.outputDir,
    baseUrl: base,
    language: options.language,
    siteTitle: options.siteTitle,
    theme: options.theme,
    username: githubData.username,
    avatarUrl: githubData.avatarUrl,
  });

  const indexHtml = renderIndexPage(
    entries,
    { username: githubData.username, avatarUrl: githubData.avatarUrl, profile: githubData.profile },
    options.language,
    options.siteTitle,
    base,
    repoUrl,
    options.theme,
    {
      hasEstimatePage: estimateHtml !== undefined && estimateHtml !== null,
      hasAppEstimates: calculatorView?.hasApps === true,
      colorOrder,
      weekAllocations: new Map(
        [...weekAllocations].flatMap(([id, input]) => (input.week ? [[id, input.week.allocation] as const] : [])),
      ),
    },
  );
  const indexPath = join(options.outputDir, "index.html");
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(indexPath, indexHtml, "utf-8");
  console.log(`Index written to ${indexPath}`);

  // Generate index OG image
  const resolvedSiteTitle = (options.siteTitle ?? "Dev Pulse").replace(/\\n/g, " ");
  const indexOGImage = await generateIndexOGImage({
    siteTitle: resolvedSiteTitle,
    username: githubData.username,
    language: options.language,
    reportCount: allPaths.length,
  });
  const indexOGPath = join(options.outputDir, "og.png");
  await writeFile(indexOGPath, indexOGImage);
  console.log(`Index OG image written to ${indexOGPath}`);

  // Generate sitemap.xml
  const sitemapEntries = [...allPaths, ...weekIds.map(weekPagePath)]
    .map((p) => `  <url><loc>${base}/${p.replace(/\/$/, "")}/</loc></url>`)
    .join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/</loc></url>${estimateHtml ? `\n  <url><loc>${base}/estimate/</loc></url>` : ""}
${sitemapEntries}
</urlset>`;
  const sitemapPath = join(options.outputDir, "sitemap.xml");
  await writeFile(sitemapPath, sitemap, "utf-8");
  console.log(`Sitemap written to ${sitemapPath}`);

  // Generate RSS feed
  const rssFeed = buildRSSFeed(entries, {
    title: resolvedSiteTitle,
    link: base,
    description: `Daily reports by @${githubData.username}`,
    language: options.language,
    timezone: options.timezone,
  });
  const feedPath = join(options.outputDir, "feed.xml");
  await writeFile(feedPath, rssFeed, "utf-8");
  console.log(`RSS feed written to ${feedPath}`);

  // Generate robots.txt
  const robots = `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
  const robotsPath = join(options.outputDir, "robots.txt");
  await writeFile(robotsPath, robots, "utf-8");
  console.log(`robots.txt written to ${robotsPath}`);

  // Generate CNAME for custom domains (not *.github.io)
  const hostname = new URL(base).hostname;
  if (!hostname.endsWith(".github.io")) {
    const cnamePath = join(options.outputDir, "CNAME");
    await writeFile(cnamePath, hostname + "\n", "utf-8");
    console.log(`CNAME written to ${cnamePath}`);
  }
};

export const registerRender = (program: Command): void => {
  program
    .command("render")
    .description("Render HTML report from fetched data and LLM content")
    .option("--data-dir <dir>", "Data directory (env: DATA_DIR, default: ./data)")
    .option("-o, --output-dir <dir>", "Output directory for HTML (env: OUTPUT_DIR, default: ./output)")
    .option("--base-url <url>", "Base URL for absolute links in OG tags, sitemap, RSS feed, canonical (env: BASE_URL)")
    .option("--site-title <title>", "Site title for nav header (env: SITE_TITLE, default: Worklog)")
    .option("--language <lang>", "Report language: en, ja, zh-CN, zh-TW, ko, es, fr, de, pt, ru (env: LANGUAGE, default: en)")
    .option("--timezone <tz>", "IANA timezone (env: TIMEZONE, default: UTC)")
    .option("--theme <name>", `Theme name: ${AVAILABLE_THEMES.join(", ")} (env: THEME, default: brutalist)`)
    .option("--date <date>", "Report date (YYYY-MM-DD, default: previous workday)")
    .option("--mode <mode>", "Archive mode: daily or weekly (env: REPORT_MODE, default: daily)")
    .option("--config <path>", "Path to config.yaml (env: CONFIG_PATH)")
    .action(async (opts) => {
      try {
        const baseUrl = opts.baseUrl ?? env("BASE_URL");
        if (!baseUrl) throw new Error("Base URL required. Pass --base-url or set BASE_URL (e.g. https://user.github.io/repo).");
        const mode = opts.mode ?? env("REPORT_MODE") ?? "daily";
        if (mode !== "daily" && mode !== "weekly") throw new Error(`Unknown report mode "${mode}". Use daily or weekly.`);

        const fileCfg = await loadConfigFile(opts.config ?? env("CONFIG_PATH"));
        const cfg = resolveConfig(fileCfg, {
          username: env("GITHUB_USERNAME"),
          timezone: opts.timezone ?? env("TIMEZONE"),
          language: opts.language ?? env("LANGUAGE"),
          theme: opts.theme ?? env("THEME"),
          siteTitle: opts.siteTitle ?? env("SITE_TITLE"),
          dataDir: opts.dataDir ?? env("DATA_DIR"),
          outputDir: opts.outputDir ?? env("OUTPUT_DIR"),
        });

        const theme = cfg.theme;
        if (!AVAILABLE_THEMES.includes(theme)) {
          throw new Error(`Unknown theme "${theme}". Available: ${AVAILABLE_THEMES.join(", ")}`);
        }

        const options: RenderCommandOptions = {
          dataDir: opts.dataDir ?? cfg.dataDir,
          outputDir: opts.outputDir ?? cfg.outputDir,
          baseUrl,
          siteTitle: opts.siteTitle ?? env("SITE_TITLE") ?? cfg.siteTitle,
          language: (opts.language ?? cfg.language) as Language,
          timezone: opts.timezone ?? cfg.timezone,
          theme,
          date: opts.date ? parseLocalDate(opts.date, opts.timezone ?? cfg.timezone) : undefined,
          mode,
          allocation: cfg.allocation,
          manualTime: cfg.manualTime,
        };
        await runRender(options);
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
};
