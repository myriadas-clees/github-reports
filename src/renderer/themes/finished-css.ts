// Shared CSS for the static "How we say something is finished" page.
// Colors come only from theme tokens (CSS variables), so light and dark follow the theme.
// Without JavaScript every panel is shown stacked; the inline script adds `fin-js` to <html> and the
// tabbed explorer, toggles and animations switch on from there.

/** Theme tokens for the explainer: CSS values (usually `var(--x-...)`) plus per-theme shape and shadow. */
export type FinishedCssTheme = {
  text: string;
  textSecondary: string;
  heading: string;
  border: string;
  surface: string;
  accent: string;
  mono: string;
  /** Font for small uppercase labels (mono for most themes, the body face for editorial). */
  labelFont: string;
  /** Card corner radius ("0" for square themes). */
  radius: string;
  /** Radius for inner tiles (sample cards, scenario buttons). */
  radiusSmall: string;
  /** Radius for pills, chips, buttons and segmented controls. */
  pillRadius: string;
  /** Radius for stage dots and bullets. */
  dotRadius: string;
  /** Resting and hover elevation for cards. */
  shadow: string;
  hoverShadow: string;
  /** Horizontal page padding; "0" when the theme's body already sets the reading column. */
  padX: string;
  padXNarrow: string;
  /** Top padding; larger when the theme has a fixed nav bar. */
  padTop: string;
};

export const buildFinishedCSS = (t: FinishedCssTheme): string => `
    /* ==================== FINISHED-STATE EXPLAINER ==================== */
    /* Report themes lock html/body to the viewport (app-style scroll); this page is a normal long document. */
    html, body { height: auto; overflow: auto; }

    .fin-page {
      --fin-text: ${t.text};
      --fin-text-2: ${t.textSecondary};
      --fin-heading: ${t.heading};
      --fin-line: ${t.border};
      --fin-surface: ${t.surface};
      --fin-accent: ${t.accent};
      --fin-raised: color-mix(in srgb, var(--fin-heading) 3.5%, var(--fin-surface));
      --fin-sunk: color-mix(in srgb, var(--fin-heading) 7%, var(--fin-surface));
      --fin-line-strong: color-mix(in srgb, var(--fin-heading) 30%, var(--fin-surface));
      --fin-accent-soft: color-mix(in srgb, var(--fin-accent) 13%, var(--fin-surface));
      --fin-accent-line: color-mix(in srgb, var(--fin-accent) 60%, var(--fin-surface));
      --fin-r: ${t.radius};
      --fin-r-sm: ${t.radiusSmall};
      --fin-r-pill: ${t.pillRadius};
      --fin-r-dot: ${t.dotRadius};
      --fin-shadow: ${t.shadow};
      --fin-shadow-hover: ${t.hoverShadow};
      --fin-label: ${t.labelFont};
      --fin-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
      --fin-pad-x: ${t.padX};
      width: 100%; max-width: 960px; margin: 0 auto; padding: ${t.padTop} var(--fin-pad-x) 4rem;
      box-sizing: border-box; color: var(--fin-text); container: fin / inline-size;
    }
    @media (max-width: 768px) { .fin-page { --fin-pad-x: ${t.padXNarrow}; } }
    .fin-page *, .fin-page *::before, .fin-page *::after { box-sizing: border-box; }
    .fin-page [hidden] { display: none !important; }
    .fin-page h1, .fin-page h2, .fin-page h3, .fin-page h4 { color: var(--fin-heading); padding: 0; border: 0; }
    :where(.fin-page) p { margin: 0; }
    .fin-page abbr { text-decoration: underline dotted; text-underline-offset: 3px; cursor: help; }
    :where(.fin-page) button { font: inherit; letter-spacing: inherit; text-transform: none; }
    .fin-page :is(a, button, summary, [tabindex]):focus-visible { outline: 2px solid var(--fin-accent); outline-offset: 3px; }
    html:not(.fin-js) .fin-js-only { display: none !important; }

    .fin-page .fin-label {
      font-family: var(--fin-label); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--fin-text-2); line-height: 1.3;
    }

    /* ---------- Hero ---------- */
    .fin-hero { margin: 0 0 3rem; }
    .fin-eyebrow { display: flex; align-items: center; gap: 0.6rem; margin: 0 0 1rem; }
    .fin-eyebrow::before { content: ""; width: 1.75rem; height: 2px; background: var(--fin-accent); }
    .fin-page h1 {
      margin: 0 0 1rem; max-width: 22ch; font-size: clamp(2.1rem, 6.4cqi, 3.4rem); line-height: 1.05;
      letter-spacing: -0.03em; overflow-wrap: anywhere;
    }
    .fin-sub { max-width: 46ch; margin: 0 0 2.25rem; font-size: 1.125rem; line-height: 1.55; color: var(--fin-text-2); }
    .fin-questions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.85rem; }
    .fin-page a.fin-q {
      position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.3rem 0.75rem;
      min-height: 44px; padding: 1.05rem 1.15rem 1.1rem;
      color: var(--fin-text); text-decoration: none; background: var(--fin-raised); border: 1px solid var(--fin-line);
      border-radius: var(--fin-r); box-shadow: var(--fin-shadow);
      transition: transform 220ms var(--fin-ease), box-shadow 220ms var(--fin-ease), border-color 220ms ease;
    }
    .fin-page a.fin-q:hover { transform: translateY(-3px); box-shadow: var(--fin-shadow-hover); border-color: var(--fin-line-strong); background: var(--fin-raised); color: var(--fin-text); }
    .fin-q-ask { font-size: 1.2rem; font-weight: 700; line-height: 1.25; color: var(--fin-heading); letter-spacing: -0.01em; }
    .fin-q-ans { display: flex; align-items: center; gap: 0.45rem; font-size: 0.875rem; color: var(--fin-text-2); }
    .fin-q-ans abbr { color: var(--fin-heading); font-weight: 700; }
    .fin-q-arrow { grid-column: 2; grid-row: 1 / span 2; font-size: 1.1rem; color: var(--fin-heading); transition: transform 220ms var(--fin-ease); }
    .fin-page a.fin-q:hover .fin-q-arrow { transform: translateX(4px); }

    /* ---------- Explorer: segmented tabs ---------- */
    .fin-explorer { margin: 0 0 4rem; scroll-margin-top: 5rem; }
    .fin-tabs {
      position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: fit-content; max-width: 100%;
      margin: 0 0 2.25rem; padding: 4px; background: var(--fin-sunk); border: 1px solid var(--fin-line); border-radius: var(--fin-r-pill);
    }
    .fin-tabs-thumb {
      position: absolute; z-index: 0; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / 3);
      background: var(--fin-heading); border-radius: var(--fin-r-pill);
      transform: translateX(calc(var(--fin-tab, 0) * 100%)); transition: transform 340ms var(--fin-ease);
    }
    .fin-tab {
      position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
      min-height: 44px; padding: 0.6rem 1.3rem; margin: 0; border: 0; border-radius: var(--fin-r-pill); background: transparent;
      color: var(--fin-text-2); font-size: 0.9375rem; font-weight: 600; line-height: 1.2; text-align: center;
      cursor: pointer; transition: color 240ms ease;
    }
    .fin-tab:hover { color: var(--fin-heading); }
    .fin-tab[aria-selected="true"] { color: var(--fin-surface); }
    .fin-tab svg { flex: none; width: 18px; height: 18px; }

    /* ---------- Panels ---------- */
    .fin-panel { scroll-margin-top: 9rem; border-radius: var(--fin-r); }
    html:not(.fin-js) .fin-panel + .fin-panel { margin-top: 3.5rem; padding-top: 3rem; border-top: 1px solid var(--fin-line); }
    html.fin-js .fin-panel:not(.is-active) { display: none; }
    .fin-panel.is-entering { animation: fin-enter 340ms var(--fin-ease) both; }
    @keyframes fin-enter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .fin-panel:focus-visible { outline-offset: 10px; }
    .fin-panel-head { max-width: 40rem; margin: 0 0 2rem; }
    .fin-panel h2 { margin: 0 0 0.55rem; font-size: clamp(1.45rem, 3.6cqi, 1.9rem); line-height: 1.15; letter-spacing: -0.02em; }
    .fin-lead { font-size: 1.0625rem; line-height: 1.55; color: var(--fin-text-2); }

    /* Shared bits */
    .fin-badge {
      display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.3rem 0.75rem; font-size: 0.8125rem; font-weight: 700;
      line-height: 1.2; white-space: nowrap; border-radius: var(--fin-r-pill);
    }
    .fin-badge::before { content: ""; flex: none; width: 0.5rem; height: 0.5rem; border-radius: var(--fin-r-dot); }
    .fin-badge--ready { color: var(--fin-heading); background: var(--fin-accent-soft); border: 1px solid var(--fin-accent-line); }
    .fin-badge--ready::before { background: var(--fin-accent); }
    .fin-badge--no { color: var(--fin-text-2); background: transparent; border: 1px dashed var(--fin-line-strong); }
    .fin-badge--no::before { border: 1.5px solid currentColor; }
    .fin-pill {
      display: inline-block; padding: 0.25rem 0.7rem; font-size: 0.78rem; line-height: 1.3; color: var(--fin-text-2);
      border: 1px solid var(--fin-line); border-radius: var(--fin-r-pill); background: var(--fin-surface);
    }
    .fin-quote { font-style: italic; color: var(--fin-text-2); }
    .fin-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; min-height: 44px; padding: 0.55rem 1.15rem;
      font-size: 0.9rem; font-weight: 600; color: var(--fin-heading); background: var(--fin-surface);
      border: 1px solid var(--fin-line-strong); border-radius: var(--fin-r-pill); cursor: pointer;
      transition: background 200ms ease, color 200ms ease, border-color 200ms ease, transform 150ms ease, opacity 200ms ease;
    }
    .fin-btn:hover { border-color: var(--fin-heading); }
    .fin-btn:active { transform: translateY(1px); }
    .fin-btn--primary { color: var(--fin-surface); background: var(--fin-heading); border-color: var(--fin-heading); }
    .fin-btn[aria-disabled="true"] { opacity: 0.4; cursor: default; }
    .fin-btn[aria-disabled="true"]:active { transform: none; }
    .fin-btn--small { min-height: 44px; padding: 0.4rem 1rem; font-size: 0.8125rem; }
    .fin-page .fin-callout {
      display: flex; gap: 0.75rem; align-items: flex-start; margin: 2rem 0 0; padding: 1rem 1.2rem;
      color: var(--fin-text); background: var(--fin-raised); border: 1px solid var(--fin-line); border-left: 3px solid var(--fin-accent);
      border-radius: var(--fin-r-sm); line-height: 1.55;
    }
    .fin-callout strong { color: var(--fin-heading); }
    .fin-seg {
      display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; padding: 4px;
      background: var(--fin-sunk); border: 1px solid var(--fin-line); border-radius: var(--fin-r-pill);
    }
    .fin-seg-btn {
      min-height: 44px; padding: 0.5rem 0.45rem; margin: 0; font-size: 0.8125rem; font-weight: 600; line-height: 1.2;
      color: var(--fin-text-2); background: transparent; border: 1px solid transparent; border-radius: var(--fin-r-pill); cursor: pointer;
      transition: background 240ms ease, color 240ms ease, border-color 240ms ease, box-shadow 240ms ease;
    }
    .fin-seg-btn:hover { color: var(--fin-heading); }
    .fin-seg-btn[aria-pressed="true"] { color: var(--fin-heading); background: var(--fin-surface); border-color: var(--fin-line-strong); box-shadow: var(--fin-shadow); }
    .fin-seg-btn[data-fin-venn-set="both"][aria-pressed="true"] { background: var(--fin-accent-soft); border-color: var(--fin-accent-line); }
    .fin-short { display: none; }
    .fin-venn-main .fin-seg { grid-auto-columns: auto; }

    /* ---------- Panel 1: Venn ---------- */
    .fin-venn { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2.25rem 2.75rem; align-items: start; }
    .fin-venn-main { display: flex; flex-direction: column; gap: 1.1rem; min-width: 0; }
    .fin-venn-main > .fin-label { margin: 0.4rem 0 -0.5rem; }
    .fin-venn-art { position: relative; margin: 0; aspect-ratio: 360 / 232; container-type: inline-size; }
    .fin-venn-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .fin-c {
      fill: var(--fin-surface); fill-opacity: 0.6; stroke: var(--fin-line-strong); stroke-width: 1.5; stroke-dasharray: 5 6;
      transition: fill 320ms ease, fill-opacity 320ms ease, stroke 320ms ease;
    }
    .fin-venn[data-state="dod"] .fin-c--dod, .fin-venn[data-state="ac"] .fin-c--ac, .fin-venn[data-state="both"] .fin-c {
      fill: var(--fin-heading); fill-opacity: 0.07; stroke: var(--fin-heading); stroke-dasharray: none;
    }
    .fin-lens {
      fill: var(--fin-accent); fill-opacity: 0; stroke: var(--fin-accent); stroke-width: 2; stroke-opacity: 0;
      transform-box: fill-box; transform-origin: center; transition: fill-opacity 380ms ease, stroke-opacity 380ms ease;
    }
    .fin-venn[data-state="both"] .fin-lens { fill-opacity: 0.18; stroke-opacity: 1; }
    .fin-venn.is-pulsing[data-state="both"] .fin-lens { animation: fin-lens-pulse 1300ms ease-out 1; }
    @keyframes fin-lens-pulse {
      0% { fill-opacity: 0.04; transform: scale(0.94); }
      40% { fill-opacity: 0.34; transform: scale(1.045); }
      70% { fill-opacity: 0.14; transform: scale(0.99); }
      100% { fill-opacity: 0.18; transform: scale(1); }
    }
    .fin-venn-label {
      position: absolute; top: 50%; width: 27%; transform: translate(-50%, -50%); display: flex; flex-direction: column;
      align-items: center; gap: 0.2rem; text-align: center; transition: opacity 320ms ease;
    }
    .fin-venn-label--dod { left: 19%; }
    .fin-venn-label--ac { left: 81%; }
    .fin-venn[data-state="ac"] .fin-venn-label--dod, .fin-venn[data-state="dod"] .fin-venn-label--ac { opacity: 0.6; }
    .fin-venn-abbr { font-size: clamp(1.3rem, 8cqi, 2.3rem); font-weight: 800; line-height: 1; letter-spacing: -0.03em; color: var(--fin-heading); }
    .fin-venn-abbr abbr { text-decoration: none; cursor: inherit; }
    .fin-venn-name { font-size: clamp(0.66rem, 3.2cqi, 0.875rem); font-weight: 600; line-height: 1.25; color: var(--fin-text); }
    .fin-venn-q { font-size: clamp(0.66rem, 3cqi, 0.8125rem); font-style: italic; line-height: 1.3; color: var(--fin-text-2); }
    .fin-venn-center {
      position: absolute; top: 50%; left: 50%; width: 27%; transform: translate(-50%, -50%); display: flex; flex-direction: column;
      align-items: center; gap: 0.45rem; text-align: center;
    }
    .fin-venn-check {
      display: grid; place-items: center; width: clamp(1.7rem, 9cqi, 2.6rem); aspect-ratio: 1; border-radius: var(--fin-r-dot);
      font-size: clamp(0.85rem, 4.4cqi, 1.2rem); font-weight: 800; color: transparent; background: transparent;
      border: 1.5px dashed var(--fin-line-strong); transform: scale(0.86);
      transition: background 320ms ease, color 320ms ease, border-color 320ms ease, transform 320ms var(--fin-ease);
    }
    .fin-venn[data-state="both"] .fin-venn-check { color: var(--fin-surface); background: var(--fin-accent); border: 1.5px solid var(--fin-accent); transform: none; }
    .fin-venn.is-pulsing[data-state="both"] .fin-venn-check { animation: fin-pop 560ms var(--fin-ease) 1; }
    @keyframes fin-pop { 0% { transform: scale(0.6); } 60% { transform: scale(1.14); } 100% { transform: scale(1); } }
    .fin-venn-ready { font-size: clamp(0.74rem, 3.9cqi, 1.05rem); font-weight: 800; line-height: 1.15; color: var(--fin-text-2); transition: color 320ms ease; }
    .fin-venn[data-state="both"] .fin-venn-ready { color: var(--fin-heading); }

    .fin-venn-side { display: flex; flex-direction: column; gap: 1.1rem; min-width: 0; }
    .fin-venn-side > .fin-label { margin: 0.4rem 0 -0.5rem; }
    .fin-verdict {
      display: flex; flex-direction: column; align-items: flex-start; gap: 0.65rem; min-height: 8.25rem; padding: 1.1rem 1.25rem;
      background: var(--fin-raised); border: 1px solid var(--fin-line); border-radius: var(--fin-r);
      transition: background 320ms ease, border-color 320ms ease;
    }
    .fin-venn[data-state="both"] .fin-verdict { background: color-mix(in srgb, var(--fin-accent) 6%, var(--fin-surface)); border-color: var(--fin-accent-line); }
    .fin-verdict-text { line-height: 1.5; color: var(--fin-text); }
    .fin-scenarios { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .fin-scenario {
      display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; width: 100%; min-height: 44px; margin: 0;
      padding: 0.7rem 0.9rem; text-align: left; color: var(--fin-text); background: var(--fin-surface);
      border: 1px solid var(--fin-line); border-radius: var(--fin-r-sm); cursor: pointer;
      transition: border-color 200ms ease, box-shadow 200ms ease, transform 200ms var(--fin-ease), background 200ms ease;
    }
    .fin-scenario:hover { border-color: var(--fin-line-strong); transform: translateY(-1px); box-shadow: var(--fin-shadow); }
    html:not(.fin-js) .fin-scenario { cursor: default; transform: none; box-shadow: none; }
    .fin-scenario[aria-pressed="true"] { border-color: var(--fin-heading); box-shadow: inset 0 0 0 1px var(--fin-heading); }
    .fin-scenario-title { font-size: 0.9rem; font-weight: 600; line-height: 1.3; color: var(--fin-heading); }
    .fin-scenario .fin-badge { font-size: 0.72rem; padding: 0.2rem 0.55rem; }

    .fin-lists { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .fin-list {
      padding: 1.3rem 1.4rem 1.35rem; background: var(--fin-raised); border: 1px solid var(--fin-line); border-radius: var(--fin-r);
      transition: border-color 320ms ease, background 320ms ease;
    }
    .fin-list-top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 1.6rem; margin: 0 0 0.55rem; }
    .fin-list h3 { margin: 0 0 0.25rem; font-size: 1.15rem; line-height: 1.3; }
    .fin-met { display: none; padding: 0.15rem 0.55rem; font-size: 0.72rem; font-weight: 700; border-radius: var(--fin-r-pill); white-space: nowrap; }
    .fin-met--yes { color: var(--fin-surface); background: var(--fin-heading); }
    .fin-met--no { color: var(--fin-text-2); border: 1px dashed var(--fin-line-strong); }
    .fin-venn[data-state="dod"] .fin-list--dod .fin-met--yes, .fin-venn[data-state="ac"] .fin-list--ac .fin-met--yes,
    .fin-venn[data-state="both"] .fin-met--yes, .fin-venn[data-state="dod"] .fin-list--ac .fin-met--no,
    .fin-venn[data-state="ac"] .fin-list--dod .fin-met--no { display: inline-block; }
    .fin-venn[data-state="dod"] .fin-list--ac, .fin-venn[data-state="ac"] .fin-list--dod { background: transparent; border-style: dashed; border-color: var(--fin-line-strong); }
    .fin-checklist { display: grid; gap: 0.55rem; margin: 1rem 0 1.15rem; padding: 0; list-style: none; font-size: 0.9375rem; }
    .fin-checklist li { display: flex; align-items: flex-start; gap: 0.65rem; line-height: 1.4; }
    .fin-checklist li::before {
      content: "\\2713"; flex: none; display: grid; place-items: center; width: 1.3rem; height: 1.3rem; margin-top: 0.05rem;
      font-size: 0.72rem; font-weight: 800; color: var(--fin-surface); background: var(--fin-heading); border-radius: var(--fin-r-dot);
      transition: background 320ms ease, color 320ms ease, box-shadow 320ms ease;
    }
    .fin-venn[data-state="dod"] .fin-list--ac li::before, .fin-venn[data-state="ac"] .fin-list--dod li::before {
      color: transparent; background: transparent; box-shadow: inset 0 0 0 1.5px var(--fin-line-strong);
    }

    /* ---------- Panel 2: stages pipeline ---------- */
    .fin-pipe { position: relative; padding-top: 2.6rem; }
    html:not(.fin-js) .fin-pipe { padding-top: 0; }
    .fin-pipe-track { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; }
    .fin-node { position: relative; min-width: 0; padding: 0 0.4rem; text-align: center; }
    .fin-node + .fin-node::before {
      content: ""; position: absolute; z-index: 0; top: calc(1.4rem - 1px); right: 50%; width: 100%; height: 2px;
      background: linear-gradient(var(--fin-heading), var(--fin-heading)) 0 0 / 0 100% no-repeat,
        repeating-linear-gradient(to right, var(--fin-line-strong) 0 6px, transparent 6px 12px);
      transition: background-size 420ms var(--fin-ease);
    }
    .fin-node.is-done::before, .fin-node.is-current::before { background-size: 100% 100%, auto; }
    .fin-node-btn {
      position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 0.6rem; width: 100%;
      margin: 0; padding: 0 0 0.3rem; color: inherit; background: none; border: 0; border-radius: var(--fin-r-sm); cursor: pointer;
    }
    html:not(.fin-js) .fin-node-btn { cursor: default; }
    .fin-node-dot {
      display: grid; place-items: center; width: 2.8rem; height: 2.8rem; font-family: ${t.mono}; font-size: 0.9rem; font-weight: 700;
      color: var(--fin-text-2); background: var(--fin-surface); border: 2px solid var(--fin-line-strong); border-radius: var(--fin-r-dot);
      transition: background 320ms ease, color 320ms ease, border-color 320ms ease, transform 320ms var(--fin-ease);
    }
    .fin-node-btn:hover .fin-node-dot { border-color: var(--fin-heading); }
    .fin-node.is-done .fin-node-dot, .fin-node.is-current .fin-node-dot { color: var(--fin-surface); background: var(--fin-heading); border-color: var(--fin-heading); }
    .fin-node.is-current .fin-node-dot { transform: scale(1.08); }
    .fin-node-label { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
    .fin-node-name { font-size: 1rem; font-weight: 700; line-height: 1.25; color: var(--fin-heading); transition: color 320ms ease; }
    html.fin-js .fin-node:not(.is-current) .fin-node-name { color: var(--fin-text-2); }
    .fin-node-text { max-width: 15rem; font-size: 0.875rem; line-height: 1.45; color: var(--fin-text-2); }
    html.fin-js .fin-node-text { display: none; }
    .fin-node-tag {
      padding: 0.1rem 0.5rem; font-size: 0.72rem; font-weight: 600; white-space: nowrap; color: var(--fin-text-2);
      border: 1px dashed var(--fin-line-strong); border-radius: var(--fin-r-pill); visibility: hidden; opacity: 0;
      transition: opacity 260ms ease, visibility 0s linear 260ms;
    }
    .fin-pipe[data-not-live="true"] .fin-node:nth-child(2) .fin-node-tag { visibility: visible; opacity: 1; transition: opacity 260ms ease; }
    .fin-pipe[data-not-live="true"] .fin-node:nth-child(n + 3) { opacity: 0.5; }
    .fin-node { transition: opacity 260ms ease; }
    .fin-pipe-marker {
      position: absolute; z-index: 2; top: 0; left: 0; width: 0; height: 0; pointer-events: none;
      transition: transform 460ms cubic-bezier(0.65, 0, 0.35, 1);
    }
    .fin-pipe-marker.is-still { transition: none; }
    .fin-pipe-marker::before {
      content: ""; position: absolute; top: -1.95rem; left: -1.95rem; width: 3.9rem; height: 3.9rem;
      border: 2px solid var(--fin-heading); border-radius: var(--fin-r-dot); opacity: 0.3;
      animation: fin-halo 2600ms ease-out infinite;
    }
    @keyframes fin-halo { 0% { transform: scale(0.9); opacity: 0.45; } 70% { transform: scale(1.25); opacity: 0; } 100% { transform: scale(1.25); opacity: 0; } }
    .fin-pipe-marker-label {
      position: absolute; bottom: 2.15rem; left: 0; transform: translateX(-50%); padding: 0.22rem 0.6rem; white-space: nowrap;
      font-family: var(--fin-label); font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--fin-surface); background: var(--fin-heading); border-radius: var(--fin-r-pill);
    }
    .fin-pipe-marker-label::after {
      content: ""; position: absolute; top: 100%; left: 50%; margin-left: -5px;
      border: 5px solid transparent; border-top-color: var(--fin-heading); border-bottom: 0;
    }
    .fin-pipe-panel { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem 1.5rem; align-items: end; margin: 2.25rem 0 0; }
    .fin-pipe-detail {
      display: grid; gap: 0.3rem; min-height: 7.25rem; padding: 1.2rem 1.4rem; background: var(--fin-raised);
      border: 1px solid var(--fin-line); border-radius: var(--fin-r);
    }
    .fin-pipe-detail.is-swapping .fin-pipe-swap { animation: fin-swap 300ms var(--fin-ease) both; }
    @keyframes fin-swap { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    .fin-pipe-swap { display: grid; gap: 0.3rem; }
    .fin-pipe-name { font-size: 1.3rem; font-weight: 700; line-height: 1.25; color: var(--fin-heading); letter-spacing: -0.01em; }
    .fin-pipe-text { font-size: 1rem; line-height: 1.5; color: var(--fin-text); }
    .fin-pipe-controls { display: flex; flex-direction: column; align-items: stretch; gap: 0.6rem; }
    .fin-pipe-steps { display: flex; gap: 0.5rem; }
    .fin-pipe-steps .fin-btn { flex: 1 1 auto; }
    .fin-switch {
      display: inline-flex; align-items: center; gap: 0.65rem; min-height: 44px; margin: 0; padding: 0.35rem 0.25rem;
      font-size: 0.875rem; line-height: 1.3; text-align: left; color: var(--fin-text); background: none; border: 0; cursor: pointer;
    }
    .fin-switch-track {
      position: relative; flex: none; width: 2.6rem; height: 1.5rem; background: var(--fin-sunk);
      border: 1px solid var(--fin-line-strong); border-radius: var(--fin-r-pill); transition: background 240ms ease, border-color 240ms ease;
    }
    .fin-switch-track::after {
      content: ""; position: absolute; top: 3px; left: 3px; width: calc(1.5rem - 8px); height: calc(1.5rem - 8px);
      background: var(--fin-text-2); border-radius: var(--fin-r-pill); transition: transform 240ms var(--fin-ease), background 240ms ease;
    }
    .fin-switch[aria-pressed="true"] .fin-switch-track { background: var(--fin-heading); border-color: var(--fin-heading); }
    .fin-switch[aria-pressed="true"] .fin-switch-track::after { transform: translateX(1.1rem); background: var(--fin-surface); }
    .fin-page .fin-note { max-width: 46rem; margin: 1.75rem 0 0; font-size: 0.9375rem; line-height: 1.55; color: var(--fin-text-2); }

    /* ---------- Panel 3: boards ---------- */
    .fin-boards-switch { display: none; margin: 0 0 1.25rem; }
    .fin-boards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; align-items: stretch; }
    .fin-boardcard {
      display: flex; flex-direction: column; min-width: 0; padding: 1.4rem 1.4rem 1.35rem; background: var(--fin-raised);
      border: 1px solid var(--fin-line); border-radius: var(--fin-r); box-shadow: var(--fin-shadow);
      transition: transform 260ms var(--fin-ease), box-shadow 260ms var(--fin-ease), border-color 260ms ease;
    }
    .fin-boardcard:hover { transform: translateY(-3px); box-shadow: var(--fin-shadow-hover); border-color: var(--fin-line-strong); }
    .fin-boardcard.is-entering { animation: fin-enter 300ms var(--fin-ease) both; }
    .fin-boardcard-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
    .fin-boardcard h3 { margin: 0.3rem 0 0; font-size: 1.3rem; line-height: 1.2; letter-spacing: -0.01em; }
    .fin-boardcard .fin-quote { margin: 0.4rem 0 1.1rem; }
    .fin-board {
      position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin: 0 0 1.2rem;
      padding: 0.55rem; background: var(--fin-sunk); border-radius: var(--fin-r-sm);
    }
    .fin-col { display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; padding: 0.3rem; border-radius: var(--fin-r-sm); transition: background 320ms ease; }
    .fin-col.is-target { background: color-mix(in srgb, var(--fin-heading) 5%, transparent); }
    .fin-col h4 { margin: 0.15rem 0.15rem 0.25rem; }
    .fin-item, .fin-slot, .fin-mover {
      padding: 0.55rem 0.6rem; font-size: 0.84rem; line-height: 1.35; overflow-wrap: anywhere; border-radius: var(--fin-r-sm);
    }
    .fin-item { color: var(--fin-text); background: var(--fin-surface); border: 1px solid var(--fin-line); }
    .fin-item-id { display: block; font-family: ${t.mono}; font-size: 0.72rem; color: var(--fin-text-2); }
    html.fin-js .fin-item--src { display: none; }
    .fin-slot { border: 1.5px dashed var(--fin-line-strong); background: transparent; }
    .fin-slot > * { visibility: hidden; }
    .fin-mover {
      position: absolute; z-index: 2; top: 0; left: 0; color: var(--fin-text); background: var(--fin-surface);
      border: 1.5px solid var(--fin-heading); box-shadow: var(--fin-shadow-hover);
      transition: transform 560ms cubic-bezier(0.65, 0, 0.35, 1), box-shadow 300ms ease;
    }
    .fin-mover.is-still { transition: none; }
    .fin-mover-status {
      display: inline-block; margin: 0 0 0.3rem; padding: 0.08rem 0.45rem; white-space: nowrap; font-family: var(--fin-label);
      font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fin-text-2);
      background: var(--fin-sunk); border-radius: var(--fin-r-pill); transition: background 300ms ease, color 300ms ease;
    }
    .fin-mover[data-col="2"] .fin-mover-status { color: var(--fin-surface); background: var(--fin-heading); }
    .fin-mover-title { display: block; }
    .fin-bullets { display: grid; gap: 0.45rem; margin: 0 0 1.2rem; padding: 0; list-style: none; font-size: 0.9375rem; line-height: 1.45; }
    .fin-bullets li { position: relative; padding-left: 1.15rem; }
    .fin-bullets li::before {
      content: ""; position: absolute; top: 0.55em; left: 0.1rem; width: 0.42rem; height: 0.42rem;
      background: var(--fin-line-strong); border-radius: var(--fin-r-dot);
    }
    .fin-boardcard .fin-pill { align-self: flex-start; margin-top: auto; }

    /* ---------- Can / can't see ---------- */
    .fin-see-section { margin: 0 0 3.5rem; padding: 2rem 2rem 1.75rem; background: var(--fin-raised); border: 1px solid var(--fin-line); border-radius: var(--fin-r); }
    .fin-see-section h2 { margin: 0 0 0.5rem; font-size: clamp(1.3rem, 3.2cqi, 1.6rem); line-height: 1.2; letter-spacing: -0.015em; }
    .fin-see-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin: 1.4rem 0 1.5rem; }
    .fin-see { padding: 1.1rem 1.25rem 1.2rem; background: var(--fin-surface); border: 1px solid var(--fin-line); border-radius: var(--fin-r-sm); }
    .fin-see--cant { border-style: dashed; border-color: var(--fin-line-strong); background: transparent; }
    .fin-see h3 { margin: 0 0 0.75rem; font-size: 1rem; line-height: 1.3; }
    .fin-see ul, .fin-see-notes { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .fin-see li { display: flex; align-items: flex-start; gap: 0.6rem; line-height: 1.4; }
    .fin-see li::before {
      content: "\\2713"; flex: none; display: grid; place-items: center; width: 1.25rem; height: 1.25rem; margin-top: 0.05rem;
      font-size: 0.7rem; font-weight: 800; color: var(--fin-surface); background: var(--fin-heading); border-radius: var(--fin-r-dot);
    }
    .fin-see--cant li::before { content: ""; background: transparent; box-shadow: inset 0 0 0 1.5px var(--fin-line-strong); }
    .fin-see-notes li { position: relative; padding-left: 1.15rem; line-height: 1.55; color: var(--fin-text); }
    .fin-see-notes li::before {
      content: ""; position: absolute; top: 0.62em; left: 0.1rem; width: 0.42rem; height: 0.42rem;
      background: var(--fin-accent); border-radius: var(--fin-r-dot);
    }
    .fin-nc {
      display: inline-block; padding: 0 0.45rem; font-family: ${t.mono}; font-size: 0.8em; white-space: nowrap; color: var(--fin-text-2);
      border: 1px dashed var(--fin-line-strong); border-radius: var(--fin-r-pill);
    }

    /* ---------- Key ---------- */
    .fin-key { margin: 0 0 2.5rem; padding: 1.5rem 0 0; border-top: 1px solid var(--fin-line); scroll-margin-top: 5rem; }
    .fin-key > summary {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "title sum chev"; align-items: center;
      gap: 0.35rem 1rem; min-height: 44px; padding: 0.25rem 0; list-style: none; cursor: pointer; border-radius: var(--fin-r-sm);
    }
    .fin-key > summary h2 { grid-area: title; }
    .fin-key > summary::-webkit-details-marker { display: none; }
    .fin-key > summary h2 { margin: 0; font-size: clamp(1.3rem, 3.2cqi, 1.6rem); line-height: 1.2; letter-spacing: -0.015em; }
    .fin-key-sum { grid-area: sum; font-size: 0.9375rem; color: var(--fin-text-2); }
    .fin-key-chev {
      grid-area: chev; display: grid; place-items: center; width: 2.75rem; height: 2.75rem; font-size: 0.8rem; color: var(--fin-heading);
      border: 1px solid var(--fin-line-strong); border-radius: var(--fin-r-pill); transition: transform 260ms var(--fin-ease);
    }
    .fin-key[open] .fin-key-chev { transform: rotate(180deg); }
    .fin-key-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; margin: 1.25rem 0 0; }
    .fin-key-col { display: grid; gap: 1.25rem; align-content: start; }
    .fin-key-group h3 { margin: 0 0 0.6rem; }
    .fin-key-group dl { display: grid; gap: 0.55rem; margin: 0; }
    .fin-term { padding: 0.85rem 1rem 0.9rem; background: var(--fin-raised); border: 1px solid var(--fin-line); border-radius: var(--fin-r-sm); }
    .fin-term dt { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.55rem; margin: 0 0 0.25rem; font-weight: 700; color: var(--fin-heading); }
    .fin-term-full { font-size: 0.8125rem; font-weight: 500; color: var(--fin-text-2); }
    .fin-term dd { margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--fin-text); }

    .fin-back { margin: 0; font-size: 0.9rem; }
    .fin-page .fin-back a { color: var(--fin-text-2); text-decoration: none; }
    .fin-page .fin-back a:hover { color: var(--fin-heading); text-decoration: underline; background: none; }

    /* ---------- Narrower layouts (the page column, so editorial's reading column stacks too) ---------- */
    @container fin (max-width: 760px) {
      .fin-venn { grid-template-columns: minmax(0, 1fr); gap: 1.75rem; }
      .fin-venn-art { width: 100%; max-width: 30rem; margin: 0 auto; }
      .fin-lists { grid-template-columns: minmax(0, 1fr); }
      .fin-pipe-panel { grid-template-columns: minmax(0, 1fr); }
      .fin-boards { grid-template-columns: minmax(0, 1fr); }
      html.fin-js .fin-boards-switch { display: grid; }
      html.fin-js .fin-boards[data-show="issue"] .fin-boardcard--project,
      html.fin-js .fin-boards[data-show="project"] .fin-boardcard--issue { display: none; }
      .fin-see-section { padding: 1.5rem 1.25rem 1.4rem; }
    }
    @container fin (max-width: 680px) {
      .fin-questions { grid-template-columns: minmax(0, 1fr); gap: 0.6rem; }
      .fin-page a.fin-q { gap: 0.15rem 0.75rem; padding: 0.85rem 1rem; }
      .fin-q-ask { font-size: 1.05rem; }
      .fin-tabs { width: 100%; }
      .fin-tab { padding: 0.5rem 0.6rem; }
      .fin-tab svg { display: none; }
    }
    @container fin (max-width: 600px) {
      .fin-tab { padding: 0.5rem 0.4rem; font-size: 0.8125rem; }
      .fin-long { display: none; }
      .fin-short { display: inline; }
      .fin-pipe { padding: 0 0 0 0.6rem; }
      .fin-pipe-track { grid-template-columns: minmax(0, 1fr); gap: 1.1rem; }
      .fin-node { padding: 0; text-align: left; }
      .fin-node + .fin-node::before {
        top: auto; right: auto; bottom: calc(100% - 1.4rem); left: calc(1.4rem - 1px); width: 2px; height: calc(100% + 1.1rem);
        background: linear-gradient(var(--fin-heading), var(--fin-heading)) 0 0 / 100% 0 no-repeat,
          repeating-linear-gradient(to bottom, var(--fin-line-strong) 0 6px, transparent 6px 12px);
      }
      .fin-node.is-done::before, .fin-node.is-current::before { background-size: 100% 100%, auto; }
      .fin-node-btn { flex-direction: row; align-items: flex-start; gap: 1rem; padding: 0; text-align: left; }
      .fin-node-dot { flex: none; }
      .fin-node-label { align-items: flex-start; padding-top: 0.6rem; }
      html.fin-js .fin-node-label { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; }
      .fin-pipe-marker-label { display: none; }
      .fin-key-groups, .fin-see-grid { grid-template-columns: minmax(0, 1fr); }
      .fin-key > summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "title chev" "sum sum"; }
      .fin-boardcard { padding: 1.1rem 1rem 1.1rem; }
      .fin-board { gap: 0.3rem; padding: 0.4rem; }
      .fin-col { padding: 0.15rem; }
      .fin-item, .fin-slot, .fin-mover { padding: 0.45rem 0.45rem; font-size: 0.78rem; }
    }

    /* ---------- Reduced motion: every state change still works, instantly ---------- */
    @media (prefers-reduced-motion: reduce) {
      .fin-page *, .fin-page *::before, .fin-page *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
      .fin-page a.fin-q:hover, .fin-boardcard:hover, .fin-scenario:hover, .fin-page a.fin-q:hover .fin-q-arrow { transform: none; }
      .fin-pipe-marker::before { opacity: 0.35; }
    }
`;
