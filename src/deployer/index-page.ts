// Generate the index.html that lists all archived reports

import Handlebars from "handlebars";
import type { Language, Theme, UserProfile } from "../types.js";
import { getLocale, getFontConfig } from "../i18n/index.js";
import { loadTheme, readThemeTemplate } from "../renderer/themes/index.js";

export type IndexPageData = {
  username?: string;
  avatarUrl?: string;
  profile?: UserProfile;
};

export type ReportEntryStats = {
  commits: number;
  prs: number;
  reviews: number;
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

type MonthGroup = {
  key: string;
  label: string;
  year: string;
  reports: ReportEntry[];
  stats: ReportEntryStats;
};

type ArchiveOverview = {
  reportCount: number;
  commits: number;
  prs: number;
  reviews: number;
  rangeLabel: string;
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

const reportActivity = (report: ReportEntry): number =>
  (report.stats?.commits ?? 0) + (report.stats?.prs ?? 0) * 3 + (report.stats?.reviews ?? 0) * 2;

const enrichActivity = (reports: ReportEntry[]): ReportEntry[] => {
  const max = Math.max(...reports.map(reportActivity), 1);
  return reports.map((report) => ({
    ...report,
    activityPercent: Math.max(4, Math.round((reportActivity(report) / max) * 100)),
  }));
};

const groupByMonth = (reports: ReportEntry[], language: Language): MonthGroup[] => {
  const groups = new Map<string, ReportEntry[]>();
  enrichActivity(
    [...reports]
      .filter((report) => /^\d{4}\/\d{2}\/\d{2}$/.test(report.path))
      .sort((a, b) => b.path.localeCompare(a.path)),
  ).forEach((report) => {
    const key = report.path.split("/").slice(0, 2).join("/");
    groups.set(key, [...(groups.get(key) ?? []), report]);
  });
  return [...groups.entries()].map(([key, monthReports]) => {
    const [year, month] = key.split("/").map(Number);
    const label = new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, 1)));
    return {
      key,
      label,
      year: String(year),
      reports: monthReports,
      stats: monthReports.reduce<ReportEntryStats>((total, report) => ({
        commits: total.commits + (report.stats?.commits ?? 0),
        prs: total.prs + (report.stats?.prs ?? 0),
        reviews: total.reviews + (report.stats?.reviews ?? 0),
      }), { commits: 0, prs: 0, reviews: 0 }),
    };
  });
};

const buildOverview = (reports: ReportEntry[]): ArchiveOverview => {
  const sorted = [...reports].sort((a, b) => a.path.localeCompare(b.path));
  const totals = reports.reduce((total, report) => ({
    commits: total.commits + (report.stats?.commits ?? 0),
    prs: total.prs + (report.stats?.prs ?? 0),
    reviews: total.reviews + (report.stats?.reviews ?? 0),
  }), { commits: 0, prs: 0, reviews: 0 });
  return {
    reportCount: reports.length,
    ...totals,
    rangeLabel: sorted.length > 0
      ? `${sorted[0].dateLabel} — ${sorted[sorted.length - 1].dateLabel}`
      : "No reports yet",
  };
};

export const renderIndexPage = (
  reports: ReportEntry[],
  pageData?: IndexPageData,
  language: Language = "en",
  siteTitle?: string,
  baseUrl?: string,
  repoUrl?: string,
  themeName: Theme = "brutalist",
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
  const template = Handlebars.compile(indexTemplate);
  return template({
    yearGroups: groupByYear(reports),
    monthGroups: groupByMonth(reports, language),
    overview: buildOverview(reports),
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
