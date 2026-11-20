// Shared CSS for the site navigation layers: planning links, month -> work-week -> day
// ledger on the homepage, the work-week page, and the "see the whole week" link on daily pages.
// Themes pass their own CSS variables (same shape as the allocation section).

import type { AllocationCssTheme } from "./allocation-css.js";

/**
 * Month / day-row ledger for themes that did not already ship one (minimal, editorial, swiss).
 * Brutalist defines its own richer version in its index stylesheet.
 */
export const buildLedgerCSS = (t: AllocationCssTheme): string => `
    .ledger { margin: 2rem 0 1.5rem; border-top: 1px solid ${t.border}; }
    .ledger-heading {
      display: flex; justify-content: space-between; padding: 0.7rem 0; border-bottom: 1px solid ${t.border};
      font-family: ${t.mono}; font-size: 0.6875rem; letter-spacing: 0.1em; text-transform: uppercase; color: ${t.textTertiary};
    }
    .month-group { border-bottom: 1px solid ${t.border}; }
    .month-summary {
      list-style: none; cursor: pointer; display: grid; grid-template-columns: 7rem 12rem minmax(4rem, 1fr) auto 2rem;
      gap: 1rem; align-items: center; padding: 1.1rem 0;
    }
    .month-summary::-webkit-details-marker { display: none; }
    .month-summary:hover .month-name span { color: ${t.accent}; }
    .month-summary:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 4px; }
    .month-name span { display: block; font-size: 1.15rem; font-weight: 700; color: ${t.heading}; }
    .month-name strong { font-family: ${t.mono}; font-size: 0.65rem; font-weight: 400; color: ${t.textTertiary}; }
    .month-tape { grid-column: 3; height: 28px; display: flex; align-items: end; gap: 3px; }
    .month-tape i { display: block; flex: 1 1 0; min-width: 3px; max-width: 10px; height: max(3px, var(--activity)); background: ${t.border}; }
    .month-group[open] .month-tape { display: none; }
    .month-tape i { background: ${t.accent}; }
    .month-name { grid-column: 1; }
    .month-days { grid-column: 2; }
    .month-totals { grid-column: 4; display: flex; gap: 0.9rem; font-size: 0.75rem; color: ${t.textTertiary}; white-space: nowrap; }
    .month-totals b { color: ${t.textSecondary}; font-weight: 500; }
    .month-count { grid-column: 5; text-align: right; color: ${t.accent}; }
    .month-count::after { content: '+'; font-size: 1rem; }
    .month-group[open] .month-count::after { content: '\\2212'; }
    .day-list { border-top: 1px solid ${t.borderSubtle}; }
    .day-row {
      display: grid; grid-template-columns: 4rem minmax(0, 1fr) auto 1.5rem; gap: 1rem; align-items: center;
      padding: 0.65rem 0.5rem 0.65rem 0; color: inherit; text-decoration: none; border-bottom: 1px solid ${t.borderSubtle};
    }
    .day-row:hover { background: color-mix(in srgb, ${t.accent} 6%, transparent); }
    .day-row:focus-visible { outline: 2px solid ${t.accent}; outline-offset: -2px; }
    .day-date { display: flex; align-items: baseline; gap: 0.4rem; font-family: ${t.mono}; }
    .day-date strong { color: ${t.accent}; font-size: 1.15rem; }
    .day-date span { color: ${t.textTertiary}; font-size: 0.62rem; text-transform: uppercase; }
    .day-title { font-size: 0.9rem; font-weight: 600; color: ${t.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .day-subtitle { margin-top: 0.15rem; color: ${t.textTertiary}; font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .day-stats { display: flex; gap: 0.7rem; font-family: ${t.mono}; font-size: 0.6875rem; color: ${t.textTertiary}; white-space: nowrap; }
    .day-stats b { color: ${t.text}; }
    .day-open { color: ${t.accent}; opacity: 0; }
    .day-row:hover .day-open { opacity: 1; }
    @media (max-width: 640px) {
      .month-summary { grid-template-columns: 1fr 2rem; gap: 0.5rem 1rem; }
      .month-name { grid-column: 1; grid-row: 1; }
      .month-count { grid-column: 2; grid-row: 1; }
      .month-days { grid-column: 1 / -1; grid-row: 2; }
      .month-tape { grid-column: 1 / -1; grid-row: 3; }
      .month-totals { grid-column: 1 / -1; grid-row: 4; flex-wrap: wrap; gap: 0.2rem 0.9rem; white-space: normal; }
      .day-row { grid-template-columns: 3.25rem minmax(0, 1fr) 1rem; gap: 0.2rem 0.7rem; align-items: start; }
      .day-title, .day-subtitle { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
      .day-date { grid-column: 1; grid-row: 1; }
      .day-story { grid-column: 2; grid-row: 1; }
      .day-stats { grid-column: 2; grid-row: 2; flex-wrap: wrap; gap: 0.1rem 0.7rem; }
      .day-row .day-open { grid-column: 3; grid-row: 1; }
      .day-open { opacity: 1; }
    }
`;

/** Planning links, week rows (homepage), week page chrome, and the daily-page week link. */
export const buildWeekCSS = (t: AllocationCssTheme): string => `
    /* ==================== PLANNING + WORK WEEKS ==================== */
    .planning {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem 1.25rem; margin: 1.5rem 0 3rem; padding: 1rem 0 0;
      border-top: 1px solid ${t.borderSubtle};
      font-size: 0.875rem;
    }
    .planning-title {
      margin: 0; font-family: ${t.mono}; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: ${t.textTertiary};
    }
    .planning-links { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.35rem 1.1rem; }
    .planning-links a { color: ${t.accent}; text-decoration: none; border-bottom: 1px solid transparent; }
    .planning-links a:hover, .planning-links a:focus-visible { border-bottom-color: currentColor; }

    .week-ledger { border-top: 1px solid ${t.borderSubtle}; padding-bottom: 0.75rem; }
    .week-block { border-bottom: 1px solid ${t.borderSubtle}; }
    .week-row {
      display: grid; grid-template-columns: 8.5rem minmax(0, 1fr) auto 1.5rem; gap: 1rem; align-items: start;
      padding: 0.9rem 0.5rem 0.9rem 0; color: inherit; text-decoration: none;
    }
    .week-row:hover { background: color-mix(in srgb, ${t.accent} 6%, transparent); }
    .week-row:focus-visible { outline: 2px solid ${t.accent}; outline-offset: -2px; }
    .week-row:hover .day-open { opacity: 1; }
    .week-label strong { display: block; font-family: ${t.mono}; font-size: 1rem; color: ${t.accent}; }
    .week-flag { display: block; margin-top: 0.15rem; font-size: 0.6875rem; color: ${t.textTertiary}; }
    .week-story { min-width: 0; }
    .week-delivered { font-size: 0.95rem; font-weight: 650; color: ${t.heading}; }
    .week-mix { margin-top: 0.4rem; }
    .week-mix-track { display: block; width: 100%; }
    .week-mix-fill { display: block; min-width: 6px; }
    .week-mix .alloc-bar { height: 10px; }
    .week-initiatives, .week-initiatives.alloc { list-style: none; margin: 0.4rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.15rem 0.9rem; font-size: 0.75rem; color: ${t.textSecondary}; }
    .week-initiatives li { display: inline-flex; align-items: center; gap: 0.3rem; }
    .week-initiatives b { font-family: ${t.mono}; font-weight: 500; color: ${t.textSecondary}; }
    .week-outcome { margin-top: 0.35rem; font-size: 0.8125rem; color: ${t.textSecondary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .week-counts { display: flex; gap: 0.9rem; padding-top: 0.2rem; font-size: 0.75rem; color: ${t.textTertiary}; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .week-counts b { color: ${t.textSecondary}; font-weight: 500; }
    .week-row .day-open { padding-top: 0.15rem; }
    .week-days { margin: 0 0 0.6rem 9.5rem; font-size: 0.78rem; }
    .week-days > summary {
      cursor: pointer; display: inline-block; padding: 0.15rem 0; font-family: ${t.mono}; font-size: 0.6875rem;
      letter-spacing: 0.06em; text-transform: uppercase; color: ${t.textTertiary};
    }
    .week-days > summary:hover { color: ${t.accent}; }
    .week-days > summary:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
    .week-days[open] > summary { margin-bottom: 0.3rem; }
    @media (max-width: 720px) {
      .week-row { grid-template-columns: minmax(0, 1fr) 1rem; gap: 0.4rem 0.7rem; }
      .week-label { grid-column: 1; grid-row: 1; display: flex; align-items: baseline; gap: 0.6rem; }
      .week-row .day-open { grid-column: 2; grid-row: 1; }
      .week-story { grid-column: 1 / -1; grid-row: 2; }
      .week-counts { grid-column: 1 / -1; grid-row: 3; flex-wrap: wrap; gap: 0.1rem 0.9rem; padding-top: 0; }
      .week-flag { margin-top: 0; }
      .week-outcome { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
      .week-days { margin-left: 0; }
      .home-hero-top { flex-direction: column; align-items: flex-start; }
    }

    /* Homepage hero: estimated effort + initiative mix */
    .alloc.alloc--inline { margin: 0; }
    .est-tag {
      display: inline-block; vertical-align: middle; padding: 0.05rem 0.35rem; border: 1px solid ${t.border}; border-radius: 2px;
      font-family: ${t.mono}; font-size: 0.5625rem; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase;
      color: ${t.textTertiary}; white-space: nowrap;
    }
    .home-hero { margin: 2rem 0 0; }
    .home-hero-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 1.25rem 2.5rem; }
    .home-hero-days { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.7rem; }
    .home-hero-value { font-size: clamp(2.5rem, 6vw, 4.25rem); font-weight: 800; line-height: 1; letter-spacing: -0.04em; color: ${t.accent}; font-variant-numeric: tabular-nums; }
    .home-hero-unit { font-size: 1.15rem; font-weight: 600; color: ${t.heading}; }
    .est-note { margin: 0.6rem 0 0; max-width: 48ch; font-size: 0.8125rem; line-height: 1.45; color: ${t.textSecondary}; }
    .home-hero-counts { display: flex; gap: 1.5rem; margin: 0; padding: 0; }
    .home-hero-counts div { display: flex; flex-direction: column-reverse; }
    .home-hero-counts dt { margin: 0; font-family: ${t.mono}; font-size: 0.625rem; letter-spacing: 0.08em; text-transform: uppercase; color: ${t.textTertiary}; }
    .home-hero-counts dd { margin: 0; font-size: 1.05rem; font-weight: 600; color: ${t.textSecondary}; font-variant-numeric: tabular-nums; }
    .home-hero-mix { margin-top: 1.5rem; }
    .home-hero-mix .alloc-bar { height: 22px; }
    .home-hero-mix .alloc-legend { margin-top: 0.6rem; }

    /* Work-week page */
    .week-crumbs { display: flex; flex-wrap: wrap; gap: 0.4rem 0.9rem; margin: 0 0 1rem; font-size: 0.8125rem; }
    .week-crumbs a { color: ${t.accent}; text-decoration: none; }
    .week-crumbs a:hover { text-decoration: underline; }
    .week-crumbs span { color: ${t.textTertiary}; }
    .week-title { margin: 0 0 0.35rem; }
    .week-dates { margin: 0; color: ${t.textSecondary}; font-family: ${t.mono}; font-size: 0.8125rem; }
    .week-days-section { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem 1.25rem; margin: 0 0 2rem; padding: 0.75rem 0; border-top: 1px solid ${t.borderSubtle}; border-bottom: 1px solid ${t.borderSubtle}; }
    .week-days-label { font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: ${t.textSecondary}; }
    .week-day-links { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.35rem 1.1rem; font-size: 0.9rem; }
    .week-day-links a { color: ${t.accent}; text-decoration: none; }
    .week-day-links a:hover { text-decoration: underline; }
    .week-pager { display: flex; justify-content: space-between; gap: 1rem; margin: 2rem 0 0; font-size: 0.875rem; }
    .week-pager a { color: ${t.accent}; text-decoration: none; }
    .week-pager a:hover { text-decoration: underline; }

    /* Daily report -> whole week */
    .week-link { margin: 0.9rem 0 0; font-size: 0.875rem; }
    .week-link a { color: ${t.accent}; text-decoration: none; font-weight: 600; }
    .week-link a:hover, .week-link a:focus-visible { text-decoration: underline; }
    .alloc .week-link { margin: 0 0 1rem; }
`;
