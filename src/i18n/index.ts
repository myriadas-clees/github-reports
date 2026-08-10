// Internationalization: locale strings, date/number formatting, LLM instructions

import type { Language } from "../types.js";
import { parseLocalDate } from "../collector/date-range.js";

export { getFontConfig } from "./fonts.js";
export type { FontConfig } from "./fonts.js";

// Static strings that can be used directly in templates
export type LocaleStrings = {
  weekdaysShort: string[];
  sectionSummary: string;
  sectionHighlights: string;
  allWeeks: string;
  prevWeek: string;
  nextWeek: string;
  share: string;
  poweredBy: string;
  generatedWith: string;
  weeklyReports: string;
  weeklyReport: string;
};

// Dynamic strings that require arguments (registered as Handlebars helpers)
export type LocaleFormatters = {
  sectionsCount: (n: number) => string;
  itemsCount: (n: number) => string;
  userWeek: (username: string) => string;
};

export type Locale = LocaleStrings & LocaleFormatters;

// BCP 47 locale tag for Intl APIs
const BCP47: Record<Language, string> = {
  en: "en-US",
  ja: "ja-JP",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  ko: "ko-KR",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-BR",
  ru: "ru-RU",
};

// ---------------------------------------------------------------------------
// Locale definitions
// ---------------------------------------------------------------------------

const en: Locale = {
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  sectionSummary: "Overview",
  sectionHighlights: "Highlights",
  allWeeks: "All days",
  prevWeek: "Previous day",
  nextWeek: "Next day",
  share: "Share",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "Daily Reports",
  weeklyReport: "Daily Report",
  sectionsCount: (n) => `${n} sections`,
  itemsCount: (n) => `${n} items`,
  userWeek: (u) => `${u}'s Day`,
};

const ja: Locale = {
  weekdaysShort: ["日", "月", "火", "水", "木", "金", "土"],
  sectionSummary: "概要",
  sectionHighlights: "ハイライト",
  allWeeks: "すべての日",
  prevWeek: "前日",
  nextWeek: "翌日",
  share: "シェア",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "日次レポート",
  weeklyReport: "日次レポート",
  sectionsCount: (n) => `${n} セクション`,
  itemsCount: (n) => `${n} 件`,
  userWeek: (u) => `${u} の一日`,
};

const zhCN: Locale = {
  weekdaysShort: ["日", "一", "二", "三", "四", "五", "六"],
  sectionSummary: "概览",
  sectionHighlights: "亮点",
  allWeeks: "所有日报",
  prevWeek: "前一天",
  nextWeek: "后一天",
  share: "分享",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "每日报告",
  weeklyReport: "每日报告",
  sectionsCount: (n) => `${n} 个部分`,
  itemsCount: (n) => `${n} 项`,
  userWeek: (u) => `${u} 的一天`,
};

const zhTW: Locale = {
  weekdaysShort: ["日", "一", "二", "三", "四", "五", "六"],
  sectionSummary: "概覽",
  sectionHighlights: "亮點",
  allWeeks: "所有日報",
  prevWeek: "前一天",
  nextWeek: "後一天",
  share: "分享",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "每日報告",
  weeklyReport: "每日報告",
  sectionsCount: (n) => `${n} 個部分`,
  itemsCount: (n) => `${n} 項`,
  userWeek: (u) => `${u} 的一天`,
};

const ko: Locale = {
  weekdaysShort: ["일", "월", "화", "수", "목", "금", "토"],
  sectionSummary: "개요",
  sectionHighlights: "하이라이트",
  allWeeks: "모든 날",
  prevWeek: "전날",
  nextWeek: "다음 날",
  share: "공유",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "일일 보고서",
  weeklyReport: "일일 보고서",
  sectionsCount: (n) => `${n}개 섹션`,
  itemsCount: (n) => `${n}개 항목`,
  userWeek: (u) => `${u}의 하루`,
};

const es: Locale = {
  weekdaysShort: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
  sectionSummary: "Panorama",
  sectionHighlights: "Destacados",
  allWeeks: "Todos los días",
  prevWeek: "Día anterior",
  nextWeek: "Día siguiente",
  share: "Compartir",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "Informes diarios",
  weeklyReport: "Informe diario",
  sectionsCount: (n) => `${n} secciones`,
  itemsCount: (n) => `${n} elementos`,
  userWeek: (u) => `Día de ${u}`,
};

const fr: Locale = {
  weekdaysShort: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"],
  sectionSummary: "Aperçu",
  sectionHighlights: "Points forts",
  allWeeks: "Tous les jours",
  prevWeek: "Jour précédent",
  nextWeek: "Jour suivant",
  share: "Partager",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "Rapports quotidiens",
  weeklyReport: "Rapport quotidien",
  sectionsCount: (n) => `${n} sections`,
  itemsCount: (n) => `${n} éléments`,
  userWeek: (u) => `Journée de ${u}`,
};

const de: Locale = {
  weekdaysShort: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  sectionSummary: "Überblick",
  sectionHighlights: "Highlights",
  allWeeks: "Alle Tage",
  prevWeek: "Vorheriger Tag",
  nextWeek: "Nächster Tag",
  share: "Teilen",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "Tagesberichte",
  weeklyReport: "Tagesbericht",
  sectionsCount: (n) => `${n} Abschnitte`,
  itemsCount: (n) => `${n} Einträge`,
  userWeek: (u) => `${u}s Tag`,
};

const pt: Locale = {
  weekdaysShort: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  sectionSummary: "Visão geral",
  sectionHighlights: "Destaques",
  allWeeks: "Todos os dias",
  prevWeek: "Dia anterior",
  nextWeek: "Próximo dia",
  share: "Compartilhar",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "Relatórios diários",
  weeklyReport: "Relatório diário",
  sectionsCount: (n) => `${n} seções`,
  itemsCount: (n) => `${n} itens`,
  userWeek: (u) => `Dia de ${u}`,
};

const ru: Locale = {
  weekdaysShort: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  sectionSummary: "Обзор",
  sectionHighlights: "Основное",
  allWeeks: "Все дни",
  prevWeek: "Предыдущий день",
  nextWeek: "Следующий день",
  share: "Поделиться",
  poweredBy: "Powered by",
  generatedWith: "Generated with",
  weeklyReports: "Ежедневные отчеты",
  weeklyReport: "Ежедневный отчет",
  sectionsCount: (n) => `${n} разделов`,
  itemsCount: (n) => `${n} элементов`,
  userWeek: (u) => `День ${u}`,
};

const locales: Record<Language, Locale> = {
  en,
  ja,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ko,
  es,
  fr,
  de,
  pt,
  ru,
};

export const getLocale = (language: Language): Locale =>
  locales[language] ?? locales.en;

// ---------------------------------------------------------------------------
// Formatting helpers (use BCP 47 tags for Intl APIs)
// ---------------------------------------------------------------------------

export const getBcp47 = (language: Language): string =>
  BCP47[language] ?? "en-US";

export const formatDate = (
  dateStr: string,
  language: Language,
  timezone: string = "UTC",
): string => {
  const date = parseLocalDate(dateStr, timezone);
  const tag = getBcp47(language);
  const usesNumericMonth = ["ja", "zh-CN", "zh-TW", "ko"].includes(language);
  return date.toLocaleDateString(tag, {
    timeZone: timezone,
    year: "numeric",
    month: usesNumericMonth ? "numeric" : "short",
    day: "numeric",
  });
};

export const formatNumber = (n: number, language: Language): string =>
  n.toLocaleString(getBcp47(language));

// ---------------------------------------------------------------------------
// LLM language instructions
// ---------------------------------------------------------------------------

const LLM_INSTRUCTIONS: Record<Language, string | null> = {
  en: null,
  ja: [
    "IMPORTANT: Write ALL text content in Japanese.",
    "Use casual, plain form (da/dearu style). NEVER use desu/masu form.",
    "Write like a developer jotting down notes in their personal log.",
    "Technical terms (OAuth, JWT, PR, etc.) can stay in English.",
    "Example tone: 'OAuth2 PKCE移行を進めた。認証フロー全体をリファクタし、JWTに切り替えた。'",
  ].join(" "),
  "zh-CN": [
    "IMPORTANT: Write ALL text content in Simplified Chinese.",
    "Use a casual, direct tone like a developer's personal notes.",
    "Technical terms can stay in English.",
  ].join(" "),
  "zh-TW": [
    "IMPORTANT: Write ALL text content in Traditional Chinese.",
    "Use a casual, direct tone like a developer's personal notes.",
    "Technical terms can stay in English.",
  ].join(" "),
  ko: [
    "IMPORTANT: Write ALL text content in Korean.",
    "Use a casual, direct tone (haeyo or haera style).",
    "Technical terms can stay in English.",
  ].join(" "),
  es: [
    "IMPORTANT: Write ALL text content in Spanish.",
    "Use a casual, direct tone like a developer's personal log.",
  ].join(" "),
  fr: [
    "IMPORTANT: Write ALL text content in French.",
    "Use a casual, direct tone like a developer's personal log. Use 'tu' form if addressing the reader.",
  ].join(" "),
  de: [
    "IMPORTANT: Write ALL text content in German.",
    "Use a casual, direct tone like a developer's personal log.",
  ].join(" "),
  pt: [
    "IMPORTANT: Write ALL text content in Brazilian Portuguese.",
    "Use a casual, direct tone like a developer's personal log.",
  ].join(" "),
  ru: [
    "IMPORTANT: Write ALL text content in Russian.",
    "Use a casual, direct tone like a developer's personal log.",
    "Technical terms can stay in English.",
  ].join(" "),
};

export const llmLanguageInstruction = (language: Language): string | null =>
  LLM_INSTRUCTIONS[language] ?? null;
