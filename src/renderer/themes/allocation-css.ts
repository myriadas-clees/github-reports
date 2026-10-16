// Shared CSS for the "Where the effort went" section (allocation partial).
// Each theme passes its own CSS variables/fonts so the section matches the theme,
// while the data-viz palette (validated with the dataviz skill) stays identical.

/** Categorical slots 1-6 (light / dark). Same entity -> same slot everywhere. */
export const INITIATIVE_PALETTE: { light: string; dark: string }[] = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#eb6834", dark: "#d95926" }, // orange
  { light: "#1baf7a", dark: "#199e70" }, // aqua
  { light: "#eda100", dark: "#c98500" }, // yellow
  { light: "#e87ba4", dark: "#d55181" }, // magenta
  { light: "#008300", dark: "#008300" }, // green
];
export const OTHER_COLOR = { light: "#8b8a86", dark: "#8a8984" };

/** Separate small palette for work types (violet, magenta, yellow, aqua, orange) + neutral. */
export const WORK_TYPE_PALETTE: { light: string; dark: string }[] = [
  { light: "#4a3aa7", dark: "#9085e9" }, // new capability
  { light: "#e87ba4", dark: "#d55181" }, // quality
  { light: "#eda100", dark: "#c98500" }, // maintenance
  { light: "#1baf7a", dark: "#199e70" }, // documentation
  { light: "#eb6834", dark: "#d95926" }, // team support
];
export const UNLOGGED_COLOR = { light: "#8b8a86", dark: "#8a8984" };

const luminance = (hex: string): number => {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
};

/** Text ink (black or white) with the better contrast on a given fill. */
export const inkFor = (hex: string): string => {
  const l = luminance(hex);
  const white = 1.05 / (l + 0.05);
  const black = (l + 0.05) / 0.0555;
  return white >= black ? "#ffffff" : "#111111";
};

const colorVars = (mode: "light" | "dark"): string => {
  const lines: string[] = [];
  INITIATIVE_PALETTE.forEach((p, i) => {
    lines.push(`--alloc-c${i + 1}: ${p[mode]}; --alloc-c${i + 1}-ink: ${inkFor(p[mode])};`);
  });
  lines.push(`--alloc-other: ${OTHER_COLOR[mode]}; --alloc-other-ink: ${inkFor(OTHER_COLOR[mode])};`);
  WORK_TYPE_PALETTE.forEach((p, i) => {
    lines.push(`--alloc-w${i + 1}: ${p[mode]}; --alloc-w${i + 1}-ink: ${inkFor(p[mode])};`);
  });
  lines.push(`--alloc-wn: ${UNLOGGED_COLOR[mode]}; --alloc-wn-ink: ${inkFor(UNLOGGED_COLOR[mode])};`);
  return lines.join("\n      ");
};

export type AllocationCssTheme = {
  /** Which mode the theme's :root defaults to (the other is a media query + [data-theme]). */
  defaultMode: "light" | "dark";
  /** CSS values, usually `var(--x-...)`. */
  text: string;
  textSecondary: string;
  textTertiary: string;
  heading: string;
  border: string;
  borderSubtle: string;
  surface: string;
  accent: string;
  mono: string;
  /** Bar corner radius, e.g. "0" or "4px". */
  radius: string;
  /** Extra rules appended (theme-specific tweaks). */
  extra?: string;
};

export const buildAllocationCSS = (t: AllocationCssTheme): string => {
  const base = t.defaultMode;
  const alt = base === "light" ? "dark" : "light";
  return `
    /* ==================== ALLOCATION ("Where the effort went") ==================== */
    .alloc {
      ${colorVars(base)}
      margin-bottom: 3rem;
      color: ${t.text};
    }
    @media (prefers-color-scheme: ${alt}) {
      :root:not([data-theme="${base}"]) .alloc {
        ${colorVars(alt)}
      }
    }
    html[data-theme="${alt}"] .alloc {
      ${colorVars(alt)}
    }
    html[data-theme="${base}"] .alloc {
      ${colorVars(base)}
    }

    .alloc-c1 { --c: var(--alloc-c1); --ink: var(--alloc-c1-ink); }
    .alloc-c2 { --c: var(--alloc-c2); --ink: var(--alloc-c2-ink); }
    .alloc-c3 { --c: var(--alloc-c3); --ink: var(--alloc-c3-ink); }
    .alloc-c4 { --c: var(--alloc-c4); --ink: var(--alloc-c4-ink); }
    .alloc-c5 { --c: var(--alloc-c5); --ink: var(--alloc-c5-ink); }
    .alloc-c6 { --c: var(--alloc-c6); --ink: var(--alloc-c6-ink); }
    .alloc-other { --c: var(--alloc-other); --ink: var(--alloc-other-ink); }
    .alloc-w1 { --c: var(--alloc-w1); --ink: var(--alloc-w1-ink); }
    .alloc-w2 { --c: var(--alloc-w2); --ink: var(--alloc-w2-ink); }
    .alloc-w3 { --c: var(--alloc-w3); --ink: var(--alloc-w3-ink); }
    .alloc-w4 { --c: var(--alloc-w4); --ink: var(--alloc-w4-ink); }
    .alloc-w5 { --c: var(--alloc-w5); --ink: var(--alloc-w5-ink); }
    .alloc-wn { --c: var(--alloc-wn); --ink: var(--alloc-wn-ink); }

    .alloc-lede { color: ${t.textSecondary}; margin: 0 0 1.5rem; max-width: 60ch; }
    .alloc-block { margin: 0 0 2rem; }
    .alloc-sub {
      display: flex; align-items: baseline; justify-content: space-between; gap: 1rem;
      margin: 0 0 0.6rem;
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
      color: ${t.textSecondary};
    }
    .alloc-sub-meta { font-family: ${t.mono}; font-weight: 400; text-transform: none; letter-spacing: 0; color: ${t.textTertiary}; }

    /* Stacked 100% bars: flex-grow carries the share; the 2px gap is the surface showing through. */
    .alloc-bar {
      display: flex; gap: 2px; height: 32px; overflow: hidden;
      border-radius: ${t.radius};
      background: ${t.surface};
    }
    .alloc-bar--md { height: 18px; }
    .alloc-bar--sm { height: 12px; }
    .alloc-bar--trend { height: 16px; }
    .alloc-seg {
      flex: var(--grow, 1) 1 0; min-width: 3px;
      background: var(--c); color: var(--ink);
      display: flex; align-items: center; justify-content: flex-start; gap: 0.35em;
      padding: 0 0.5rem; overflow: hidden; white-space: nowrap;
      font-size: 0.75rem; font-weight: 600; line-height: 1;
    }
    .alloc-seg-name { overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
    .alloc-bar--md .alloc-seg, .alloc-bar--sm .alloc-seg, .alloc-bar--trend .alloc-seg { font-size: 0.6875rem; padding: 0 0.35rem; }
    .alloc-bar--sm .alloc-seg, .alloc-bar--trend .alloc-seg { padding: 0; }
    .alloc-wn .alloc-seg, .alloc-seg.alloc-wn {
      background-image: repeating-linear-gradient(45deg, transparent 0 4px, color-mix(in srgb, ${t.surface} 55%, transparent) 4px 6px);
    }

    .alloc-legend { list-style: none; margin: 0.75rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.35rem 1.25rem; font-size: 0.8125rem; }
    .alloc-legend li { display: inline-flex; align-items: center; gap: 0.45rem; color: ${t.text}; }
    .alloc-swatch { width: 10px; height: 10px; flex: none; border-radius: 2px; background: var(--c); }
    .alloc-swatch.alloc-wn {
      background-image: repeating-linear-gradient(45deg, transparent 0 3px, color-mix(in srgb, ${t.surface} 55%, transparent) 3px 4.5px);
    }
    .alloc-legend-pct { font-weight: 600; font-variant-numeric: tabular-nums; }

    .alloc-worktypes { margin-top: 1.5rem; }

    /* Per-initiative list */
    .alloc-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid ${t.border}; }
    .alloc-item { padding: 1rem 0; border-bottom: 1px solid ${t.border}; }
    .alloc-item-head {
      display: grid; grid-template-columns: minmax(8rem, 14rem) 3.5rem minmax(4rem, 1fr);
      align-items: center; gap: 0.75rem;
    }
    .alloc-item-name { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 600; color: ${t.heading}; min-width: 0; }
    .alloc-item-name span:last-child { overflow-wrap: anywhere; }
    .alloc-item-pct { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
    .alloc-item-track { height: 6px; background: ${t.borderSubtle}; border-radius: ${t.radius}; overflow: hidden; }
    .alloc-item-fill { display: block; height: 100%; background: var(--c); min-width: 2px; border-radius: ${t.radius}; }
    .alloc-work { margin: 0.6rem 0 0; display: grid; gap: 0.35rem; font-size: 0.875rem; }
    .alloc-work-row { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.75rem; align-items: baseline; }
    .alloc-work-label { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.08em; color: ${t.textTertiary}; }
    .alloc-work-links { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.15rem 1rem; }
    .alloc-work-links li { min-width: 0; }
    .alloc-work-links a { color: ${t.text}; text-decoration-color: ${t.border}; text-underline-offset: 2px; }
    .alloc-work-links a:hover { color: ${t.accent}; text-decoration-color: ${t.accent}; }
    .alloc-repo { color: ${t.textTertiary}; font-size: 0.75rem; margin-left: 0.35rem; }
    .alloc-more { margin-top: 0.5rem; font-size: 0.8125rem; }
    .alloc-more > summary { cursor: pointer; color: ${t.textSecondary}; width: fit-content; }
    .alloc-more > summary:hover { color: ${t.accent}; }
    .alloc-more > summary:focus-visible, .alloc-table-wrap > summary:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
    .alloc-more ul { list-style: none; margin: 0.5rem 0 0; padding: 0; display: grid; gap: 0.3rem; }
    .alloc-kind { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.06em; color: ${t.textTertiary}; margin-right: 0.4rem; }
    .alloc-tag {
      display: inline-block; font-size: 0.6875rem; line-height: 1; padding: 0.2rem 0.4rem;
      border: 1px solid ${t.border}; color: ${t.textSecondary}; border-radius: ${t.radius}; margin-left: 0.4rem;
      white-space: nowrap;
    }
    .alloc-tag--self { border-style: dashed; }
    .alloc-impact {
      display: inline-block; font-size: 0.625rem; line-height: 1; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
      padding: 0.2rem 0.4rem; margin-right: 0.5rem; border-radius: ${t.radius}; vertical-align: 0.08em; white-space: nowrap;
    }
    .alloc-impact--major { background: ${t.heading}; color: ${t.surface}; border: 1px solid ${t.heading}; }
    .alloc-impact--notable { background: transparent; color: ${t.textSecondary}; border: 1px solid ${t.border}; }
    .alloc-more--shipped { margin-top: 0.4rem; }
    .alloc-more--shipped ul { display: flex; flex-wrap: wrap; gap: 0.15rem 1rem; }

    /* Trend */
    .alloc-trend { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .alloc-trend-row { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr) 4rem; align-items: center; gap: 0.75rem; }
    .alloc-trend-label { font-size: 0.8125rem; color: ${t.textSecondary}; }
    .alloc-trend-row.is-current .alloc-trend-label { color: ${t.heading}; font-weight: 600; }
    .alloc-trend-total { font-family: ${t.mono}; font-size: 0.8125rem; color: ${t.textSecondary}; text-align: right; }
    .alloc-trend-empty {
      font-size: 0.75rem; color: ${t.textTertiary}; font-style: italic;
      border-bottom: 1px dashed ${t.border}; height: 16px; display: flex; align-items: center;
    }
    .alloc-table-wrap { margin-top: 1rem; font-size: 0.8125rem; }
    .alloc-table-wrap > summary { cursor: pointer; color: ${t.textSecondary}; width: fit-content; }
    .alloc-table-scroll { overflow-x: auto; margin-top: 0.5rem; }
    .alloc-table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
    .alloc-table th, .alloc-table td { padding: 0.35rem 0.6rem; border-bottom: 1px solid ${t.border}; text-align: right; white-space: nowrap; }
    .alloc-table th:first-child, .alloc-table td:first-child { text-align: left; }
    .alloc-table th { font-weight: 600; color: ${t.textSecondary}; }

    .alloc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

    .alloc-foot { margin: 1.5rem 0 0; font-size: 0.8125rem; color: ${t.textSecondary}; max-width: 70ch; }
    .alloc-foot p { margin: 0 0 0.3rem; }
    .alloc-foot-title { color: ${t.heading}; font-weight: 600; }

    @media (max-width: 640px) {
      .alloc-item-head { grid-template-columns: 1fr auto; }
      .alloc-item-track { grid-column: 1 / -1; grid-row: 2; }
      .alloc-work-row { grid-template-columns: 1fr; gap: 0.1rem; }
      .alloc-trend-row { grid-template-columns: 1fr 3.5rem; }
      .alloc-trend-label { grid-column: 1; }
      .alloc-trend-total { grid-column: 2; grid-row: 1; }
      .alloc-trend-bar { grid-column: 1 / -1; }
    }
    @media (forced-colors: active) {
      .alloc-seg, .alloc-item-fill, .alloc-swatch { forced-color-adjust: none; }
    }
    @media print { .alloc-more:not([open]) > :not(summary) { display: none; } }
    ${t.extra ?? ""}
  `;
};
