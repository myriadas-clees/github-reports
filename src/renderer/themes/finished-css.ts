// Shared CSS for the static "How we say something is finished" page.
// Colors come only from theme tokens (CSS variables), so light and dark follow the theme.

import type { AllocationCssTheme } from "./allocation-css.js";

export const buildFinishedCSS = (t: AllocationCssTheme): string => `
    /* ==================== FINISHED-STATE EXPLAINER ==================== */
    /* Report themes lock html/body to the viewport (app-style scroll); this page is a normal long document. */
    html, body { height: auto; overflow: auto; }
    /* Layout follows the page's own column width (themes may narrow body, e.g. editorial's reading column). */
    .fin-page { width: 100%; max-width: 56rem; margin: 0 auto; padding: 5rem 1.25rem 3rem; box-sizing: border-box; color: ${t.text}; container: fin / inline-size; }
    .fin-page h1 { margin: 0 0 0.6rem; color: ${t.heading}; line-height: 1.15; font-size: clamp(1.9rem, 5vw, 2.6rem); overflow-wrap: anywhere; }
    .fin-page h2 { margin: 2.75rem 0 1rem; color: ${t.heading}; font-size: 1.4rem; line-height: 1.2; }
    .fin-page h3 { margin: 0 0 0.35rem; color: ${t.heading}; font-size: 1.05rem; line-height: 1.3; }
    .fin-page h4 { margin: 0 0 0.4rem; color: ${t.textTertiary}; font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase; }
    .fin-page abbr { text-decoration: underline dotted; text-underline-offset: 3px; cursor: help; }
    .fin-page p { margin: 0 0 0.6rem; }
    .fin-intro { color: ${t.textSecondary}; max-width: 62ch; margin: 0 0 1.5rem; }
    .fin-note { color: ${t.textSecondary}; font-size: 0.9rem; max-width: 62ch; }
    .fin-quote { color: ${t.textSecondary}; font-style: italic; }
    .fin-pill {
      display: inline-block; margin-top: 0.35rem; padding: 0.2rem 0.6rem; font-size: 0.75rem; line-height: 1.3;
      color: ${t.textSecondary}; border: 1px solid ${t.border}; border-radius: 999px; background: transparent;
    }
    .fin-pill--accent { color: ${t.heading}; border-color: ${t.accent}; background: color-mix(in srgb, ${t.accent} 14%, transparent); }

    /* Key */
    .fin-key { border: 1px solid ${t.border}; border-radius: ${t.radius}; padding: 1rem 1.25rem 1.1rem; margin: 0 0 0.5rem; }
    .fin-key h2 { margin: 0 0 0.75rem; font-size: 1rem; }
    .fin-key dl { display: grid; grid-template-columns: minmax(8rem, max-content) minmax(0, 1fr); gap: 0.55rem 1.25rem; margin: 0; }
    .fin-key dt { margin: 0; font-weight: 600; color: ${t.heading}; }
    .fin-key dd { margin: 0; font-size: 0.9rem; color: ${t.textSecondary}; }

    /* Venn: desktop = overlapping circles; mobile = stacked cards */
    .fin-venn { margin: 0 0 1.5rem; }
    .fin-venn-stage { position: relative; height: 36rem; }
    .fin-circle {
      position: absolute; top: 0; width: 35rem; height: 35rem; border-radius: 50%;
      border: 1px solid ${t.border}; background: color-mix(in srgb, ${t.text} 4%, transparent);
    }
    .fin-circle--dod { left: 0; }
    .fin-circle--ac { right: 0; }
    .fin-circle-body {
      position: absolute; top: 50%; transform: translateY(-50%); width: 13.5rem;
    }
    .fin-circle--dod .fin-circle-body { left: 3.25rem; }
    .fin-circle--ac .fin-circle-body { right: 3.25rem; }
    .fin-circle-label { font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase; color: ${t.textTertiary}; margin-bottom: 0.4rem; }
    .fin-checklist { list-style: none; margin: 0.6rem 0 0; padding: 0; font-size: 0.875rem; color: ${t.textSecondary}; }
    .fin-checklist li { padding: 0.15rem 0 0.15rem 1.1rem; position: relative; }
    .fin-checklist li::before { content: "\\2713"; position: absolute; left: 0; color: ${t.heading}; }
    .fin-overlap {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 13rem; text-align: center;
    }
    .fin-check {
      display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 50%;
      border: 1px solid ${t.accent}; color: ${t.heading}; background: color-mix(in srgb, ${t.accent} 14%, transparent);
      font-size: 1rem; margin-bottom: 0.4rem;
    }
    .fin-overlap-title { font-weight: 700; color: ${t.heading}; margin: 0 0 0.3rem; }
    .fin-overlap-text { font-size: 0.8rem; color: ${t.textSecondary}; margin: 0; }

    .fin-cases { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin: 1.5rem 0 0; }
    .fin-stages { margin-bottom: 1rem; }
    .fin-case { border: 1px solid ${t.border}; border-radius: ${t.radius}; padding: 0.9rem 1rem; }
    .fin-case--ready { border-color: ${t.accent}; }

    /* Stages */
    .fin-stages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; }
    .fin-stage { border: 1px solid ${t.border}; border-radius: ${t.radius}; padding: 0.9rem 1rem; font-size: 0.9rem; color: ${t.textSecondary}; }
    .fin-stage h3 { color: ${t.heading}; }
    .fin-stage p { margin: 0; }

    /* Can / can't see */
    .fin-lead { max-width: 66ch; color: ${t.text}; }

    /* Issues and projects */
    .fin-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .fin-card { border: 1px solid ${t.border}; border-radius: ${t.radius}; padding: 1.1rem 1.1rem 1rem; min-width: 0; }
    .fin-board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin: 0.8rem 0; }
    .fin-col { border: 1px dashed ${t.borderSubtle}; border-radius: ${t.radius}; padding: 0.5rem; min-width: 0; }
    .fin-item {
      font-size: 0.78rem; line-height: 1.3; color: ${t.text}; border: 1px solid ${t.border};
      border-radius: ${t.radius}; padding: 0.3rem 0.4rem; margin-bottom: 0.35rem; overflow-wrap: anywhere;
    }
    .fin-bullets { margin: 0.4rem 0 0.8rem; padding-left: 1.1rem; font-size: 0.9rem; color: ${t.textSecondary}; }
    .fin-bullets li { margin-bottom: 0.25rem; }
    .fin-connect { margin: 1.5rem 0 0; padding: 0.4rem 0 0.4rem 1rem; border-left: 3px solid ${t.accent}; color: ${t.text}; max-width: 66ch; }
    .fin-back { margin: 2.5rem 0 0; font-size: 0.875rem; }
    .fin-back a { color: ${t.textSecondary}; text-decoration: none; }
    .fin-back a:hover { color: ${t.heading}; text-decoration: underline; }
    .fin-page a:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }

    @container fin (max-width: 700px) {
      .fin-venn-stage { height: auto; display: flex; flex-direction: column; gap: 0.9rem; }
      .fin-circle { position: static; width: auto; height: auto; border-radius: 1rem; padding: 1.1rem 1.2rem; }
      .fin-circle-body { position: static; transform: none; width: auto; }
      .fin-circle--dod .fin-circle-body, .fin-circle--ac .fin-circle-body { left: auto; right: auto; }
      .fin-overlap { position: static; transform: none; width: auto; padding: 1rem 1.2rem; border: 1px dashed ${t.borderSubtle}; border-radius: 1rem; }
      .fin-cases { grid-template-columns: 1fr; }
      .fin-stages { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .fin-pair { grid-template-columns: 1fr; }
    }
    @media (max-width: 480px) {
      .fin-stages { grid-template-columns: 1fr; }
      .fin-board { grid-template-columns: 1fr; }
      .fin-key dl { grid-template-columns: 1fr; gap: 0.1rem 0; }
      .fin-key dd { margin-bottom: 0.55rem; }
    }
`;
