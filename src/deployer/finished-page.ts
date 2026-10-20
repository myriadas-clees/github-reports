// Static explainer page "How we say something is finished", written to finished/index.html.
// Content is fixed text; colors and chrome come from the selected theme.
// Progressive enhancement: without JavaScript every panel is shown stacked. FINISHED_HEAD_SCRIPT marks
// <html> with `fin-js` before first paint, and FINISHED_SCRIPT turns the panels into a tabbed explorer
// with the Venn, stage and board interactions.

import Handlebars from "handlebars";
import type { Language, Theme } from "../types.js";
import { buildFinishedCSS, type FinishedCssTheme } from "../renderer/themes/finished-css.js";
import { getLocale, getFontConfig } from "../i18n/index.js";
import { loadTheme, readThemeTemplate } from "../renderer/themes/index.js";

export const FINISHED_TITLE = "How we say something is finished";
const FINISHED_DESCRIPTION =
  "How this site tells apart Done, Ready to release, Merged, Code integrated, In testing and Live.";

/** Explorer panels: tab label and URL hash (the panel id). */
export const FINISHED_PANELS = [
  { id: "ready", tab: "Ready to release" },
  { id: "stages", tab: "Where the change is" },
  { id: "boards", tab: "Issues vs projects" },
] as const;

const SOFT_SHADOW = "0 1px 2px rgba(0,0,0,0.04), 0 4px 14px -6px rgba(0,0,0,0.10)";
const SOFT_SHADOW_HOVER = "0 2px 4px rgba(0,0,0,0.05), 0 16px 32px -14px rgba(0,0,0,0.28)";

/** Theme tokens (CSS variables), status green and shape per theme, so each theme keeps its own character. */
const THEME_TOKENS: Record<Theme, Omit<FinishedCssTheme, "mono">> = {
  brutalist: {
    text: "var(--b-text)", textSecondary: "var(--b-text-secondary)", heading: "var(--b-heading)",
    border: "var(--b-border)", surface: "var(--b-bg)", statusTone: "forest", darkFirst: true,
    labelFont: "'Space Mono', ui-monospace, monospace",
    radius: "0", radiusSmall: "0", pillRadius: "0", dotRadius: "0",
    shadow: "none", hoverShadow: "4px 4px 0 var(--b-heading)",
    padX: "3rem", padXNarrow: "1.5rem", padTop: "7rem",
  },
  minimal: {
    text: "var(--text)", textSecondary: "var(--text-secondary)", heading: "var(--text)",
    border: "var(--border)", surface: "var(--bg)", statusTone: "forest", darkFirst: false,
    labelFont: "inherit",
    radius: "14px", radiusSmall: "8px", pillRadius: "999px", dotRadius: "50%",
    shadow: SOFT_SHADOW, hoverShadow: SOFT_SHADOW_HOVER,
    padX: "2rem", padXNarrow: "1.25rem", padTop: "4.5rem",
  },
  editorial: {
    text: "var(--e-text)", textSecondary: "var(--e-text-secondary)", heading: "var(--e-heading)",
    border: "var(--e-border)", surface: "var(--e-bg)", statusTone: "calm", darkFirst: false,
    labelFont: "inherit",
    radius: "6px", radiusSmall: "4px", pillRadius: "999px", dotRadius: "50%",
    shadow: SOFT_SHADOW, hoverShadow: SOFT_SHADOW_HOVER,
    padX: "0", padXNarrow: "0", padTop: "3.5rem",
  },
  swiss: {
    text: "var(--s-text)", textSecondary: "var(--s-text-secondary)", heading: "var(--s-text)",
    border: "var(--s-border-subtle)", surface: "var(--s-bg)", statusTone: "forest", darkFirst: false,
    labelFont: "inherit",
    radius: "0", radiusSmall: "0", pillRadius: "0", dotRadius: "50%",
    shadow: "none", hoverShadow: "0 14px 28px -18px rgba(0,0,0,0.45)",
    padX: "3rem", padXNarrow: "1.25rem", padTop: "4.5rem",
  },
};

const TAB_ICONS: Record<(typeof FINISHED_PANELS)[number]["id"], string> = {
  ready: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  stages: '<circle cx="4" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="20" cy="12" r="2.2"/><path d="M6.4 12h3.2M14.4 12h3.2"/>',
  boards: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="11" rx="1"/><rect x="16" y="4" width="5" height="7" rx="1"/>',
};

const tabs = FINISHED_PANELS.map(
  (p, i) => `
      <button type="button" class="fin-tab" role="tab" id="fin-tab-${p.id}" aria-controls="${p.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false">${TAB_ICONS[p.id]}</svg>
        <span>${p.tab}</span>
      </button>`,
).join("");

const STAGES = [
  { name: "In review", text: "Being reviewed; not in the target branch yet." },
  { name: "Code integrated", text: "The PR's changes are in the target branch. Not a release, and not DoD or AC sign-off." },
  { name: "In testing", text: "On the preview site." },
  { name: "Live", text: "Running in production." },
];

const stageNodes = STAGES.map(
  (s, i) => `
        <li class="fin-node">
          <button type="button" class="fin-node-btn">
            <span class="fin-node-dot" aria-hidden="true">${i + 1}</span>
            <span class="fin-node-label">
              <span class="fin-node-name">${s.name}</span>
              ${i === 1 ? '<span class="fin-node-tag fin-js-only" aria-hidden="true">not live yet</span>' : ""}
              <span class="fin-node-text">${s.text}</span>
            </span>
          </button>
        </li>`,
).join("");

/** A sample board card; `mover` marks the one the illustration moves between columns. */
const item = (id: string, title: string, extra = "") =>
  `<div class="fin-item${extra}">${id ? `<span class="fin-item-id">${id}</span>` : ""}${title}</div>`;
const moverInner = (id: string, title: string, status: string) =>
  `<span class="fin-mover-status">${status}</span><span class="fin-mover-title">${id ? `<span class="fin-item-id">${id}</span>` : ""}${title}</span>`;
const slot = (id: string, title: string, longest: string) =>
  `<div class="fin-slot fin-js-only" aria-hidden="true"><div>${moverInner(id, title, longest)}</div></div>`;

const board = (opts: {
  kind: "issue" | "project";
  title: string;
  sub: string;
  quote: string;
  cols: Array<{ name: string; items: string[] }>;
  mover: { id: string; title: string };
  bullets: string[];
  pill: string;
  caption: string;
}) => {
  const longest = opts.cols.map((c) => c.name).reduce((a, b) => (b.length > a.length ? b : a));
  const cols = opts.cols
    .map(
      (c, i) => `
          <div class="fin-col">
            <h4 class="fin-label">${c.name}</h4>
            ${slot(opts.mover.id, opts.mover.title, longest)}
            ${i === 0 ? item(opts.mover.id, opts.mover.title, " fin-item--src") : ""}
            ${c.items.join("")}
          </div>`,
    )
    .join("");
  return `
      <article class="fin-boardcard fin-boardcard--${opts.kind}" data-fin-board="${opts.kind}" aria-labelledby="fin-board-${opts.kind}">
        <div class="fin-boardcard-head">
          <div>
            <p class="fin-label">${opts.sub}</p>
            <h3 id="fin-board-${opts.kind}">${opts.title}</h3>
          </div>
          <button type="button" class="fin-btn fin-btn--small fin-js-only" data-fin-play aria-label="Play: ${opts.caption}">Play</button>
        </div>
        <p class="fin-quote">“${opts.quote}”</p>
        <div class="fin-board">
          ${cols}
          <div class="fin-mover fin-js-only" aria-hidden="true">${moverInner(opts.mover.id, opts.mover.title, opts.cols[0].name)}</div>
        </div>
        <ul class="fin-bullets">${opts.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
        <span class="fin-pill">${opts.pill}</span>
      </article>`;
};

const DOD = '<abbr title="Definition of Done">DoD</abbr>';
const AC = '<abbr title="Acceptance Criteria">AC</abbr>';
const PR = '<abbr title="pull request">PR</abbr>';

/** Static body for the <main> element. No dynamic data, so no escaping is needed. */
export const FINISHED_BODY = `
  <header class="fin-hero">
    <p class="fin-label fin-eyebrow">Worklog guide</p>
    <h1>How we say something is finished</h1>
    <p class="fin-sub">Three different questions all get called “done”. This page shows how this site tells them apart.</p>
    <div class="fin-questions" role="navigation" aria-label="The three questions">
      <a class="fin-q" href="#ready" data-fin-tab="ready" data-fin-venn="dod">
        <span class="fin-q-ask">Built right?</span>
        <span class="fin-q-ans">${DOD} · Definition of Done</span>
        <span class="fin-q-arrow" aria-hidden="true">&rarr;</span>
      </a>
      <a class="fin-q" href="#ready" data-fin-tab="ready" data-fin-venn="ac">
        <span class="fin-q-ask">What we asked for?</span>
        <span class="fin-q-ans">${AC} · Acceptance Criteria</span>
        <span class="fin-q-arrow" aria-hidden="true">&rarr;</span>
      </a>
      <a class="fin-q" href="#stages" data-fin-tab="stages">
        <span class="fin-q-ask">Is it out yet?</span>
        <span class="fin-q-ans">Release stage</span>
        <span class="fin-q-arrow" aria-hidden="true">&rarr;</span>
      </a>
    </div>
  </header>

  <section class="fin-explorer" aria-label="Explore what finished means">
    <div class="fin-tabs fin-js-only" role="tablist" aria-label="Choose a diagram">
      <span class="fin-tabs-thumb" aria-hidden="true"></span>${tabs}
    </div>

    <section class="fin-panel is-active" id="ready" role="tabpanel" aria-labelledby="fin-tab-ready" tabindex="0">
      <div class="fin-panel-head">
        <h2>Built the right way, and what we asked for</h2>
        <p class="fin-lead">A change is Ready to release only when it meets both its Definition of Done and its Acceptance Criteria. Meeting one is not enough.</p>
      </div>
      <div class="fin-venn" data-state="both">
        <div class="fin-venn-main">
        <figure class="fin-venn-art" role="img" aria-label="Two overlapping circles, Definition of Done and Acceptance Criteria. Where they overlap: Ready to release.">
          <svg class="fin-venn-svg" viewBox="0 0 360 232" aria-hidden="true" focusable="false">
            <circle class="fin-c fin-c--dod" cx="124" cy="116" r="112"/>
            <circle class="fin-c fin-c--ac" cx="236" cy="116" r="112"/>
            <path class="fin-lens" d="M180 19 A112 112 0 0 1 180 213 A112 112 0 0 1 180 19 Z"/>
          </svg>
          <div class="fin-venn-label fin-venn-label--dod">
            <span class="fin-venn-abbr">DoD</span>
            <span class="fin-venn-name">Definition of Done</span>
            <span class="fin-venn-q">Built right?</span>
          </div>
          <div class="fin-venn-label fin-venn-label--ac">
            <span class="fin-venn-abbr">AC</span>
            <span class="fin-venn-name">Acceptance Criteria</span>
            <span class="fin-venn-q">What we asked for?</span>
          </div>
          <div class="fin-venn-center">
            <span class="fin-venn-check">&#10003;</span>
            <span class="fin-venn-ready">Ready to release</span>
          </div>
        </figure>
          <p class="fin-label fin-js-only" id="fin-venn-show">Which checklist is met?</p>
          <div class="fin-seg fin-js-only" role="group" aria-labelledby="fin-venn-show">
            <button type="button" class="fin-seg-btn" data-fin-venn-set="dod" aria-pressed="false" aria-label="Definition of Done"><span class="fin-long">Definition of Done</span><span class="fin-short">DoD</span></button>
            <button type="button" class="fin-seg-btn" data-fin-venn-set="ac" aria-pressed="false" aria-label="Acceptance Criteria"><span class="fin-long">Acceptance Criteria</span><span class="fin-short">AC</span></button>
            <button type="button" class="fin-seg-btn" data-fin-venn-set="both" aria-pressed="true">Both</button>
          </div>
        </div>

        <div class="fin-venn-side">
          <div class="fin-verdict" aria-live="polite" aria-atomic="true">
            <span class="fin-badge fin-badge--ready" data-fin-verdict>Ready to release</span>
            <p class="fin-verdict-text" data-fin-caption>Built the right way and confirmed as what was asked. It can now go out to all users and clients.</p>
          </div>
          <p class="fin-label" id="fin-scenarios-title">Scenarios</p>
          <ul class="fin-scenarios" aria-labelledby="fin-scenarios-title">
            <li><button type="button" class="fin-scenario" data-fin-venn-set="dod" aria-pressed="false"><span class="fin-scenario-title">Built right, but not what was asked</span><span class="fin-badge fin-badge--no">Not ready to release</span></button></li>
            <li><button type="button" class="fin-scenario" data-fin-venn-set="ac" aria-pressed="false"><span class="fin-scenario-title">What was asked, but not built right</span><span class="fin-badge fin-badge--no">Not ready to release</span></button></li>
            <li><button type="button" class="fin-scenario" data-fin-venn-set="both" aria-pressed="true"><span class="fin-scenario-title">Built right and what was asked</span><span class="fin-badge fin-badge--ready">Ready to release</span></button></li>
          </ul>
        </div>

        <div class="fin-lists">
          <article class="fin-list fin-list--dod" aria-labelledby="fin-list-dod">
            <div class="fin-list-top">
              <p class="fin-label">Set by the development team</p>
              <span class="fin-met fin-met--yes fin-js-only">Met</span><span class="fin-met fin-met--no fin-js-only">Not met</span>
            </div>
            <h3 id="fin-list-dod">Definition of Done</h3>
            <p class="fin-quote">“Is it built the right way?”</p>
            <ul class="fin-checklist">
              <li>Code reviewed</li>
              <li>Automated tests pass</li>
              <li>Automated checks pass, no new errors</li>
              <li>GitHub issue updated</li>
            </ul>
            <span class="fin-pill">Same checklist every time</span>
          </article>
          <article class="fin-list fin-list--ac" aria-labelledby="fin-list-ac">
            <div class="fin-list-top">
              <p class="fin-label">Agreed with the client</p>
              <span class="fin-met fin-met--yes fin-js-only">Met</span><span class="fin-met fin-met--no fin-js-only">Not met</span>
            </div>
            <h3 id="fin-list-ac">Acceptance Criteria</h3>
            <p class="fin-quote">“Is it what we asked for?”</p>
            <ul class="fin-checklist">
              <li>Lists what the client needs</li>
              <li>Says what it should do</li>
              <li>Agreed with the client before work starts</li>
              <li>Confirmed with the client</li>
            </ul>
            <span class="fin-pill">New list for each request</span>
          </article>
        </div>
      </div>
    </section>

    <section class="fin-panel" id="stages" role="tabpanel" aria-labelledby="fin-tab-stages" tabindex="0">
      <div class="fin-panel-head">
        <h2>Where the change is now</h2>
        <p class="fin-lead">Every change moves through the same four stages. They describe where the code is, not whether it was approved.</p>
      </div>
      <div class="fin-pipe" data-step="0" data-not-live="false">
        <ol class="fin-pipe-track" aria-label="Release stages">${stageNodes}
        </ol>
        <span class="fin-pipe-marker fin-js-only" aria-hidden="true"><span class="fin-pipe-marker-label">This change</span></span>
      </div>
      <div class="fin-pipe-panel fin-js-only">
        <div class="fin-pipe-detail" aria-live="polite" aria-atomic="true">
          <div class="fin-pipe-swap">
            <p class="fin-label" data-fin-count>Stage 1 of 4</p>
            <p class="fin-pipe-name" data-fin-name>${STAGES[0].name}</p>
            <p class="fin-pipe-text" data-fin-text>${STAGES[0].text}</p>
          </div>
        </div>
        <div class="fin-pipe-controls">
          <div class="fin-pipe-steps">
            <button type="button" class="fin-btn" data-fin-pipe="back" aria-disabled="true"><span aria-hidden="true">&larr;</span> Back</button>
            <button type="button" class="fin-btn fin-btn--primary" data-fin-pipe="next">Next stage <span aria-hidden="true">&rarr;</span></button>
          </div>
          <button type="button" class="fin-switch" data-fin-pipe="notlive" aria-pressed="false"><span class="fin-switch-track" aria-hidden="true"></span>Show “Code integrated · not live yet”</button>
        </div>
      </div>
      <p class="fin-note">“Code integrated · not live yet” means it is in the target branch but no production release has been recorded.</p>
      <p class="fin-callout"><span>These stages describe <strong>where the code is</strong>, not whether it was approved.</span></p>
    </section>

    <section class="fin-panel" id="boards" role="tabpanel" aria-labelledby="fin-tab-boards" tabindex="0">
      <div class="fin-panel-head">
        <h2>Issues and projects</h2>
        <p class="fin-lead">Two boards answer two different questions: is this one task done, and where is the whole project?</p>
      </div>
      <div class="fin-seg fin-boards-switch" role="group" aria-label="Show board">
        <button type="button" class="fin-seg-btn" data-fin-board-set="issue" aria-pressed="true">Issue board</button>
        <button type="button" class="fin-seg-btn" data-fin-board-set="project" aria-pressed="false">Project board</button>
      </div>
      <div class="fin-boards" data-show="issue">${board({
        kind: "issue",
        title: "Issue board",
        sub: "Small, single tasks",
        quote: "Is this one fix done?",
        cols: [
          { name: "To do", items: [item("#214", "Add export button")] },
          { name: "In progress", items: [item("#209", "Update logo"), item("#215", "Speed up search")] },
          { name: "Closed", items: [item("#201", "Dark mode toggle"), item("#205", "Login redirect"), item("#207", "Upgrade library")] },
        ],
        mover: { id: "#218", title: "Fix date filter" },
        bullets: [
          "One feature, bug, fix, or chore per card",
          "Closed when that one task is finished",
          "Need it again? Open a new issue, or reopen if it was unfinished",
          "Never means “the app is done”",
        ],
        pill: "Many small cards that close",
        caption: "an issue moving from To do to In progress to Closed",
      })}${board({
        kind: "project",
        title: "Project board",
        sub: "Big-picture work",
        quote: "Where is the whole project?",
        cols: [
          { name: "Planning", items: [] },
          { name: "Building", items: [item("", "Billing migration"), item("", "Partner rollout")] },
          { name: "Launched", items: [item("", "Search launch")] },
        ],
        mover: { id: "", title: "Customer portal v2" },
        bullets: [
          "One project or goal per card",
          "Moves through stages over time",
          "Progress comes from many issues",
          "Shows overall status to leadership",
        ],
        pill: "A few big cards that move through stages",
        caption: "a project moving from Planning to Building to Launched",
      })}
      </div>
      <p class="fin-callout"><span><strong>How they connect:</strong> one project card is made up of many GitHub issues. Closing an issue moves the project forward, but does not finish it.</span></p>
    </section>
  </section>

  <section class="fin-see-section" aria-labelledby="fin-see-title">
    <h2 id="fin-see-title">What this site can and can't see</h2>
    <p class="fin-lead">This site reads GitHub automatically. Some of what “finished” means happens outside GitHub.</p>
    <div class="fin-see-grid">
      <div class="fin-see fin-see--can">
        <h3>Reads from GitHub</h3>
        <ul><li>Reviews</li><li>Automated checks</li><li>Deployments</li></ul>
      </div>
      <div class="fin-see fin-see--cant">
        <h3>Can't see</h3>
        <ul><li>The rest of the Definition of Done</li><li>Whether the client has accepted the work</li></ul>
      </div>
    </div>
    <ul class="fin-see-notes">
      <li>Code integrated and Live describe where the code is, not whether it has been approved.</li>
      <li>Only the team can say a change is Ready to release or merged.</li>
      <li>Missing evidence is shown as <span class="fin-nc">not collected</span>, never as a pass.</li>
    </ul>
  </section>

  <details class="fin-key" id="key" open>
    <summary>
      <h2 id="fin-key-title">Key</h2>
      <span class="fin-key-sum">${DOD}, ${AC}, ${PR} and the words this site uses for checks and stages.</span>
      <span class="fin-key-chev" aria-hidden="true">&#9662;</span>
    </summary>
    <div class="fin-key-groups">
      <div class="fin-key-col">
        <section class="fin-key-group" aria-labelledby="fin-key-checks">
          <h3 class="fin-label" id="fin-key-checks">Checks</h3>
          <dl>
            <div class="fin-term"><dt>${DOD} <span class="fin-term-full">Definition of Done</span></dt><dd>The team's checklist for how a change is built. Same checklist every time: code reviewed, automated tests pass, automated checks pass with no new errors, the GitHub issue is updated.</dd></div>
            <div class="fin-term"><dt>${AC} <span class="fin-term-full">Acceptance Criteria</span></dt><dd>What this particular request must do, agreed with the client. A new list for each request.</dd></div>
            <div class="fin-term fin-term--ok"><dt>Ready to release</dt><dd>The change meets both its DoD and its AC, so it may go out to all users and clients.</dd></div>
            <div class="fin-term"><dt>Merged <span class="fin-term-full">our team's word</span></dt><dd>The change has gone out to users or clients with the DoD and AC both met. GitHub's “Merge” button means something narrower, so this site avoids the word.</dd></div>
          </dl>
        </section>
      </div>
      <div class="fin-key-col">
        <section class="fin-key-group" aria-labelledby="fin-key-stages">
          <h3 class="fin-label" id="fin-key-stages">Stages</h3>
          <dl>
            <div class="fin-term"><dt>Code integrated</dt><dd>The PR's changes are in the target branch. This is not a release, and not DoD or AC sign-off.</dd></div>
            <div class="fin-term"><dt>In testing</dt><dd>The change is on the preview site.</dd></div>
            <div class="fin-term fin-term--ok"><dt>Live</dt><dd>The change is running in production.</dd></div>
          </dl>
        </section>
        <section class="fin-key-group" aria-labelledby="fin-key-words">
          <h3 class="fin-label" id="fin-key-words">Words</h3>
          <dl>
            <div class="fin-term"><dt>${PR} <span class="fin-term-full">pull request</span></dt><dd>One proposed change to the code.</dd></div>
          </dl>
        </section>
      </div>
    </div>
  </details>

  <p class="fin-back"><a href="../">&larr; Back to the worklog</a></p>
`;

/** Runs in <head>: lets the CSS switch to the tabbed layout before first paint (no flash of stacked panels). */
export const FINISHED_HEAD_SCRIPT = `<script>document.documentElement.classList.add("fin-js");</script>`;

/** Explorer behaviour: tabs + hash, Venn state, stage stepper, board illustrations. Vanilla, no dependencies. */
export const FINISHED_SCRIPT = `<script>
(function () {
  var root = document.querySelector(".fin-page");
  var tablist = root && root.querySelector(".fin-tabs");
  if (!tablist) return;
  var motion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function calm() { return !!(motion && motion.matches); }
  function all(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }
  function one(sel, el) { return (el || root).querySelector(sel); }
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  var onShow = {};

  /* ---- Tabs (automatic activation, roving tabindex, hash deep links) ---- */
  var explorer = one(".fin-explorer");
  var tabs = all("[role=tab]", tablist);
  var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
  var current = 0;
  function panelIndex(id) { for (var i = 0; i < panels.length; i++) if (panels[i].id === id) return i; return -1; }
  function select(i, opts) {
    opts = opts || {};
    var prev = current;
    current = i;
    tablist.style.setProperty("--fin-tab", String(i));
    tabs.forEach(function (t, k) {
      var on = k === i;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      panels[k].classList.toggle("is-active", on);
    });
    var panel = panels[i];
    if (prev !== i && !opts.quiet) restart(panel, "is-entering");
    if (opts.focus) tabs[i].focus();
    if (opts.hash !== false && window.history && history.replaceState) history.replaceState(null, "", "#" + panel.id);
    if (onShow[panel.id]) onShow[panel.id]();
  }
  tabs.forEach(function (t, k) { t.addEventListener("click", function () { select(k); }); });
  tablist.addEventListener("keydown", function (e) {
    var n = tabs.length, i;
    if (e.key === "ArrowRight") i = (current + 1) % n;
    else if (e.key === "ArrowLeft") i = (current + n - 1) % n;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = n - 1;
    else return;
    e.preventDefault();
    select(i, { focus: true });
  });
  panels.forEach(function (p) {
    p.addEventListener("animationend", function (e) { if (e.target === p) p.classList.remove("is-entering"); });
  });
  function scrollToExplorer() { explorer.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" }); }
  window.addEventListener("hashchange", function () {
    var i = panelIndex(location.hash.slice(1));
    if (i < 0) return;
    select(i, { hash: false });
    scrollToExplorer();
  });

  /* ---- Venn: DoD / AC / Both ---- */
  var venn = one(".fin-venn");
  var VENN = {
    dod: { ready: false, text: "Built the right way, but not what was asked. The Definition of Done alone is not enough." },
    ac: { ready: false, text: "What was asked, but not built the right way. The Acceptance Criteria alone are not enough." },
    both: { ready: true, text: "Built the right way and confirmed as what was asked. It can now go out to all users and clients." }
  };
  var verdict = one("[data-fin-verdict]", venn);
  var caption = one("[data-fin-caption]", venn);
  function setVenn(state, quiet) {
    var v = VENN[state];
    if (!v) return;
    venn.setAttribute("data-state", state);
    all("[data-fin-venn-set]", venn).forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-fin-venn-set") === state ? "true" : "false");
    });
    verdict.textContent = v.ready ? "Ready to release" : "Not ready to release";
    verdict.className = "fin-badge " + (v.ready ? "fin-badge--ready" : "fin-badge--no");
    caption.textContent = v.text;
    if (v.ready && !quiet) restart(venn, "is-pulsing");
  }
  all("[data-fin-venn-set]", venn).forEach(function (b) {
    b.addEventListener("click", function () { setVenn(b.getAttribute("data-fin-venn-set")); });
  });
  var vennSeen = false;
  onShow.ready = function () {
    if (vennSeen) return;
    vennSeen = true;
    if (venn.getAttribute("data-state") === "both") restart(venn, "is-pulsing");
  };

  /* ---- Stages: step a marker along the pipeline ---- */
  var pipe = one(".fin-pipe");
  var nodes = all(".fin-node", pipe);
  var marker = one(".fin-pipe-marker", pipe);
  var detail = one(".fin-pipe-detail");
  var stages = nodes.map(function (n) {
    return { name: one(".fin-node-name", n).textContent, text: one(".fin-node-text", n).textContent };
  });
  var NOT_LIVE = { name: "Code integrated \\u00b7 not live yet", text: "In the target branch, but no production release has been recorded." };
  var backBtn = one("[data-fin-pipe=back]"), nextBtn = one("[data-fin-pipe=next]"), liveBtn = one("[data-fin-pipe=notlive]");
  var step = 0, notLive = false;
  function placeMarker(still) {
    var dot = one(".fin-node-dot", nodes[step]);
    var a = pipe.getBoundingClientRect(), b = dot.getBoundingClientRect();
    if (!b.width) return;
    marker.classList.toggle("is-still", !!still);
    marker.style.transform = "translate(" + (b.left - a.left + b.width / 2) + "px," + (b.top - a.top + b.height / 2) + "px)";
    if (still) { void marker.offsetWidth; marker.classList.remove("is-still"); }
  }
  function setStep(i, variant, still) {
    step = Math.max(0, Math.min(nodes.length - 1, i));
    notLive = !!variant && step === 1;
    pipe.setAttribute("data-step", String(step));
    pipe.setAttribute("data-not-live", notLive ? "true" : "false");
    nodes.forEach(function (n, k) {
      n.classList.toggle("is-done", k < step);
      n.classList.toggle("is-current", k === step);
      var b = one(".fin-node-btn", n);
      if (k === step) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    var s = notLive ? NOT_LIVE : stages[step];
    one("[data-fin-count]", detail).textContent = "Stage " + (step + 1) + " of " + nodes.length;
    one("[data-fin-name]", detail).textContent = s.name;
    one("[data-fin-text]", detail).textContent = s.text;
    if (!still) restart(detail, "is-swapping");
    backBtn.setAttribute("aria-disabled", step === 0 ? "true" : "false");
    nextBtn.setAttribute("aria-disabled", step === nodes.length - 1 ? "true" : "false");
    liveBtn.setAttribute("aria-pressed", notLive ? "true" : "false");
    placeMarker(still);
  }
  backBtn.addEventListener("click", function () { if (step > 0) setStep(step - 1); });
  nextBtn.addEventListener("click", function () { if (step < nodes.length - 1) setStep(step + 1); });
  liveBtn.addEventListener("click", function () { setStep(1, !notLive); });
  nodes.forEach(function (n, k) { one(".fin-node-btn", n).addEventListener("click", function () { setStep(k); }); });
  onShow.stages = function () { placeMarker(true); };

  /* ---- Boards: a card moves across the columns ---- */
  var boards = one(".fin-boards");
  var players = all(".fin-boardcard", boards).map(function (card) {
    var board = one(".fin-board", card), mover = one(".fin-mover", card), cols = all(".fin-col", board);
    var status = one(".fin-mover-status", mover), btn = one("[data-fin-play]", card);
    var labels = cols.map(function (c) { return one("h4", c).textContent; });
    var pos = 0, played = false, timers = [];
    function place(i, still) {
      var slot = one(".fin-slot", cols[i]);
      var a = board.getBoundingClientRect(), b = slot.getBoundingClientRect();
      if (!b.width) return;
      pos = i;
      mover.classList.toggle("is-still", !!still);
      mover.style.width = b.width + "px";
      mover.style.transform = "translate(" + (b.left - a.left - board.clientLeft) + "px," + (b.top - a.top - board.clientTop) + "px)";
      mover.setAttribute("data-col", String(i));
      status.textContent = labels[i];
      cols.forEach(function (c, k) { c.classList.toggle("is-target", k === i); });
      if (still) { void mover.offsetWidth; mover.classList.remove("is-still"); }
    }
    function play() {
      timers.forEach(clearTimeout);
      timers = [];
      played = true;
      btn.textContent = "Replay";
      place(0, true);
      timers.push(setTimeout(function () { place(1); }, 650));
      timers.push(setTimeout(function () { place(2); }, 1600));
    }
    btn.addEventListener("click", play);
    return { card: card, play: play, refresh: function () { place(pos, true); }, played: function () { return played; } };
  });
  var showBtns = all("[data-fin-board-set]");
  showBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-fin-board-set");
      boards.setAttribute("data-show", v);
      showBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      players.forEach(function (p) {
        if (p.card.getAttribute("data-fin-board") !== v) return;
        restart(p.card, "is-entering");
        p.refresh();
      });
    });
  });
  players.forEach(function (p) {
    p.card.addEventListener("animationend", function (e) { if (e.target === p.card) p.card.classList.remove("is-entering"); });
  });
  onShow.boards = function () { players.forEach(function (p) { p.refresh(); }); };
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        players.forEach(function (p) { if (p.card === en.target && !p.played()) p.play(); });
      });
    }, { threshold: 0.25 });
    players.forEach(function (p) { io.observe(p.card); });
  }

  /* ---- Keep markers aligned when the layout changes ---- */
  var frame = 0;
  function relayout() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(function () {
      placeMarker(true);
      players.forEach(function (p) { p.refresh(); });
    });
  }
  window.addEventListener("resize", relayout);
  if ("ResizeObserver" in window) { var ro = new ResizeObserver(relayout); ro.observe(pipe); ro.observe(boards); }

  /* ---- Hero shortcuts and key link ---- */
  all("[data-fin-tab]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var i = panelIndex(a.getAttribute("data-fin-tab"));
      if (i < 0) return;
      e.preventDefault();
      var v = a.getAttribute("data-fin-venn");
      if (v) setVenn(v);
      select(i);
      scrollToExplorer();
      panels[i].focus({ preventScroll: true });
    });
  });

  setVenn("both", true);
  setStep(0, false, true);
  var start = panelIndex(location.hash.slice(1));
  select(start < 0 ? 0 : start, { quiet: true, hash: false });
})();
</script>`;

export type FinishedPageOptions = {
  username?: string;
  language?: Language;
  siteTitle?: string;
  baseUrl?: string;
  themeName?: Theme;
};

/** Render finished/index.html in the selected theme (light and dark follow the theme). */
export const renderFinishedPage = (options: FinishedPageOptions = {}): string => {
  const language = options.language ?? "en";
  const locale = getLocale(language);
  const fontConfig = getFontConfig(language);
  const themeName = options.themeName ?? "brutalist";
  const theme = loadTheme(themeName);
  const resolvedSiteTitle = (options.siteTitle ?? "Dev\nPulse").replace(/\\n/g, "\n");
  const siteTitleInline = resolvedSiteTitle.replace(/\n/g, " ");
  const hbs = Handlebars.create();
  const template = hbs.compile(readThemeTemplate(theme, "finished-page.hbs"));
  return template({
    body: FINISHED_BODY,
    finishedCss: buildFinishedCSS({ ...THEME_TOKENS[themeName], mono: fontConfig.monoFamily }),
    finishedHeadScript: FINISHED_HEAD_SCRIPT,
    finishedScript: FINISHED_SCRIPT,
    themeName,
    css: theme.buildCSS(language),
    indexCss: theme.buildIndexCSS(language),
    username: options.username ?? "",
    siteTitle: resolvedSiteTitle,
    siteTitleInline,
    pageTitle: `${FINISHED_TITLE} · ${siteTitleInline}`,
    description: FINISHED_DESCRIPTION,
    baseUrl: options.baseUrl,
    ogImageUrl: options.baseUrl ? `${options.baseUrl}/og.png` : "../og.png",
    lang: language,
    poweredBy: locale.poweredBy,
    generatedWith: locale.generatedWith,
    monoFamily: fontConfig.monoFamily,
    accentColor: theme.colors.accent,
    themeInitScript: theme.themeInitScript ?? "",
    themeToggleScript: theme.themeToggleScript ?? "",
  });
};
