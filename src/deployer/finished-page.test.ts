import { describe, it, expect } from "vitest";
import { renderFinishedPage, FINISHED_BODY, FINISHED_PANELS, FINISHED_SCRIPT } from "./finished-page.js";
import { AVAILABLE_THEMES } from "../renderer/themes/index.js";
import { STATUS_PALETTES } from "../renderer/themes/finished-css.js";
import { assertNoSecretsInHtml } from "../config.js";
import type { Theme } from "../types.js";

const TERMS = ["DoD", "AC", "PR", "Ready to release", "Merged", "our team's word", "Code integrated", "In testing", "Live"];
const themes = AVAILABLE_THEMES as Theme[];
const mainOf = (html: string) => html.slice(html.indexOf('<main class="fin-page"'), html.indexOf("</main>"));
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
/** The page's own stylesheet (not the shared theme CSS). */
const finishedCssOf = (html: string) => html.match(/<style>(\s*\/\* =+ FINISHED-STATE EXPLAINER[\s\S]*?)<\/style>/)?.[1] ?? "";
/** Declarations of the rule whose selector list is exactly `selector`. */
const ruleOf = (css: string, selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|[\\n}])\\s*${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};
const STATUS_VARS = ["--fin-ok:", "--fin-ok-on:", "--fin-ok-ink:", "--fin-ok-soft:", "--fin-ok-line:"];
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** sRGB color-mix(in srgb, a p%, b) for #rrggbb. */
const mix = (a: string, pct: number, b: string) =>
  "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * pct + parseInt(b.slice(i, i + 2), 16) * (1 - pct))
    .toString(16).padStart(2, "0")).join("");

describe("renderFinishedPage", () => {
  for (const theme of themes) {
    it(`renders the explainer with its key and sections in the ${theme} theme`, () => {
      const html = renderFinishedPage({ username: "u", themeName: theme, baseUrl: "https://example.com" });
      expect(html.match(/<h1[^>]*>How we say something is finished<\/h1>/g), theme).toHaveLength(1);
      for (const term of TERMS) expect(html, theme).toContain(term);
      expect(html, theme).toMatch(/<details class="fin-key" id="key" open>/);
      expect(html, theme).toContain("<dl>");
      expect(html, theme).toContain('<abbr title="Definition of Done">DoD</abbr>');
      expect(html, theme).toContain('<abbr title="Acceptance Criteria">AC</abbr>');
      expect(html, theme).toContain('<abbr title="pull request">PR</abbr>');
      expect(html, theme).toContain("Built the right way, and what we asked for");
      expect(html, theme).toContain("Where the change is now");
      expect(html, theme).toContain("What this site can and can't see");
      expect(html, theme).toContain("not collected");
      expect(html, theme).toContain("Issues and projects");
      expect(html, theme).toContain("How they connect:");
      expect(html, theme).toContain('href="../"');
      expect(html, theme).toContain(`<main class="fin-page" data-fin-theme="${theme}">`);
      expect(html, theme).toContain('og:url" content="https://example.com/finished/"');
      expect(() => assertNoSecretsInHtml(html), theme).not.toThrow();
    });
  }

  it("keeps out the wording and labels that were ruled out", () => {
    for (const theme of themes) {
      const html = renderFinishedPage({ themeName: theme });
      expect(html, theme).not.toContain("Technical Analyst");
      expect(html, theme).not.toContain("PR Ready");
      expect(html, theme).not.toContain(">Ready<");
      expect(html, theme).not.toMatch(/<progress|role="progressbar"/);
    }
  });

  it("has no percentage progress text in the page body", () => {
    const html = renderFinishedPage({});
    expect(mainOf(html)).not.toMatch(/\d\s*%/);
    expect(FINISHED_BODY).not.toMatch(/\d\s*%/);
  });

  it("wires the explorer as an accessible tablist whose tabs control panels by hash id", () => {
    const html = renderFinishedPage({ themeName: "brutalist" });
    expect(FINISHED_PANELS.map((p) => p.id)).toEqual(["ready", "stages", "boards"]);
    expect(html).toMatch(/<div class="fin-tabs fin-js-only" role="tablist" aria-label="[^"]+">/);
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => attrs(m[0]));
    expect(tabs).toHaveLength(3);
    tabs.forEach((tab, i) => {
      const panel = FINISHED_PANELS[i];
      expect(tab["aria-controls"]).toBe(panel.id);
      expect(tab["aria-selected"]).toBe(i === 0 ? "true" : "false");
      expect(tab.tabindex).toBe(i === 0 ? "0" : "-1");
      expect(tab.type).toBe("button");
      const panelTag = html.match(new RegExp(`<section[^>]*id="${panel.id}"[^>]*>`))?.[0] ?? "";
      expect(attrs(panelTag).role).toBe("tabpanel");
      expect(attrs(panelTag)["aria-labelledby"]).toBe(tab.id);
      expect(html).toContain(`id="${tab.id}"`);
    });
    for (const p of FINISHED_PANELS) expect(html).toContain(`>${p.tab}</span>`);
    // Hero shortcuts deep-link to the panels and work as plain anchors without JavaScript.
    expect(html).toContain('href="#ready" data-fin-tab="ready" data-fin-venn="dod"');
    expect(html).toContain('href="#ready" data-fin-tab="ready" data-fin-venn="ac"');
    expect(html).toContain('href="#stages" data-fin-tab="stages"');
    // Keyboard support and hash deep links live in the inline script.
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) expect(FINISHED_SCRIPT).toContain(`"${key}"`);
    expect(FINISHED_SCRIPT).toContain("location.hash");
    expect(FINISHED_SCRIPT).toContain("hashchange");
  });

  it("ships every panel in the HTML and only hides inactive ones once JavaScript has run", () => {
    const html = renderFinishedPage({ themeName: "editorial" });
    for (const p of FINISHED_PANELS) expect(html).toMatch(new RegExp(`<section class="fin-panel[^"]*" id="${p.id}"`));
    expect(html).toContain('document.documentElement.classList.add("fin-js")');
    expect(html.indexOf('classList.add("fin-js")')).toBeLessThan(html.indexOf("<body>"));
    expect(html).toContain("html.fin-js .fin-panel:not(.is-active) { display: none; }");
    expect(html).toContain("html:not(.fin-js) .fin-js-only { display: none !important; }");
    expect(html).not.toMatch(/<section class="fin-panel[^>]*\shidden/);
  });

  it("has Venn, scenario, stage and board controls with the expected labels", () => {
    const html = renderFinishedPage({});
    for (const s of ["dod", "ac", "both"]) expect(html).toContain(`data-fin-venn-set="${s}"`);
    expect(html).toContain('aria-label="Definition of Done"><span class="fin-long">Definition of Done</span>');
    expect(html).toContain('aria-label="Acceptance Criteria"><span class="fin-long">Acceptance Criteria</span>');
    expect(html).toContain('data-fin-venn-set="both" aria-pressed="true">Both</button>');
    expect(html).toMatch(/data-fin-venn-set="dod"[^>]*><span class="fin-scenario-title">Built right, but not what was asked<\/span><span class="fin-badge fin-badge--no">Not ready to release<\/span>/);
    expect(html).toMatch(/data-fin-venn-set="ac"[^>]*><span class="fin-scenario-title">What was asked, but not built right<\/span><span class="fin-badge fin-badge--no">Not ready to release<\/span>/);
    expect(html).toMatch(/data-fin-venn-set="both"[^>]*><span class="fin-scenario-title">Built right and what was asked<\/span><span class="fin-badge fin-badge--ready">Ready to release<\/span>/);
    expect(html).toMatch(/<div class="fin-verdict" aria-live="polite"/);
    expect(html).toMatch(/<div class="fin-pipe-detail" aria-live="polite"/);
    const stageNames = [...html.matchAll(/<span class="fin-node-name">([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(stageNames).toEqual(["In review", "Code integrated", "In testing", "Live"]);
    expect(html.match(/<button type="button" class="fin-node-btn">/g)).toHaveLength(4);
    expect(html).toMatch(/data-fin-pipe="back"[^>]*>.*Back<\/button>/);
    expect(html).toMatch(/data-fin-pipe="next">Next stage/);
    expect(html).toContain('data-fin-pipe="notlive" aria-pressed="false">');
    expect(html).toContain("Show “Code integrated · not live yet”");
    expect(html).toContain("where the code is</strong>, not whether it was approved");
    expect(html).toContain('data-fin-board-set="issue" aria-pressed="true">Issue board</button>');
    expect(html).toContain('data-fin-board-set="project" aria-pressed="false">Project board</button>');
    expect(mainOf(html).match(/data-fin-play aria-label="Play: /g)).toHaveLength(2);
    for (const col of ["To do", "In progress", "Closed", "Planning", "Building", "Launched"]) expect(html).toContain(`>${col}</h4>`);
    // Every interactive control is a real button, never a clickable div.
    expect(mainOf(html)).not.toMatch(/<(div|span)[^>]*(onclick|role="button")/);
  });

  it("uses theme tokens, not hard-coded page colors, and stacks the layout on narrow columns", () => {
    const brutalist = renderFinishedPage({ themeName: "brutalist" });
    expect(finishedCssOf(brutalist)).toContain("var(--b-text)");
    expect(finishedCssOf(renderFinishedPage({ themeName: "swiss" }))).toContain("var(--s-text)");
    expect(finishedCssOf(renderFinishedPage({ themeName: "editorial" }))).toContain("var(--e-text)");
    expect(finishedCssOf(renderFinishedPage({ themeName: "minimal" }))).toContain("var(--text)");
    expect(brutalist).toMatch(/@container fin \(max-width: 760px\) \{\s*\.fin-venn \{ grid-template-columns: minmax\(0, 1fr\);/);
    expect(brutalist).toMatch(/@container fin \(max-width: 600px\)[\s\S]*\.fin-pipe-track \{ grid-template-columns: minmax\(0, 1fr\);/);
    expect(brutalist).toContain("theme-toggle");
  });

  it("never uses the theme accent (red in brutalist and swiss) for status or selection", () => {
    for (const theme of themes) {
      const css = finishedCssOf(renderFinishedPage({ themeName: theme }));
      expect(css.length, theme).toBeGreaterThan(1000);
      expect(css, theme).not.toMatch(/accent/i);
    }
  });

  it("defines the success tokens for light and dark in every theme, switched like the theme switches", () => {
    const darkFirst: Record<Theme, boolean> = { brutalist: true, minimal: false, editorial: false, swiss: false };
    for (const theme of themes) {
      const css = finishedCssOf(renderFinishedPage({ themeName: theme }));
      const tone = theme === "editorial" ? STATUS_PALETTES.calm : STATUS_PALETTES.forest;
      const [base, alt] = darkFirst[theme] ? [tone.dark, tone.light] : [tone.light, tone.dark];
      const [altMode, otherMode] = darkFirst[theme] ? ["light", "dark"] : ["dark", "light"];
      const blocks = {
        base: css.match(/\n\s*\.fin-page \{ (--fin-ok:[^}]*)\}/)?.[1] ?? "",
        media: css.match(new RegExp(`@media \\(prefers-color-scheme: ${altMode}\\) \\{ html:not\\(\\[data-theme="${otherMode}"\\]\\) \\.fin-page \\{([^}]*)\\} \\}`))?.[1] ?? "",
        attr: ruleOf(css, `html[data-theme="${altMode}"] .fin-page`),
      };
      for (const [where, block] of Object.entries(blocks)) {
        for (const v of STATUS_VARS) expect(block, `${theme} ${where} ${v}`).toContain(v);
      }
      expect(blocks.base, theme).toContain(`--fin-ok: ${base.ok};`);
      expect(blocks.media, theme).toContain(`--fin-ok: ${alt.ok};`);
      expect(blocks.attr, theme).toContain(`--fin-ok: ${alt.ok};`);
      expect(base.ok, theme).not.toBe(alt.ok);
    }
  });

  it("marks ready, met, ticked and Live states with the success token, and not-ready states in neutral grey", () => {
    for (const theme of themes) {
      const html = renderFinishedPage({ themeName: theme });
      const css = finishedCssOf(html);
      const ok: Array<[string, RegExp]> = [
        [".fin-badge--ready", /color: var\(--fin-ok-ink\); background: var\(--fin-ok-soft\); border: 1px solid var\(--fin-ok-line\)/],
        [".fin-badge--ready::before", /background: var\(--fin-ok\)/],
        [".fin-met--yes", /color: var\(--fin-ok-on\); background: var\(--fin-ok\)/],
        ['.fin-venn[data-state="both"] .fin-venn-check', /color: var\(--fin-ok-on\); background: var\(--fin-ok\)/],
        ['.fin-venn[data-state="both"] .fin-venn-ready', /color: var\(--fin-ok-ink\)/],
        ['.fin-venn[data-state="both"] .fin-verdict', /var\(--fin-ok-line\)/],
        ['.fin-seg-btn[data-fin-venn-set="both"][aria-pressed="true"]', /background: var\(--fin-ok-soft\)/],
        ['.fin-scenario[data-fin-venn-set="both"][aria-pressed="true"]', /border-color: var\(--fin-ok\)/],
        [".fin-checklist li::before", /background: var\(--fin-ok\)/],
        [".fin-see li::before", /background: var\(--fin-ok\)/],
        ['.fin-pipe[data-step="3"]', /--fin-track: var\(--fin-ok\)/],
        ['.fin-pipe[data-step="3"] .fin-node .fin-node-dot', /background: var\(--fin-ok\)/],
        ['.fin-mover[data-col="2"] .fin-mover-status', /background: var\(--fin-ok\)/],
        [".fin-term--ok dt::before", /background: var\(--fin-ok\)/],
      ];
      for (const [sel, re] of ok) expect(ruleOf(css, sel), `${theme} ${sel}`).toMatch(re);
      for (const sel of [".fin-badge--no", ".fin-met--no", ".fin-see--cant li::before", ".fin-node-tag", ".fin-nc"]) {
        const rule = ruleOf(css, sel);
        expect(rule, `${theme} ${sel}`).toMatch(/--fin-line-strong/);
        expect(rule, `${theme} ${sel}`).not.toMatch(/--fin-ok/);
      }
      // Selection and in-progress UI stays in neutral ink.
      for (const sel of [".fin-tabs-thumb", ".fin-pipe-marker-label", ".fin-btn--primary"]) {
        expect(ruleOf(css, sel), `${theme} ${sel}`).toMatch(/var\(--fin-heading\)/);
      }
      expect(css, theme).toContain("outline: 2px solid var(--fin-heading)");
      expect(css, theme).toMatch(/\.fin-pipe \{ --fin-track: var\(--fin-heading\);/);
      expect(html, theme).toContain('<div class="fin-term fin-term--ok"><dt>Ready to release</dt>');
      expect(html, theme).toContain('<div class="fin-term fin-term--ok"><dt>Live</dt>');
    }
  });

  it("keeps the success colours at AA contrast on fills and tints in light and dark", () => {
    // Page surfaces of the four themes (--b-bg, --bg, --e-bg, --s-bg).
    const surfaces = { light: ["#fafafa", "#ffffff", "#faf8f5"], dark: ["#050505", "#111111", "#1a1816", "#0a0a0a"] };
    for (const [tone, modes] of Object.entries(STATUS_PALETTES)) {
      for (const mode of ["light", "dark"] as const) {
        const p = modes[mode];
        expect(contrast(p.ok, p.okOn), `${tone} ${mode} text on fill`).toBeGreaterThanOrEqual(4.5);
        for (const bg of surfaces[mode]) {
          const soft = mix(p.ok, parseFloat(p.soft) / 100, bg);
          expect(contrast(p.okInk, soft), `${tone} ${mode} ink on tint over ${bg}`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(p.ok, bg), `${tone} ${mode} fill against page ${bg}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("turns off motion under prefers-reduced-motion", () => {
    const html = renderFinishedPage({ themeName: "swiss" });
    expect(html).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.fin-page \*, \.fin-page \*::before, \.fin-page \*::after \{ animation: none !important; transition: none !important;/);
    expect(FINISHED_SCRIPT).toContain("prefers-reduced-motion: reduce");
  });

  it("makes no external requests from its own markup", () => {
    for (const theme of themes) {
      const html = renderFinishedPage({ themeName: theme });
      expect(html, theme).not.toMatch(/<script[^>]+src=/);
      expect(html, theme).not.toMatch(/<img[^>]+src="https?:/);
      expect(mainOf(html), theme).not.toMatch(/(src|href)="https?:/);
      expect(FINISHED_SCRIPT).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\//);
    }
  });
});
