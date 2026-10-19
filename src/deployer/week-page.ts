// Generate weeks/YYYY-MM-DD/index.html: one Thu–Wed work week with its allocation panel and day jump.

import Handlebars from "handlebars";
import type { Language, Theme } from "../types.js";
import { getLocale } from "../i18n/index.js";
import { loadTheme, readThemeTemplate } from "../renderer/themes/index.js";
import { buildAllocationView, type AllocationInput } from "../renderer/allocation-view.js";

export type WeekPageDay = {
  date: string;
  /** Relative to the week page, e.g. "../../2026/10/01/". */
  href: string;
  /** "Thu Oct 1". */
  label: string;
  title?: string;
};

export type WeekPageLink = { href: string; label: string };

export type WeekPageData = {
  /** The Thursday, YYYY-MM-DD. */
  id: string;
  /** "Oct 1-7". */
  label: string;
  from: string;
  to: string;
  open: boolean;
  monthLabel: string;
  /** Anchor of the month on the homepage, e.g. "month-2026-10". */
  monthAnchor: string;
  /** Oldest first. */
  days: WeekPageDay[];
  prev?: WeekPageLink;
  next?: WeekPageLink;
  allocation?: AllocationInput;
};

export type WeekPageOptions = {
  language?: Language;
  siteTitle?: string;
  baseUrl?: string;
  themeName?: Theme;
  username?: string;
  avatarUrl?: string;
};

const PARTIALS = ["allocation", "allocation-panel", "allocation-item", "footer"];

export const renderWeekPage = (data: WeekPageData, options: WeekPageOptions = {}): string => {
  const language = options.language ?? "en";
  const theme = loadTheme(options.themeName ?? "brutalist");
  const hbs = Handlebars.create();
  for (const name of PARTIALS) hbs.registerPartial(name, readThemeTemplate(theme, `partials/${name}.hbs`));
  const template = hbs.compile(readThemeTemplate(theme, "week-page.hbs"));
  const siteTitle = (options.siteTitle ?? "Dev\nPulse").replace(/\\n/g, "\n");
  const baseUrl = options.baseUrl?.replace(/\/+$/, "") ?? "";
  const suffix = data.open ? " (so far)" : "";
  return template({
    ...data,
    allocation: buildAllocationView(data.allocation),
    css: theme.buildCSS(language),
    lang: language,
    i18n: getLocale(language),
    rootPrefix: "../../",
    baseUrl,
    canonicalUrl: baseUrl ? `${baseUrl}/weeks/${data.id}/` : undefined,
    description: `Work delivered in the work week of ${data.label}${suffix}`,
    siteTitle,
    siteTitleInline: siteTitle.replace(/\n/g, " "),
    themeColor: theme.colors.bg,
    avatarUrl: options.avatarUrl,
    username: options.username,
    themeInitScript: theme.themeInitScript ?? "",
    themeToggleScript: theme.themeToggleScript ?? "",
  });
};
