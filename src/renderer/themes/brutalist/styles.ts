// Default theme: Myriad Apps (Graphical "Myriad Advisor Solutions"). The `brutalist` config key is kept
// for compatibility. Tokens live in tokens.ts; every rule here consumes named tokens and the Myriad
// component assignments from gui/source/styles.css (app shell, card, button, badge, segmented control,
// text field, meter). Brand red is limited to the logo mark and short rules; actions, focus, selection
// and progress are monotone. Positive states stay green; categorical chart colours are preserved.
// Roboto and Lora are self-hosted (assets/fonts/fonts.css, linked from the templates).

import type { Language } from "../../../types.js";
import { getFontConfig } from "../../../i18n/index.js";
import { buildAllocationCSS } from "../allocation-css.js";
import { TOKEN_CSS } from "./tokens.js";

/** Literal values for non-CSS consumers (theme-color meta, OG card accent). */
export const colors = {
  bg: "#f8f7f4", // --neutral-2 (light top bar)
  accent: "#cc2647", // --color-1, brand accent only
  green: "#1b7a3d", // --status-positive (light)
  badgePr: "#202326", // --neutral-10
  badgeDiscussion: "#625d52", // --neutral-7
};

/** A complete text step: size, line height and letter spacing. */
const text = (step: "xxs" | "xs" | "s" | "m" | "l" | "xl" | "xxl"): string =>
  `font-size: var(--size-${step}); line-height: var(--line-${step}); letter-spacing: var(--letter-spacing-${step});`;

/** Text step for explainer parts, scoped to this theme's explainer page. */
const finText = (step: Parameters<typeof text>[0], selectors: string[]): string =>
  `${selectors.map((sel) => `.fin-page[data-fin-theme="brutalist"] ${sel}`).join(", ")} { ${text(step)} }`;

/** Composed edges (zero native border width). */
const EDGE = "0 0 0 var(--border-s) var(--border)";
const RULE_BELOW = "inset 0 calc(-1 * var(--border-s)) 0 var(--border)";
const RULE_ABOVE = "inset 0 var(--border-s) 0 var(--border)";

/** Small uppercase label (Myriad page-hero kicker / panel label). */
const LABEL = `font-family: var(--font-ui); ${text("xxs")} font-weight: var(--weight-ui-heavy); letter-spacing: 0.08em; text-transform: uppercase; color: var(--neutral-7);`;

/** Myriad .card: raised neutral surface with a composed edge. */
const CARD = `background: var(--surface); border: 0; border-radius: var(--radius-m); box-shadow: ${EDGE}, var(--shadow-s);`;

/** Text field / select (Text field assignment + ui-select chevron, which the source draws per mode). */
const CHEVRON = (stroke: string): string =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23${stroke}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;
const FIELD = `
      appearance: none; width: 100%; max-width: 100%;
      padding: var(--space-xs) calc(var(--space-s) + 1.25rem) var(--space-xs) var(--space-s);
      border: 0; border-radius: var(--radius-s);
      background-color: var(--neutral-1); background-image: ${CHEVRON("625d52")};
      background-position: right var(--space-s) center; background-repeat: no-repeat; background-size: 1rem;
      box-shadow: inset 0 0 0 var(--border-s) var(--input);
      font-family: var(--font-ui); ${text("m")} font-weight: var(--weight-ui-regular); color: var(--neutral-10);
      cursor: pointer;`;

/** Secondary/outline button (ui-button-outline, small size). */
const OUTLINE_BUTTON = `
      display: inline-flex; align-items: center; justify-content: center; gap: var(--space-xxs);
      padding: var(--space-xxs) var(--space-s); border: 0; border-radius: var(--radius-s);
      background: transparent; box-shadow: inset 0 0 0 var(--border-s) var(--neutral-7);
      font-family: var(--font-ui); ${text("s")} font-weight: var(--weight-ui-medium);
      color: var(--neutral-10); text-decoration: none; white-space: nowrap;
      transition: background-color var(--motion-duration) var(--motion-easing);`;

/** Dark-mode-only rules, applied by the toggle or by the OS setting when the reader has not chosen. */
const darkRules = (rules: [selector: string, declarations: string][]): string => {
  const scoped = (prefix: string): string =>
    rules.map(([sel, decl]) => `${sel.split(",").map((x) => `${prefix} ${x.trim()}`).join(", ")} { ${decl} }`).join("\n    ");
  return `
    ${scoped('html[data-theme="dark"]')}
    @media (prefers-color-scheme: dark) {
    ${scoped('html:not([data-theme="light"])')}
    }`;
};

const SHELL_CSS = `
    ${TOKEN_CSS}

    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { height: 100%; -webkit-text-size-adjust: 100%; }
    body {
      min-height: 100%; min-height: 100dvh; display: flex; flex-direction: column; overflow-x: hidden;
      background: var(--page-bg); color: var(--neutral-10);
      font-family: var(--font-body); ${text("m")} font-weight: var(--weight-ui-regular);
      -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    }
    h1, h2, h3 { font-family: var(--font-display); font-weight: var(--weight-brand-medium); color: var(--neutral-10); }
    a { color: var(--link); text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 3px; }
    a:hover { text-decoration-color: currentColor; }
    :where(a, button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])):focus-visible {
      outline: var(--focus-ring-outline); outline-offset: 2px;
    }
    code {
      font-family: var(--font-data); font-size: 0.875em; padding: 0 var(--space-xxs); border-radius: var(--radius-xs);
      background: var(--neutral-3); box-shadow: inset 0 0 0 var(--border-s) var(--border);
    }

    /* Skip link (ui-skip-link) */
    .skip-link {
      position: absolute; left: var(--space-s); top: var(--space-s); z-index: 300; transform: translateY(-200%);
      padding: var(--space-xs) var(--space-m); border-radius: var(--radius-s);
      background: var(--action); color: var(--action-foreground); font-weight: var(--weight-ui-medium); text-decoration: none;
    }
    .skip-link:focus-visible { transform: none; }

    /* ---- App shell top bar (myriad-app-header): raised neutral, one composed edge toward the canvas ---- */
    nav[aria-label="Site navigation"], .index-nav {
      position: sticky; top: 0; z-index: 100;
      background: var(--neutral-2); color: var(--neutral-10); box-shadow: ${RULE_BELOW};
      font-family: var(--font-ui);
    }
    .nav-inner, .index-nav-inner {
      max-width: 72rem; margin: 0 auto; min-height: 3.5rem;
      display: flex; align-items: center; justify-content: space-between; gap: var(--space-s);
      padding: var(--space-xs) var(--space-l);
    }
    .nav-brand {
      display: inline-flex; align-items: center; gap: var(--space-xs); min-width: 0;
      border-radius: var(--radius-s); color: var(--neutral-10); text-decoration: none;
    }
    /* Mode-appropriate mark: black on light, reverse on dark. */
    .nav-logo { width: 1.75rem; height: 1.75rem; flex-shrink: 0; object-fit: contain; }
    .nav-logo-dark { display: none; }
    .nav-site-title {
      font-family: var(--font-brand); ${text("m")} font-weight: var(--weight-brand-medium);
      color: var(--neutral-10); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .nav-actions { display: flex; align-items: center; gap: var(--space-xs); flex-shrink: 0; }
    ${darkRules([
      [".nav-logo-light", "display: none;"],
      [".nav-logo-dark", "display: block;"],
      [".est-select, .alloc-select", `background-image: ${CHEVRON("a6a3a1")};`],
    ])}

    /* ---- Light / dark control (ui-segmented) ---- */
    .theme-toggle {
      display: inline-grid; grid-template-columns: 1fr 1fr; gap: var(--space-xxs);
      padding: var(--space-xxs); border: 0; border-radius: var(--radius-s);
      background: var(--neutral-3); color: var(--neutral-10); font-family: var(--font-ui); cursor: pointer;
    }
    .theme-toggle-opt {
      display: flex; min-height: 2rem; align-items: center; justify-content: center; gap: var(--space-xxs);
      padding: 0 var(--space-xs); border-radius: var(--radius-xs);
      ${text("xs")} font-weight: var(--weight-ui-medium); color: var(--neutral-10);
      pointer-events: none; user-select: none;
      transition: background-color var(--motion-duration) var(--motion-easing), color var(--motion-duration) var(--motion-easing);
    }
    .theme-toggle:hover .theme-toggle-opt:not([data-active="true"]) { background: var(--neutral-4-transparent); }
    .theme-toggle-opt[data-active="true"] { background: var(--neutral-10); color: var(--neutral-1); }
    .theme-toggle-glyph { font-size: 1em; line-height: 1; }
    .theme-toggle-row { display: flex; justify-content: center; margin-bottom: var(--space-s); }

    /* ---- Footer ---- */
    .footer {
      width: 100%; max-width: 72rem; margin: auto auto 0; padding: var(--space-xl) var(--space-l);
      text-align: center; ${text("s")} color: var(--neutral-7); box-shadow: ${RULE_ABOVE};
    }
    .footer a { color: var(--neutral-10); }

    @view-transition { navigation: auto; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
    @media (max-width: 600px) {
      .nav-inner, .index-nav-inner { padding: var(--space-xs) var(--space-s); }
      .theme-toggle-opt { padding: 0 var(--space-xxs); }
      .footer { padding: var(--space-l) var(--space-s); }
    }
`;

/** Page header (compact Myriad page header on the canvas) and markdown prose. */
const HEADER_AND_PROSE_CSS = `
    .report-hero { width: min(64rem, 100% - 2 * var(--space-l)); margin: var(--space-xl) auto var(--space-l); }
    .report-back {
      display: inline-flex; align-items: center; gap: var(--space-xxs); margin-bottom: var(--space-s);
      ${text("s")} color: var(--neutral-7); text-decoration: none;
    }
    .report-back:hover { color: var(--neutral-10); text-decoration: underline; }
    .header-meta {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xxs) var(--space-xs);
      margin-bottom: var(--space-s); ${text("s")} color: var(--neutral-7);
    }
    .header-author { display: inline-flex; align-items: center; gap: var(--space-xs); color: var(--neutral-10); font-weight: var(--weight-ui-medium); text-decoration: none; }
    .header-author:hover { text-decoration: underline; }
    .header-author img { width: 1.5rem; height: 1.5rem; border-radius: var(--radius-full); box-shadow: ${EDGE}; }
    .header-date { font-variant-numeric: tabular-nums; }
    .header-title {
      max-width: 40ch; font-family: var(--font-brand); ${text("xl")} font-weight: var(--weight-brand-medium);
      color: var(--neutral-10); overflow-wrap: anywhere;
    }
    .header-sub {
      max-width: 60ch; margin-top: var(--space-xs);
      font-family: var(--font-editorial); ${text("m")} color: var(--neutral-7); text-transform: capitalize;
    }

    .md > :first-child { margin-top: 0; }
    .md > :last-child { margin-bottom: 0; }
    .md p { margin: 0 0 var(--space-s); }
    .md strong { font-weight: var(--weight-ui-medium); color: var(--neutral-10); }
    .md h2, .md h3, .md h4 { margin: var(--space-m) 0 var(--space-xs); font-family: var(--font-ui); ${text("m")} font-weight: var(--weight-ui-medium); }
    .md ul, .md ol { margin: var(--space-xs) 0 var(--space-s); padding-left: var(--space-m); }
    .md li { margin: var(--space-xxs) 0; }
    .md li::marker { color: var(--neutral-6); }
    .md a { color: var(--link); }
    .md blockquote { margin: var(--space-s) 0; padding-left: var(--space-s); box-shadow: inset var(--border-l) 0 0 var(--border); color: var(--neutral-7); }
    .md hr { border: 0; height: var(--border-s); background: var(--border); margin: var(--space-m) 0; }
    .md pre {
      margin: var(--space-s) 0; padding: var(--space-s); overflow-x: auto; border-radius: var(--radius-s);
      background: var(--neutral-3); font-family: var(--font-data); ${text("xs")} color: var(--neutral-9);
    }
    .md pre code { padding: 0; background: none; box-shadow: none; font-size: inherit; }

    @media (min-width: 900px) {
      .header-title { ${text("xxl")} }
    }
    @media (max-width: 600px) {
      .report-hero { width: calc(100% - 2 * var(--space-s)); margin-top: var(--space-l); }
      .header-title { ${text("l")} }
    }
`;

/** Daily report body: section cards, chips, heatmap, activity lists, highlights, pager. */
const REPORT_CSS = `
    .page { width: 100%; max-width: calc(64rem + 2 * var(--space-l)); margin: 0 auto; padding: 0 var(--space-l) var(--space-xxl); display: grid; gap: var(--space-l); }
    .page > * { min-width: 0; }

    /* Report sections are Myriad cards on the canvas. */
    .section-group, .stakeholder, .overview { ${CARD} padding: var(--space-l); }
    .section-group-header { display: flex; align-items: center; gap: var(--space-s); margin-bottom: var(--space-m); }
    .section-group-title { font-family: var(--font-brand); ${text("l")} font-weight: var(--weight-brand-medium); color: var(--neutral-10); }
    .section-group-line { flex: 1; height: var(--border-s); background: var(--border); }
    .section-group-count { ${LABEL} }
    .stakeholder-body, .overview { max-width: none; }
    .stakeholder-body, .overview p { max-width: 70ch; ${text("m")} color: var(--neutral-9); }

    .estimate-note { margin: 0 0 var(--space-m); max-width: 70ch; ${text("s")} color: var(--neutral-7); }
    .estimate-note em { font-family: var(--font-editorial); }

    /* Data chips (ui-badge-outline): read-only values, so no hover treatment. */
    .data-chips { display: flex; flex-wrap: wrap; gap: var(--space-xs); margin-bottom: var(--space-m); }
    .chip {
      display: inline-flex; align-items: center; gap: var(--space-xxs);
      padding: var(--space-xxs) var(--space-xs); border-radius: var(--radius-full);
      box-shadow: inset 0 0 0 var(--border-s) var(--edge);
      ${text("xs")} color: var(--neutral-10); font-variant-numeric: tabular-nums;
    }
    .chip-label { color: var(--neutral-7); }
    .chip-value { font-weight: var(--weight-ui-medium); }
    .chip-green { color: var(--status-positive-text); }
    .chip-red { color: var(--danger-text); }

    /* Weekday heatmap: sequential deep-teal ramp (brand palette, not status). */
    .mini-heatmap { display: flex; flex-wrap: wrap; gap: var(--space-xxs); margin-bottom: var(--space-m); }
    .mh-day { display: flex; flex-direction: column; align-items: center; gap: var(--space-xxs); }
    .mh-block {
      width: 2.75rem; height: 2.75rem; display: flex; align-items: center; justify-content: center;
      border-radius: var(--radius-s); ${text("xs")} font-weight: var(--weight-ui-medium); font-variant-numeric: tabular-nums;
      color: var(--neutral-10);
    }
    .mh-label { ${LABEL} }
    .mh-level-0 { background: var(--neutral-3); color: var(--neutral-7); }
    .mh-level-1 { background: color-mix(in srgb, var(--color-4) 20%, var(--surface)); }
    .mh-level-2 { background: color-mix(in srgb, var(--color-4) 40%, var(--surface)); }
    .mh-level-3 { background: color-mix(in srgb, var(--color-4) 65%, var(--surface)); }
    .mh-level-4 { background: var(--color-4); color: var(--cte-accent-text); }

    /* Activity */
    .activity-heading { margin: var(--space-l) 0 var(--space-xs); font-family: var(--font-ui); ${text("m")} font-weight: var(--weight-ui-medium); }
    .activity-list { list-style: none; margin: 0 0 var(--space-s); }
    .activity-list li { padding: var(--space-xs) 0; box-shadow: ${RULE_BELOW}; ${text("s")} color: var(--neutral-9); }
    .activity-list a { color: var(--neutral-10); text-decoration: none; }
    .activity-list a:hover { text-decoration: underline; }
    .activity-meta { margin-left: var(--space-xxs); ${text("xs")} color: var(--neutral-7); }
    .activity-block { margin: var(--space-xs) 0; }
    .activity-repo, .activity-pr {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xxs) var(--space-xs);
      list-style: none; cursor: pointer; border-radius: var(--radius-xs);
      font-weight: var(--weight-ui-medium); color: var(--neutral-10);
    }
    .activity-repo::-webkit-details-marker, .activity-pr::-webkit-details-marker { display: none; }
    .activity-repo::before, .activity-pr::before {
      content: ""; flex-shrink: 0; width: 0.4em; height: 0.4em;
      border-right: var(--border-l) solid var(--neutral-6); border-bottom: var(--border-l) solid var(--neutral-6);
      transform: rotate(-45deg); transition: transform var(--motion-duration) var(--motion-easing);
    }
    .activity-block[open] > .activity-repo::before, .activity-pr-block[open] > .activity-pr::before { transform: rotate(45deg); }
    .activity-repo--static { cursor: default; }
    .activity-repo--static::before { visibility: hidden; }
    .activity-count { ${text("xs")} font-weight: var(--weight-ui-regular); color: var(--neutral-7); font-variant-numeric: tabular-nums; }
    a.activity-repo-ext { display: inline-flex; color: inherit; }
    .activity-children { margin: var(--space-xxs) 0 0 var(--space-xxs); padding-left: var(--space-s); box-shadow: inset var(--border-s) 0 0 var(--border); }
    .activity-pr-block { margin: var(--space-xxs) 0; }
    .activity-pr { ${text("s")} }
    .activity-pr-title { color: var(--neutral-10); text-decoration: none; }
    .activity-pr-title:hover { text-decoration: underline; }
    .activity-pr-add { color: var(--status-positive-text); }
    .activity-pr-del { color: var(--danger-text); }
    .activity-other-label { ${text("s")} color: var(--neutral-7); }
    .activity-pr-block .activity-list { margin-left: var(--space-m); }
    .github-entity { display: inline-flex; align-items: center; gap: var(--space-xxs); }
    a.github-entity { color: var(--neutral-10); text-decoration: none; }
    a.github-entity:hover { text-decoration: underline; }
    .github-mark { display: inline-flex; width: 0.875rem; height: 0.875rem; flex-shrink: 0; color: var(--neutral-7); }
    .github-mark svg { display: block; width: 100%; height: 100%; }
    .pr-state { margin-right: var(--space-xxs); ${LABEL} }
    .pr-state.pr-merged { color: var(--status-positive-text); }
    .pr-state.pr-open { color: var(--neutral-10); }
    .pr-state.pr-closed { color: var(--danger-text); }

    /* Highlights: peer cards inside the section */
    .highlight-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-s); }
    .highlight-card {
      min-width: 0; padding: var(--space-m); border-radius: var(--radius-m);
      background: var(--page-bg); box-shadow: ${EDGE};
    }
    .highlight-heading { display: flex; align-items: baseline; gap: var(--space-xs); margin-bottom: var(--space-xxs); }
    .highlight-badge {
      flex-shrink: 0; padding: 0 var(--space-xs); border-radius: var(--radius-full);
      background: var(--emphasis-type-background); color: var(--emphasis-type-foreground);
      ${text("xxs")} font-weight: var(--weight-ui-heavy); letter-spacing: 0.08em; text-transform: uppercase;
    }
    .highlight-title { min-width: 0; ${text("m")} font-weight: var(--weight-ui-medium); overflow-wrap: anywhere; }
    .highlight-title a { color: var(--neutral-10); text-decoration: none; }
    .highlight-title a:hover { text-decoration: underline; }
    .highlight-meta { display: flex; align-items: center; gap: var(--space-xxs); min-width: 0; ${text("xs")} color: var(--neutral-7); }
    .highlight-meta-repo { flex: 0 1 auto; min-width: 0; overflow: hidden; }
    .highlight-meta-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .highlight-meta-tail { flex-shrink: 0; white-space: nowrap; }
    .highlight-body { ${text("s")} color: var(--neutral-9); }

    /* Diff and repository meters (ui-meter: monotone fill on a neutral track) */
    .diff-bar { display: flex; height: 6px; overflow: hidden; margin: var(--space-s) 0 var(--space-xxs); border-radius: var(--radius-full); background: var(--neutral-3); }
    .diff-add { height: 100%; background: var(--status-positive); }
    .diff-del { height: 100%; background: var(--danger-text); }
    .diff-labels { display: flex; justify-content: space-between; ${text("xs")} font-variant-numeric: tabular-nums; }
    .diff-label-add { color: var(--status-positive-text); }
    .diff-label-del { color: var(--danger-text); }
    .repo-bars { display: flex; flex-direction: column; gap: var(--space-xs); margin-top: var(--space-s); }
    .repo-bar-header { display: flex; justify-content: space-between; margin-bottom: var(--space-xxs); ${text("xs")} }
    .repo-bar-label, a.repo-bar-label { color: var(--neutral-9); text-decoration: none; }
    .repo-bar-value { color: var(--neutral-7); font-variant-numeric: tabular-nums; }
    .repo-bar-track { height: 6px; overflow: hidden; border-radius: var(--radius-full); background: var(--neutral-3); box-shadow: inset 0 0 0 var(--border-s) var(--neutral-4-transparent); }
    .repo-bar-fill { height: 100%; border-radius: var(--radius-full); background: var(--neutral-9); transition: width var(--motion-large-duration) var(--motion-large-easing); }

    /* Previous / next day (ui-button-outline, small) */
    .week-nav { width: 100%; max-width: calc(64rem + 2 * var(--space-l)); margin: 0 auto; padding: 0 var(--space-l) var(--space-xl); display: flex; justify-content: space-between; gap: var(--space-s); }
    .week-nav-link { ${OUTLINE_BUTTON} }
    .week-nav-link:hover { background: var(--neutral-3-transparent); }

    @media (max-width: 600px) {
      .page { padding: 0 var(--space-s) var(--space-xl); gap: var(--space-m); }
      .section-group, .stakeholder, .overview { padding: var(--space-m); }
      .highlight-grid { grid-template-columns: minmax(0, 1fr); }
      .week-nav { padding: 0 var(--space-s) var(--space-l); }
    }
`;

/** "Where the effort went": shared builder for structure and the categorical palette; Myriad controls on top. */
const allocationCSS = (): string => buildAllocationCSS({
  defaultMode: "light",
  text: "var(--neutral-10)",
  textSecondary: "var(--neutral-7)",
  textTertiary: "var(--neutral-7)",
  heading: "var(--neutral-10)",
  border: "var(--border)",
  borderSubtle: "var(--neutral-3)",
  surface: "var(--surface)",
  accent: "var(--neutral-10)",
  mono: "var(--font-ui)",
  radius: "var(--radius-xs)",
  extra: `
    .alloc { margin-bottom: 0; }
    .alloc.alloc--inline { margin: 0; }
    .alloc-lede, .alloc-foot { ${text("s")} }
    .alloc-switch {
      display: inline-grid; grid-auto-flow: column; gap: var(--space-xxs); padding: var(--space-xxs);
      margin: 0 0 var(--space-m); border: 0; border-radius: var(--radius-s); background: var(--neutral-3);
    }
    .alloc-switch-opt {
      min-height: 2rem; padding: 0 var(--space-s); border: 0; border-radius: var(--radius-xs);
      background: transparent; color: var(--neutral-10); ${text("xs")} font-weight: var(--weight-ui-medium);
    }
    .alloc-switch-opt + .alloc-switch-opt { border-left: 0; }
    .alloc-switch-opt:hover:not([aria-selected="true"]) { background: var(--neutral-4-transparent); }
    .alloc-switch-opt[aria-selected="true"] { background: var(--neutral-10); color: var(--neutral-1); font-weight: var(--weight-ui-medium); }
    .alloc-switch-opt:focus-visible, .alloc-select:focus-visible { outline: var(--focus-ring-outline); outline-offset: 2px; }
    .alloc-select { ${FIELD} width: auto; min-width: 9rem; }
    .alloc-sub { ${LABEL} margin-bottom: var(--space-xs); }
    .alloc-sub-meta { ${text("xs")} letter-spacing: var(--letter-spacing-xs); text-transform: none; font-weight: var(--weight-ui-regular); }
    .alloc-seg { ${text("xs")} font-weight: var(--weight-ui-medium); }
    .alloc-legend { ${text("xs")} gap: var(--space-xxs) var(--space-m); }
    .alloc-legend-pct, .alloc-item-pct { font-weight: var(--weight-ui-medium); }
    .alloc-list { border-top: 0; box-shadow: ${RULE_ABOVE}; }
    .alloc-item { padding: var(--space-s) 0; border-bottom: 0; box-shadow: ${RULE_BELOW}; }
    .alloc-item-name { font-weight: var(--weight-ui-medium); }
    .alloc-item-track { border-radius: var(--radius-full); }
    .alloc-work { ${text("s")} }
    .alloc-work-label, .alloc-kind { ${LABEL} }
    .alloc-work-links a { color: var(--neutral-10); text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); }
    .alloc-work-links a:hover { color: var(--neutral-10); text-decoration-color: currentColor; }
    .alloc-repo, .alloc-checks { ${text("xs")} color: var(--neutral-7); }
    /* Checks behind this work: up to three grouped tiles of counted facts, then a muted footnote. */
    .alloc-verify-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: var(--space-s); }
    .alloc-verify-group { padding: var(--space-s) var(--space-m); border-radius: var(--radius-s); box-shadow: inset 0 0 0 var(--border-s) var(--border); }
    .alloc-verify-heading { ${LABEL} margin: 0 0 var(--space-xs); }
    .alloc-verify-facts { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-xxs); ${text("s")} color: var(--neutral-9); }
    .alloc-verify-fact { display: flex; align-items: baseline; gap: var(--space-xs); }
    /* Marker: filled for counted evidence, green only for live, a ring while running, dashed when evidence is missing. */
    .alloc-verify-fact::before {
      content: ""; flex: none; align-self: center; width: var(--space-xs); height: var(--space-xs);
      border-radius: var(--radius-full); background: var(--neutral-5);
    }
    .alloc-verify-fact--positive::before { background: var(--status-positive); }
    .alloc-verify-fact--pending::before { background: transparent; box-shadow: inset 0 0 0 var(--border-l) var(--neutral-7); }
    .alloc-verify-fact--tentative::before { background: transparent; outline: var(--border-s) dashed var(--neutral-7); outline-offset: calc(-1 * var(--border-s)); }
    .alloc-verify-value { flex: none; min-width: 2ch; font-family: var(--font-ui); ${text("m")} font-weight: var(--weight-ui-medium); color: var(--neutral-10); font-variant-numeric: tabular-nums; }
    .alloc-verify-fact--positive .alloc-verify-value { color: var(--status-positive-text); }
    .alloc-verify-fact--tentative .alloc-verify-label { color: var(--neutral-7); }
    .alloc-verify-foot { max-width: 70ch; margin: var(--space-s) 0 0; ${text("xs")} color: var(--neutral-7); }
    .alloc-verify-foot a { color: var(--neutral-10); font-weight: var(--weight-ui-medium); white-space: nowrap; }
    .alloc-more, .alloc-table-wrap { ${text("s")} }
    .alloc-more > summary, .alloc-table-wrap > summary { color: var(--neutral-10); font-weight: var(--weight-ui-medium); }
    .alloc-more > summary:hover { color: var(--neutral-10); text-decoration: underline; }
    .alloc-more > summary:focus-visible, .alloc-table-wrap > summary:focus-visible { outline: var(--focus-ring-outline); outline-offset: 2px; }
    /* Tags and chips follow the badge assignment: pill radius, composed edge. */
    .alloc-tag, .alloc-impact, .alloc-stage, .alloc-cx, .alloc-risk {
      border: 0; border-radius: var(--radius-full); padding: var(--space-xxs) var(--space-xs);
      ${text("xxs")} box-shadow: inset 0 0 0 var(--border-s) var(--edge);
    }
    .alloc-tag--self, .alloc-cx--partial, .alloc-stage--draft, .alloc-stage--prototype { box-shadow: none; outline: var(--border-s) dashed var(--edge); outline-offset: calc(-1 * var(--border-s)); }
    .alloc-impact--major { background: var(--neutral-10); color: var(--neutral-1); box-shadow: none; }
    .alloc-impact--notable { background: transparent; color: var(--neutral-7); }
    .alloc-stage--live { background: color-mix(in srgb, var(--status-positive) 14%, transparent); color: var(--status-positive-text); box-shadow: inset 0 0 0 var(--border-s) color-mix(in srgb, var(--status-positive) 55%, transparent); }
    .alloc-trend-label, .alloc-trend-total { ${text("xs")} font-variant-numeric: tabular-nums; }
    .alloc-trend-row.is-current .alloc-trend-label { font-weight: var(--weight-ui-medium); }
    .alloc-table th, .alloc-table td { border-bottom: 0; box-shadow: ${RULE_BELOW}; padding: var(--space-xxs) var(--space-xs); }
    .alloc-table th { font-weight: var(--weight-ui-medium); color: var(--neutral-7); }
    .alloc-foot-title { font-weight: var(--weight-ui-medium); }
  `,
});

/** Work-week page, daily-page week link, and the estimate calculator (shared by report and estimate page). */
const WEEK_AND_ESTIMATE_CSS = `
    /* Daily report -> whole week */
    .week-link { margin: 0 0 var(--space-s); ${text("s")} }
    .week-link a { font-weight: var(--weight-ui-medium); }
    .report-hero .week-link { margin: var(--space-s) 0 0; }

    /* Work-week page */
    .week-crumbs { display: flex; flex-wrap: wrap; gap: var(--space-xxs) var(--space-xs); margin-bottom: var(--space-s); ${text("s")} color: var(--neutral-7); }
    .week-crumbs a { color: var(--neutral-7); text-decoration: none; }
    .week-crumbs a:hover { color: var(--neutral-10); text-decoration: underline; }
    .week-dates { margin-top: var(--space-xxs); ${text("s")} color: var(--neutral-7); font-variant-numeric: tabular-nums; }
    .week-days-section { ${CARD} display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-xs) var(--space-m); padding: var(--space-s) var(--space-l); }
    .week-days-label { ${LABEL} }
    .week-day-links { list-style: none; display: flex; flex-wrap: wrap; gap: var(--space-xxs) var(--space-m); ${text("s")} }
    .week-pager { display: flex; justify-content: space-between; gap: var(--space-s); }
    .week-pager a { ${OUTLINE_BUTTON} }
    .week-pager a:hover { background: var(--neutral-3-transparent); }

    /* Estimate calculator (Field + Text field assignments) */
    .est { color: var(--neutral-10); }
    .est-intro { max-width: 60ch; margin: 0 0 var(--space-m); font-family: var(--font-editorial); ${text("m")} color: var(--neutral-7); }
    .est-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: var(--space-s) var(--space-m); margin: 0 0 var(--space-l); }
    .est-field { display: grid; gap: var(--space-xxs); align-content: start; min-width: 0; }
    .est-field[hidden] { display: none; }
    .est-label { ${text("s")} font-weight: var(--weight-ui-medium); color: var(--neutral-10); }
    .est-select { ${FIELD} }
    .est-output { margin: 0 0 var(--space-m); padding: var(--space-m); border-radius: var(--radius-s); background: var(--neutral-3); max-width: 70ch; }
    .est-output p { margin: 0 0 var(--space-xxs); }
    .est-primary { font-family: var(--font-brand); ${text("l")} font-weight: var(--weight-brand-medium); color: var(--neutral-10); }
    .est-secondary, .est-basis { ${text("s")} color: var(--neutral-9); }
    .est-ref { margin: 0 0 var(--space-xs); padding-left: var(--space-m); ${text("s")} color: var(--neutral-9); }
    .est-ref[hidden] { display: none; }
    .est-caption { ${text("xs")} color: var(--neutral-7); }
    .est-details { max-width: 70ch; ${text("s")} color: var(--neutral-9); }
    .est-details summary { margin-bottom: var(--space-xxs); cursor: pointer; font-weight: var(--weight-ui-medium); color: var(--neutral-10); border-radius: var(--radius-xs); }
    .est-details p { margin: 0 0 var(--space-xxs); }

    /* Standalone estimate page */
    .est-page { width: 100%; max-width: 56rem; margin: 0 auto; padding: var(--space-xl) var(--space-l) var(--space-xxl); color: var(--neutral-10); }
    .est-page-back { display: inline-block; margin-bottom: var(--space-s); ${text("s")} color: var(--neutral-7); text-decoration: none; }
    .est-page-back:hover { color: var(--neutral-10); text-decoration: underline; }
    .est-page-title { margin-bottom: var(--space-xs); font-family: var(--font-brand); ${text("xl")} font-weight: var(--weight-brand-medium); }
    .est-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-s); margin: 0 0 var(--space-l); }
    /* Kind-of-work choices: pressed toggles on the card surface, selection in monotone ink. */
    .est-card {
      ${CARD} min-height: 4.5rem; padding: var(--space-s) var(--space-m); text-align: left; cursor: pointer;
      font-family: var(--font-ui); ${text("m")} font-weight: var(--weight-ui-medium); color: var(--neutral-10);
      transition: background-color var(--motion-duration) var(--motion-easing), box-shadow var(--motion-duration) var(--motion-easing);
    }
    .est-card:hover { background: var(--neutral-3); }
    .est-card[aria-pressed="true"] {
      background: var(--navigation-active-background); color: var(--navigation-active-foreground);
      box-shadow: inset 0 0 0 var(--border-l) var(--neutral-10);
    }
    .est-card:active { transform: translateY(var(--motion-press-distance)); }
    .est-standalone { ${CARD} padding: var(--space-l); margin-bottom: var(--space-l); }
    .est-excludes { max-width: 70ch; ${text("s")} color: var(--neutral-9); }
    .est-excludes h2 { margin-bottom: var(--space-xxs); font-family: var(--font-ui); ${text("m")} font-weight: var(--weight-ui-medium); }
    .est-excludes ul { padding-left: var(--space-m); }
    .est-excludes li { margin: var(--space-xxs) 0; }

    @media (max-width: 860px) { .est-cards { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 600px) {
      .week-days-section, .est-standalone { padding: var(--space-m); }
      .est-page { padding: var(--space-l) var(--space-s) var(--space-xl); }
      .est-page-title { ${text("l")} }
      .est-form { grid-template-columns: 1fr; }
    }
    @media (max-width: 380px) { .est-cards { grid-template-columns: 1fr; } }
`;

export const THEME_INIT_SCRIPT = `<script>
(function(){
  var s=localStorage.getItem("worklog-theme")||localStorage.getItem("theme");
  if(s==="light"||s==="dark")document.documentElement.setAttribute("data-theme",s);
})();
</script>`;

export const THEME_TOGGLE_SCRIPT = `<script>
(function(){
  var buttons=[].slice.call(document.querySelectorAll(".theme-toggle"));
  if(!buttons.length)return;
  function current(){
    return document.documentElement.getAttribute("data-theme")
      || (matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
  }
  function update(){
    var mode=current();
    buttons.forEach(function(btn){
      btn.setAttribute("aria-pressed", mode==="dark"?"true":"false");
      btn.setAttribute("aria-label", mode==="dark"?"Switch to light mode":"Switch to dark mode");
      [].slice.call(btn.querySelectorAll(".theme-toggle-opt")).forEach(function(opt){
        opt.setAttribute("data-active", opt.getAttribute("data-mode")===mode?"true":"false");
      });
    });
  }
  update();
  buttons.forEach(function(btn){
    btn.addEventListener("click",function(){
      var next=current()==="dark"?"light":"dark";
      document.documentElement.setAttribute("data-theme",next);
      localStorage.setItem("worklog-theme",next);
      localStorage.setItem("theme",next);
      update();
    });
  });
})();
</script>`;

/**
 * Non-Latin locales keep their script family after Roboto, from local installs only: this theme makes no
 * third-party font requests.
 */
const localeFontCSS = (language: Language): string => {
  if (!["ja", "zh-CN", "zh-TW", "ko", "ru"].includes(language)) return "";
  const { bodyFamily } = getFontConfig(language);
  return `:root { --font-ui: Roboto, ${bodyFamily}; --font-brand: Roboto, ${bodyFamily}; }`;
};

export const buildCSS = (language: Language = "en"): string => `
    ${SHELL_CSS}
    ${localeFontCSS(language)}
    ${HEADER_AND_PROSE_CSS}
    ${REPORT_CSS}
    ${allocationCSS()}
    ${WEEK_AND_ESTIMATE_CSS}
`;

/** Homepage (daily overhead + ledger) and the shell for estimate / finished pages, on top of buildCSS. */
export const buildIndexCSS = (_language: Language = "en"): string => `
    /* ---- Homepage header ---- */
    .overhead-shell { width: min(72rem, 100% - 2 * var(--space-l)); margin: 0 auto; padding: var(--space-xl) 0 var(--space-xxl); display: grid; gap: var(--space-l); }
    .overhead-shell > * { min-width: 0; }
    .overhead-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-m) var(--space-xl); align-items: end; }
    .overhead-kicker { display: flex; align-items: center; gap: var(--space-xs); margin-bottom: var(--space-xs); ${LABEL} }
    /* Brand moment: a short red rule (accent only). */
    .overhead-kicker::before { content: ""; width: var(--space-l); height: var(--border-l); background: var(--nav-accent); }
    .overhead-title { font-family: var(--font-brand); ${text("xxl")} font-weight: var(--weight-brand-medium); color: var(--neutral-10); overflow-wrap: anywhere; }
    .overhead-owner { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs); margin-top: var(--space-s); ${text("s")} color: var(--neutral-9); }
    .overhead-owner a { color: var(--neutral-7); }
    .overhead-avatar { border-radius: var(--radius-full); box-shadow: ${EDGE}; }
    .overhead-window { text-align: right; }
    .overhead-window-label { display: block; margin-bottom: var(--space-xxs); ${LABEL} }
    .overhead-window strong { ${text("s")} font-weight: var(--weight-ui-medium); font-variant-numeric: tabular-nums; }

    /* ---- Effort summary card ---- */
    .home-hero { ${CARD} padding: var(--space-l); }
    .home-hero-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: var(--space-m) var(--space-xl); }
    .home-hero-days { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-xxs) var(--space-xs); }
    .home-hero-value { font-family: var(--font-brand); ${text("xxl")} font-weight: var(--weight-brand-medium); color: var(--neutral-10); font-variant-numeric: tabular-nums; }
    .home-hero-unit { font-family: var(--font-brand); ${text("l")} font-weight: var(--weight-brand-medium); color: var(--neutral-10); }
    .est-tag {
      display: inline-block; vertical-align: middle; padding: 0 var(--space-xs); border-radius: var(--radius-full);
      box-shadow: inset 0 0 0 var(--border-s) var(--edge); ${text("xxs")} font-weight: var(--weight-ui-medium); color: var(--neutral-7); white-space: nowrap;
    }
    .est-note { max-width: 60ch; margin-top: var(--space-xs); ${text("s")} color: var(--neutral-7); }
    .home-hero-counts { display: flex; gap: var(--space-l); }
    .home-hero-counts div { display: flex; flex-direction: column-reverse; }
    .home-hero-counts dt { ${LABEL} }
    .home-hero-counts dd { font-family: var(--font-brand); ${text("l")} font-weight: var(--weight-brand-medium); color: var(--neutral-10); font-variant-numeric: tabular-nums; }
    .home-hero-mix { margin-top: var(--space-m); }
    .home-hero-mix .alloc-bar { height: 22px; }
    .home-hero-mix .alloc-legend { margin-top: var(--space-xs); }

    /* ---- Activity ledger: month -> work week -> day, in one card ---- */
    .ledger { ${CARD} overflow: hidden; }
    .ledger-heading { display: flex; justify-content: space-between; padding: var(--space-s) var(--space-l); box-shadow: ${RULE_BELOW}; ${LABEL} }
    .month-group { box-shadow: ${RULE_BELOW}; }
    .month-group:last-child { box-shadow: none; }
    .month-summary {
      display: grid; grid-template-columns: 8rem 13rem minmax(4rem, 1fr) auto 2rem; gap: var(--space-m); align-items: center;
      padding: var(--space-s) var(--space-l); list-style: none; cursor: pointer;
      transition: background-color var(--motion-duration) var(--motion-easing);
    }
    .month-summary::-webkit-details-marker { display: none; }
    .month-summary:hover { background: var(--nav-hover); }
    .month-summary:focus-visible, .day-row:focus-visible, .week-row:focus-visible { outline: var(--focus-ring-outline); outline-offset: -2px; }
    .month-name { grid-column: 1; }
    .month-name span { display: block; font-family: var(--font-brand); ${text("l")} font-weight: var(--weight-brand-medium); color: var(--neutral-10); }
    .month-name strong { ${text("xs")} font-weight: var(--weight-ui-regular); color: var(--neutral-7); }
    .month-days { grid-column: 2; ${text("s")} font-weight: var(--weight-ui-medium); color: var(--neutral-10); }
    .month-tape { grid-column: 3; height: 2rem; display: flex; align-items: end; gap: 2px; }
    .month-tape i { display: block; flex: 1 1 0; min-width: 3px; max-width: 10px; height: max(3px, var(--activity)); border-radius: 1px 1px 0 0; background: var(--neutral-6); }
    .month-group[open] .month-tape { visibility: hidden; }
    .month-totals { grid-column: 4; display: flex; gap: var(--space-s); ${text("xs")} color: var(--neutral-7); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .month-totals b { font-weight: var(--weight-ui-medium); color: var(--neutral-10); }
    .month-count { grid-column: 5; justify-self: end; display: inline-flex; color: var(--neutral-7); }
    .month-count::after {
      content: ""; width: 0.5rem; height: 0.5rem; margin: 0 var(--space-xxs) var(--space-xxs) 0;
      border-right: var(--border-l) solid currentColor; border-bottom: var(--border-l) solid currentColor;
      transform: rotate(45deg); transition: transform var(--motion-duration) var(--motion-easing);
    }
    .month-group[open] .month-count::after { transform: translate(0, var(--space-xxs)) rotate(-135deg); }

    .week-ledger { box-shadow: ${RULE_ABOVE}; }
    .week-block { box-shadow: ${RULE_BELOW}; }
    .week-block:last-child { box-shadow: none; }
    .week-row {
      display: grid; grid-template-columns: 8rem minmax(0, 1fr) auto 1.5rem; gap: var(--space-m); align-items: start;
      padding: var(--space-s) var(--space-l); color: inherit; text-decoration: none;
      transition: background-color var(--motion-duration) var(--motion-easing);
    }
    .week-row:hover, .day-row:hover { background: var(--nav-hover); }
    .week-label strong { display: block; ${text("m")} font-weight: var(--weight-ui-medium); color: var(--neutral-10); }
    .week-flag { display: block; ${text("xs")} color: var(--neutral-7); }
    .week-story { min-width: 0; }
    .week-delivered { ${text("s")} font-weight: var(--weight-ui-medium); color: var(--neutral-10); }
    .week-mix { margin-top: var(--space-xxs); }
    .week-mix-track, .week-mix-fill { display: block; }
    .week-mix-fill { min-width: 6px; }
    .week-mix .alloc-bar { height: 10px; }
    .week-initiatives, .week-initiatives.alloc { list-style: none; margin: var(--space-xxs) 0 0; display: flex; flex-wrap: wrap; gap: 0 var(--space-s); ${text("xs")} color: var(--neutral-7); }
    .week-initiatives li { display: inline-flex; align-items: center; gap: var(--space-xxs); }
    .week-initiatives b { font-weight: var(--weight-ui-medium); color: var(--neutral-10); }
    .week-outcome { margin-top: var(--space-xxs); ${text("s")} color: var(--neutral-9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .week-counts { display: flex; gap: var(--space-s); ${text("xs")} color: var(--neutral-7); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .week-counts b { font-weight: var(--weight-ui-medium); color: var(--neutral-10); }
    .week-days { margin: 0 var(--space-l) var(--space-s) calc(var(--space-l) + 8rem + var(--space-m)); ${text("s")} }
    .week-days > summary { display: inline-block; cursor: pointer; border-radius: var(--radius-xs); ${LABEL} }
    .week-days > summary:hover { color: var(--neutral-10); }
    .week-days[open] > summary { margin-bottom: var(--space-xxs); }
    .week-days .day-list { border-radius: var(--radius-s); box-shadow: ${EDGE}; overflow: hidden; }

    .day-list { box-shadow: ${RULE_ABOVE}; }
    .day-row {
      display: grid; grid-template-columns: 4rem minmax(0, 1fr) auto 1.5rem; gap: var(--space-s); align-items: center;
      padding: var(--space-xs) var(--space-m); color: inherit; text-decoration: none; box-shadow: ${RULE_BELOW};
      transition: background-color var(--motion-duration) var(--motion-easing);
    }
    .day-row:last-child { box-shadow: none; }
    .day-date { display: flex; align-items: baseline; gap: var(--space-xxs); }
    .day-date strong { font-family: var(--font-brand); ${text("l")} font-weight: var(--weight-brand-medium); color: var(--neutral-10); font-variant-numeric: tabular-nums; }
    .day-date span { ${LABEL} }
    .day-story { min-width: 0; }
    .day-title { ${text("s")} font-weight: var(--weight-ui-medium); color: var(--neutral-10); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .day-subtitle { ${text("xs")} color: var(--neutral-7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .day-stats { display: flex; gap: var(--space-xs); ${text("xs")} color: var(--neutral-7); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .day-stats b { font-weight: var(--weight-ui-medium); color: var(--neutral-10); }
    .day-open { color: var(--neutral-7); }

    /* ---- Planning links ---- */
    .planning { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-xs) var(--space-m); }
    .planning + .planning { margin-top: calc(-1 * var(--space-s)); }
    .planning-title { ${LABEL} }
    .planning-links { list-style: none; display: flex; flex-wrap: wrap; gap: var(--space-xxs) var(--space-m); ${text("s")} }
    .planning-links a { font-weight: var(--weight-ui-medium); }

    @media (max-width: 860px) {
      .overhead-header { grid-template-columns: 1fr; }
      .overhead-window { text-align: left; }
      .overhead-title { ${text("xl")} }
    }
    @media (max-width: 720px) {
      .overhead-shell { width: calc(100% - 2 * var(--space-s)); padding-top: var(--space-l); gap: var(--space-m); }
      .home-hero { padding: var(--space-m); }
      .home-hero-value { ${text("xl")} }
      .ledger-heading, .month-summary, .week-row { padding-inline: var(--space-m); }
      .month-summary { grid-template-columns: 1fr 2rem; gap: var(--space-xxs) var(--space-s); }
      .month-name { grid-column: 1; grid-row: 1; }
      .month-count { grid-column: 2; grid-row: 1; }
      .month-days { grid-column: 1 / -1; grid-row: 2; }
      .month-tape { grid-column: 1 / -1; grid-row: 3; }
      .month-group[open] .month-tape { display: none; }
      .month-totals { grid-column: 1 / -1; grid-row: 4; flex-wrap: wrap; gap: 0 var(--space-s); white-space: normal; }
      .week-row { grid-template-columns: minmax(0, 1fr) 1rem; gap: var(--space-xxs) var(--space-xs); }
      .week-label { grid-column: 1; grid-row: 1; display: flex; align-items: baseline; gap: var(--space-xs); }
      .week-row .day-open { grid-column: 2; grid-row: 1; }
      .week-story { grid-column: 1 / -1; grid-row: 2; }
      .week-counts { grid-column: 1 / -1; grid-row: 3; flex-wrap: wrap; gap: 0 var(--space-s); }
      .week-days { margin: 0 var(--space-m) var(--space-s); }
      .day-row { grid-template-columns: 3.25rem minmax(0, 1fr) 1rem; gap: var(--space-xs); padding-inline: var(--space-s); }
      .day-stats { display: none; }
    }

    /* ---- Finished explainer: Myriad typography on the shared explainer layout ---- */
    .fin-page[data-fin-theme="brutalist"] { font-family: var(--font-ui); }
    .fin-page[data-fin-theme="brutalist"] h1 { font-family: var(--font-brand); ${text("xxl")} font-weight: var(--weight-brand-medium); }
    .fin-page[data-fin-theme="brutalist"] h2 { font-family: var(--font-brand); ${text("l")} font-weight: var(--weight-brand-medium); }
    .fin-page[data-fin-theme="brutalist"] h3 { font-family: var(--font-ui); ${text("m")} font-weight: var(--weight-ui-medium); }
    .fin-page[data-fin-theme="brutalist"] .fin-sub { font-family: var(--font-editorial); ${text("m")} }
    .fin-page[data-fin-theme="brutalist"] .fin-label { ${LABEL} }
    .fin-page[data-fin-theme="brutalist"] .fin-q-ask { ${text("m")} font-weight: var(--weight-ui-medium); letter-spacing: var(--letter-spacing-m); }
    /* Explainer UI text on the theme's steps; the Venn and pipeline artwork keep their container-relative sizes. */
    ${finText("s", [".fin-q-ans", ".fin-scenario-title", ".fin-btn", ".fin-switch", ".fin-node-name", ".fin-node-text", ".fin-pipe-text", ".fin-back", ".fin-term dd", ".fin-key dd"])}
    ${finText("m", [".fin-pipe-name"])}
    ${finText("xs", [".fin-badge", ".fin-met", ".fin-pill", ".fin-node-tag", ".fin-item-id", ".fin-item", ".fin-mover-title", ".fin-nc"])}
    ${finText("xxs", [".fin-mover-status"])}
    @media (max-width: 720px) {
      .fin-page[data-fin-theme="brutalist"] h1 { ${text("xl")} }
    }
`;
