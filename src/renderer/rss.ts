// RSS 2.0 feed generator for weekly reports

import type { ReportEntry } from "../deployer/index-page.js";
import { buildDayRange, parseLocalDate } from "../collector/date-range.js";

export type RSSChannelOptions = {
  title: string;
  link: string;
  description: string;
  language: string;
  timezone: string; // IANA timezone (e.g. "Asia/Tokyo")
};

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Compute the scheduled publication at 01:00 on the next weekday. Friday's
// completed-workday report is published Monday, not Saturday.
const computePubDate = (dateTo: string, timezone: string): string => {
  const [y, m, d] = dateTo.split("-").map(Number);
  const publication = new Date(Date.UTC(y, m - 1, d + 1));
  while (publication.getUTCDay() === 0 || publication.getUTCDay() === 6) {
    publication.setUTCDate(publication.getUTCDate() + 1);
  }
  const localDate = [
    publication.getUTCFullYear(),
    String(publication.getUTCMonth() + 1).padStart(2, "0"),
    String(publication.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const midnight = buildDayRange(parseLocalDate(localDate, timezone), timezone).from;
  return new Date(midnight.getTime() + 3_600_000).toUTCString();
};

const buildDescription = (entry: ReportEntry): string => {
  const parts: string[] = [];
  if (entry.subtitle) parts.push(entry.subtitle);
  if (entry.overview) parts.push(entry.overview);
  if (entry.stats) {
    const { commits, prs, reviews } = entry.stats;
    parts.push(`Commits: ${commits}, PRs: ${prs}, Reviews: ${reviews}`);
  }
  return escapeXml(parts.join("\n\n"));
};

const buildItem = (entry: ReportEntry, baseUrl: string, timezone: string): string => {
  const link = `${baseUrl}/${entry.path}/`;
  const title = escapeXml(entry.title ?? entry.dateLabel);
  const description = buildDescription(entry);
  const ogImageUrl = `${baseUrl}/${entry.path}/og.png`;
  const pubDate = entry.dateTo
    ? computePubDate(entry.dateTo, timezone)
    : "";

  return [
    "    <item>",
    `      <title>${title}</title>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
    `      <description>${description}</description>`,
    ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
    `      <enclosure url="${escapeXml(ogImageUrl)}" type="image/png" length="0" />`,
    `      <media:content url="${escapeXml(ogImageUrl)}" medium="image" type="image/png" width="1200" height="630" />`,
    "    </item>",
  ].join("\n");
};

export const buildRSSFeed = (
  entries: ReportEntry[],
  channel: RSSChannelOptions,
): string => {
  const sorted = [...entries].sort((a, b) => b.path.localeCompare(a.path));
  const items = sorted.map((e) => buildItem(e, channel.link, channel.timezone)).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">',
    "  <channel>",
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}/</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <language>${escapeXml(channel.language)}</language>`,
    `    <atom:link href="${escapeXml(channel.link)}/feed.xml" rel="self" type="application/rss+xml" />`,
    `    <image>`,
    `      <url>${escapeXml(channel.link)}/og.png</url>`,
    `      <title>${escapeXml(channel.title)}</title>`,
    `      <link>${escapeXml(channel.link)}/</link>`,
    `      <width>1200</width>`,
    `      <height>630</height>`,
    `    </image>`,
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");
};
