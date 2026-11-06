// Shared CSS for the "How long would it take?" planning calculator (estimate-calculator partial).
// Uses the same theme variables as allocation-css.ts so it follows light/dark automatically.

import type { AllocationCssTheme } from "./allocation-css.js";

export const buildEstimateCSS = (t: AllocationCssTheme): string => `
    /* ==================== ESTIMATE CALCULATOR ==================== */
    .est { margin-bottom: 3rem; color: ${t.text}; }
    .est-intro { color: ${t.textSecondary}; margin: 0 0 1.25rem; max-width: 60ch; }
    .est-form {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem 1.25rem; margin: 0 0 1.5rem;
    }
    .est-field { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
    .est-field[hidden] { display: none; }
    .est-label { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.08em; color: ${t.textTertiary}; }
    .est-select {
      font: inherit; font-size: 0.875rem; padding: 0.45rem 0.6rem; width: 100%; max-width: 100%;
      color: ${t.text}; background: ${t.surface}; border: 1px solid ${t.border}; border-radius: ${t.radius};
    }
    .est-select:focus-visible, .est-details summary:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
    .est-output { border-left: 3px solid ${t.accent}; padding: 0.25rem 0 0.25rem 1rem; margin: 0 0 1.25rem; max-width: 70ch; }
    .est-output p { margin: 0 0 0.4rem; }
    .est-primary { font-size: 1.25rem; font-weight: 600; color: ${t.heading}; line-height: 1.35; }
    .est-secondary, .est-basis { font-size: 0.875rem; color: ${t.textSecondary}; }
    .est-ref { margin: 0 0 0.6rem; padding-left: 1.1rem; font-size: 0.8125rem; color: ${t.textSecondary}; }
    .est-ref[hidden] { display: none; }
    .est-caption { font-size: 0.8125rem; font-style: italic; color: ${t.textTertiary}; }
    .est-details { font-size: 0.8125rem; color: ${t.textSecondary}; max-width: 70ch; }
    .est-details summary { cursor: pointer; color: ${t.heading}; font-weight: 600; margin-bottom: 0.4rem; }
    .est-details p { margin: 0 0 0.4rem; }
    .est-page { max-width: 56rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; color: ${t.text}; }
    .est-page-back { display: inline-block; margin: 0 0 1.5rem; font-size: 0.875rem; color: ${t.textSecondary}; text-decoration: none; }
    .est-page-back:hover { color: ${t.heading}; text-decoration: underline; }
    .est-page-title { margin: 0 0 0.5rem; color: ${t.heading}; line-height: 1.15; }
    .est-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; margin: 1.25rem 0 2rem; }
    .est-card {
      font: inherit; text-align: left; cursor: pointer; padding: 1rem 1.1rem; min-height: 4.5rem;
      color: ${t.heading}; background: ${t.surface}; border: 1px solid ${t.border}; border-radius: ${t.radius};
      font-size: 1rem; font-weight: 600; line-height: 1.3;
    }
    .est-card:hover { border-color: ${t.accent}; }
    .est-card:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
    .est-card[aria-pressed="true"] { border-color: ${t.accent}; box-shadow: inset 0 0 0 1px ${t.accent}; }
    .est-standalone { margin-bottom: 2rem; }
    .est-excludes { margin: 0 0 1.5rem; max-width: 70ch; font-size: 0.875rem; color: ${t.textSecondary}; }
    .est-excludes h2 { font-size: 1rem; margin: 0 0 0.4rem; color: ${t.heading}; }
    .est-excludes ul { margin: 0; padding-left: 1.1rem; }
    @media (max-width: 860px) {
      .est-cards { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 380px) {
      .est-cards { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .est-form { grid-template-columns: 1fr; }
      .est-primary { font-size: 1.0625rem; }
    }
`;
