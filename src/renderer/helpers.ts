// Handlebars custom helpers

import Handlebars from "handlebars";
import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { RepositoryActivity, Language } from "../types.js";
import { getLocale, formatNumber as fmtNumber } from "../i18n/index.js";
import { parseLocalDate } from "../collector/date-range.js";

const sanitize = (html: string): string =>
  sanitizeHtml(html, {
    // Marked output + img; keep defaults so headings/lists/pre/blockquote stay allowed
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
      code: ["class"],
      pre: ["class"],
    },
  });

const externalLinkRenderer = {
  link({ href, text }: { href: string; text: string }): string {
    const escaped = href.replace(/"/g, "&quot;");
    return `<a href="${escaped}" target="_blank" rel="noopener nofollow">${text}</a>`;
  },
};

const marked = new Marked({ renderer: externalLinkRenderer });

/** Match `+N -N` / `+N −N` line-change pairs in highlight meta strings. */
const LINE_STATS_RE = /([+＋]\d+)\s+([−\-－]\d+)/g;

/**
 * Escape highlight meta and wrap `+N` / `−N` (or `-N`) pairs in activity
 * add/del color classes so Highlights match Activity PR row styling.
 */
export const colorizeLineStats = (text: unknown): Handlebars.SafeString => {
  if (typeof text !== "string" || !text) {
    return new Handlebars.SafeString("");
  }

  let result = "";
  let lastIndex = 0;
  LINE_STATS_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINE_STATS_RE.exec(text)) !== null) {
    result += Handlebars.escapeExpression(text.slice(lastIndex, match.index));
    result += `<span class="activity-pr-add">${Handlebars.escapeExpression(match[1])}</span> <span class="activity-pr-del">${Handlebars.escapeExpression(match[2])}</span>`;
    lastIndex = match.index + match[0].length;
  }
  result += Handlebars.escapeExpression(text.slice(lastIndex));
  return new Handlebars.SafeString(result);
};

export type HelperOptions = {
  language: Language;
  timezone: string;
};

export const registerHelpers = (
  hbs: typeof Handlebars,
  options: HelperOptions = { language: "en", timezone: "UTC" },
): void => {
  const locale = getLocale(options.language);

  hbs.registerHelper("weekLabel", (from: string, to: string): string =>
    `${from} - ${to}`,
  );

  hbs.registerHelper("paragraphs", (text: string): string[] =>
    text.split("\n\n").map((p) => p.trim()).filter(Boolean),
  );

  hbs.registerHelper("fixed", (value: number, digits: number): string =>
    value.toFixed(digits),
  );

  hbs.registerHelper("weekday", (dateStr: string): string => {
    const date = parseLocalDate(dateStr, options.timezone);
    const dayIndex = new Intl.DateTimeFormat("en-US", {
      timeZone: options.timezone,
      weekday: "short",
    }).formatToParts(date).find((p) => p.type === "weekday");
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return locale.weekdaysShort[dayMap[dayIndex?.value ?? "Sun"] ?? 0];
  });

  hbs.registerHelper("formatNumber", (n: number): string =>
    fmtNumber(n, options.language),
  );

  hbs.registerHelper(
    "repoBarWidth",
    (prsOpened: number, repos: RepositoryActivity[]): number => {
      const max = Math.max(...repos.map((r) => r.prsOpened), 1);
      return Math.round((prsOpened / max) * 100);
    },
  );

  hbs.registerHelper(
    "sortReposDesc",
    (repos: RepositoryActivity[]): RepositoryActivity[] =>
      [...repos].sort((a, b) => b.prsOpened - a.prsOpened),
  );

  // i18n formatters (functions that take arguments)
  hbs.registerHelper("sectionsCount", (n: number): string =>
    locale.sectionsCount(n),
  );

  hbs.registerHelper("itemsCount", (n: number): string =>
    locale.itemsCount(n),
  );

  hbs.registerHelper("userWeek", (username: string): string =>
    locale.userWeek(username),
  );

  // Markdown rendering with HTML sanitization
  // All links get target="_blank" rel="noopener nofollow",
  // and sanitize-html strips any dangerous tags (script, iframe, etc.)
  hbs.registerHelper("md", (text: string): Handlebars.SafeString =>
    new Handlebars.SafeString(sanitize(marked.parse(text ?? "") as string)),
  );

  hbs.registerHelper("mdInline", (text: string): Handlebars.SafeString =>
    new Handlebars.SafeString(sanitize(marked.parseInline(text ?? "") as string)),
  );

  hbs.registerHelper("colorizeLineStats", colorizeLineStats);

  // Escape a string for safe embedding inside a JSON-LD <script> block.
  // Prevents breaking out of the JSON string or closing the script tag.
  hbs.registerHelper("jsonLdEscape", (text: string): Handlebars.SafeString => {
    const escaped = JSON.stringify(String(text ?? ""))
      .slice(1, -1) // remove surrounding quotes added by JSON.stringify
      .replace(/<\//g, "<\\/"); // prevent </script> injection
    return new Handlebars.SafeString(escaped);
  });

  hbs.registerHelper("eq", function (this: unknown, a: unknown, b: unknown, opts: Handlebars.HelperOptions) {
    return a === b ? opts.fn(this) : opts.inverse(this);
  });

  hbs.registerHelper("neq", function (this: unknown, a: unknown, b: unknown, opts: Handlebars.HelperOptions) {
    return a !== b ? opts.fn(this) : opts.inverse(this);
  });

  hbs.registerHelper("urlEncode", (text: string): string =>
    encodeURIComponent(String(text ?? "")),
  );

  // Array helpers for magazine-style layouts
  hbs.registerHelper("first", <T>(arr: T[]): T | undefined =>
    Array.isArray(arr) ? arr[0] : undefined,
  );

  hbs.registerHelper("rest", <T>(arr: T[]): T[] =>
    Array.isArray(arr) ? arr.slice(1) : [],
  );

  hbs.registerHelper("isEven", (index: number): boolean =>
    index % 2 === 0,
  );
};
