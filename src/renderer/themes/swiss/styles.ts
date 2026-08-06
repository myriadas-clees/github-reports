// Swiss theme: International Typographic Style (Swiss Design)
// Clean white, strict grid, neo-grotesque sans-serif, single accent color
// Zero animation, zero shadows, zero gradients. Pure structure.

import type { Language } from "../../../types.js";
import { getFontConfig } from "../../../i18n/index.js";

const c = {
  bg: "#ffffff",
  text: "#000000",
  textSecondary: "#444444",
  textTertiary: "#999999",
  border: "#000000",
  accent: "#ff0000",
  green: "#1a7f37",
  red: "#cf222e",
  badgePr: "#8250df",
  badgeRelease: "#1a7f37",
  badgeIssue: "#9a6700",
  badgeDiscussion: "#0969da",
};

export const colors = c;

const LIGHT_VARS = `
    --s-bg: #ffffff;
    --s-text: #000000;
    --s-text-secondary: #444444;
    --s-text-tertiary: #999999;
    --s-border: #999999;
    --s-border-subtle: #e0e0e0;
    --s-accent: #ff0000;
    --s-code-bg: #f5f5f5;
    --s-green: #1a7f37;
    --s-red: #cf222e;
    --s-badge-pr: #8250df;
    --s-badge-release: #1a7f37;
    --s-badge-issue: #9a6700;
    --s-badge-discussion: #0969da;
    --s-heatmap-0: #f0f0f0;
    --s-heatmap-1: #d0e8d0;
    --s-heatmap-2: #a0d0a0;
    --s-heatmap-3: #60b060;
    --s-heatmap-4: #1a7f37;
    --s-heatmap-text: #fff;
    --s-section-num: #e8e8e8;
`;

const DARK_VARS = `
    --s-bg: #0a0a0a;
    --s-text: #f0f0f0;
    --s-text-secondary: #b0b0b0;
    --s-text-tertiary: #666666;
    --s-border: #666666;
    --s-border-subtle: #2a2a2a;
    --s-accent: #ff3333;
    --s-code-bg: #1a1a1a;
    --s-green: #3fb950;
    --s-red: #f85149;
    --s-badge-pr: #a371f7;
    --s-badge-release: #3fb950;
    --s-badge-issue: #d29922;
    --s-badge-discussion: #58a6ff;
    --s-heatmap-0: #1a1a1a;
    --s-heatmap-1: #0e4429;
    --s-heatmap-2: #006d32;
    --s-heatmap-3: #26a641;
    --s-heatmap-4: #39d353;
    --s-heatmap-text: #000;
    --s-section-num: #1a1a1a;
`;

const COLOR_VARS = `
  :root { ${LIGHT_VARS} }
  @media (prefers-color-scheme: dark) { :root { ${DARK_VARS} } }
  html[data-theme="light"] { ${LIGHT_VARS} }
  html[data-theme="dark"] { ${DARK_VARS} }
`;

const THEME_TOGGLE_CSS = `
  .theme-toggle {
    background: none; border: none;
    color: var(--s-text-tertiary); cursor: pointer;
    font-family: inherit; font-size: 0.75rem; line-height: 1;
    padding: 0; letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .theme-toggle:hover { color: var(--s-accent); }
`;

export const THEME_INIT_SCRIPT = `<script>
(function(){
  var s=localStorage.getItem("theme");
  if(s)document.documentElement.setAttribute("data-theme",s);
})();
</script>`;

export const THEME_TOGGLE_SCRIPT = `<script>
(function(){
  var btn=document.querySelector(".theme-toggle");
  if(!btn)return;
  function current(){
    return document.documentElement.getAttribute("data-theme")
      || (matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");
  }
  function update(){btn.textContent=current()==="dark"?"\\u2600\\uFE0E Light":"\\u263D\\uFE0E Dark";}
  update();
  btn.addEventListener("click",function(){
    var next=current()==="dark"?"light":"dark";
    document.documentElement.setAttribute("data-theme",next);
    localStorage.setItem("theme",next);
    update();
  });
})();
</script>`;

export const buildCSS = (language: Language = "en"): string => {
  const f = getFontConfig(language);
  const heading = `'Space Grotesk', ${f.bodyFamily}`;
  const body = `'Space Grotesk', ${f.bodyFamily}`;
  const mono = f.monoFamily;

  return `
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;700&display=swap');
    @import url('${f.importUrl}');

    ${COLOR_VARS}
    ${THEME_TOGGLE_CSS}

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: ${body};
      font-weight: 400;
      background: var(--s-bg);
      color: var(--s-text);
      line-height: ${f.lineHeight};
      -webkit-font-smoothing: antialiased;
    }

    a { color: var(--s-text); }
    a:hover { color: var(--s-accent); }

    code {
      font-family: ${mono};
      font-size: 0.85em;
      padding: 0.1em 0.3em;
      background: var(--s-code-bg);
    }

    /* Markdown body — scoped prose styles */
    .md > :first-child { margin-top: 0; }
    .md > :last-child { margin-bottom: 0; }
    .md p { margin: 0 0 0.75em; }
    .md p:last-child { margin-bottom: 0; }
    .md strong { color: var(--s-text); font-weight: 700; }
    .md em { font-style: italic; }
    .md a {
      color: var(--s-accent);
      text-decoration: underline;
      text-underline-offset: 0.12em;
    }
    .md a:hover { color: var(--s-accent); }
    .md h2, .md h3, .md h4 {
      color: var(--s-text);
      font-weight: 700;
      line-height: 1.25;
      margin: 0.9em 0 0.35em;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .md h2 { font-size: 0.9375em; }
    .md h3 { font-size: 0.875em; }
    .md h4 { font-size: 0.8125em; }
    .md h2:first-child, .md h3:first-child, .md h4:first-child { margin-top: 0; }
    .md ul, .md ol {
      margin: 0.4em 0 0.75em;
      padding-left: 1.2em;
    }
    .md li { margin: 0.2em 0; }
    .md li::marker { color: var(--s-accent); }
    .md blockquote {
      margin: 0.75em 0;
      padding: 0.1em 0 0.1em 0.85em;
      border-left: 3px solid var(--s-accent);
      color: var(--s-text-tertiary);
    }
    .md hr {
      border: none;
      border-top: 2px solid var(--s-border);
      margin: 1em 0;
    }
    .md pre {
      margin: 0.75em 0;
      padding: 0.75em 0.9em;
      overflow-x: auto;
      background: var(--s-code-bg);
      font-family: ${mono};
      font-size: 0.75rem;
      line-height: 1.5;
    }
    .md pre code {
      padding: 0;
      background: none;
      font-size: inherit;
    }

    /* ==================== LAYOUT: asymmetric grid ==================== */
    .swiss-layout {
      display: grid;
      grid-template-columns: 80px 1fr;
      max-width: 880px;
      margin: 0 auto;
      padding: 3rem 2rem;
      gap: 0 2rem;
    }

    main { grid-column: 1 / -1; }

    /* ==================== NAV ==================== */
    nav {
      grid-column: 1 / -1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
      border-bottom: 2px solid var(--s-border);
    }
    nav a {
      text-decoration: none;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .nav-site-title {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--s-text);
    }

    /* ==================== SECTION NUMBERS ==================== */
    .section-num {
      font-size: 5rem;
      font-weight: 300;
      line-height: 1;
      vertical-align: top;
      color: var(--s-section-num);
      text-align: right;
      margin-top: 9px;
      position: sticky;
      top: 3rem;
    }
    .section-num-overview {
      margin-top: -7px;
    }

    /* ==================== HEADER ==================== */
    .header {
      grid-column: 1 / -1;
      margin-bottom: 3rem;
      position: relative;
    }
    .header::before {
      content: '';
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 18px,
        var(--s-border-subtle) 18px,
        var(--s-border-subtle) 19px
      );
      opacity: 0.5;
      pointer-events: none;
      z-index: 0;
    }
    .header > * { position: relative; z-index: 1; }
    .header-meta {
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--s-text-tertiary);
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .header-meta a {
      color: var(--s-text-tertiary);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .header-meta a:hover { color: var(--s-accent); }
    .header-meta img {
      width: 18px; height: 18px; border-radius: 50%;
    }
    h1 {
      font-family: ${heading};
      font-size: clamp(2.5rem, 5vw, 4rem);
      font-weight: 700;
      line-height: 1.05;
      letter-spacing: -0.03em;
      margin-bottom: 0.75rem;
    }
    .header-sub {
      font-size: 1rem;
      font-weight: 400;
      color: var(--s-text-secondary);
    }
    .header-rule {
      border: none;
      height: 2px;
      background: var(--s-border);
      margin-top: 2rem;
    }

    /* ==================== OVERVIEW ==================== */
    .overview-row {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 80px 1fr;
      gap: 0 2rem;
      margin-bottom: 3rem;
      position: relative;
    }
    .overview-row::before {
      content: '';
      position: absolute;
      right: -20px;
      top: 0;
      width: 200px;
      height: 200px;
      background:
        linear-gradient(var(--s-border-subtle) 1px, transparent 1px) 0 0 / 40px 40px,
        linear-gradient(90deg, var(--s-border-subtle) 1px, transparent 1px) 0 0 / 40px 40px;
      opacity: 0.5;
      pointer-events: none;
      mask-image: radial-gradient(circle at center, black 30%, transparent 70%);
      -webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 70%);
    }
    .overview-row::after {
      content: '';
      position: absolute;
      right: 20px;
      top: 40px;
      width: 72px;
      height: 72px;
      border: 2px solid var(--s-accent);
      opacity: 0.25;
      transform: rotate(45deg);
      pointer-events: none;
    }
    .overview-geo {
      position: absolute;
      right: 56px;
      top: 16px;
      width: 48px;
      height: 48px;
      border: 2px solid var(--s-border-subtle);
      border-radius: 50%;
      pointer-events: none;
    }
    .overview-geo::before {
      content: '';
      position: absolute;
      right: -40px;
      top: 80px;
      width: 100px;
      height: 100px;
      border: 2px solid var(--s-border-subtle);
      transform: rotate(20deg);
      pointer-events: none;
    }
    .overview {
      max-width: 600px;
      position: relative;
      z-index: 1;
    }
    .overview p {
      font-size: 0.9375rem;
      color: var(--s-text-secondary);
      margin-bottom: 1rem;
    }
    .overview p:last-child { margin-bottom: 0; }

    /* ==================== SECTIONS ==================== */
    .section-row {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 80px 1fr;
      gap: 0 2rem;
      margin-bottom: 3rem;
    }
    .section-content {
      border-top: 2px solid var(--s-border);
      padding-top: 1rem;
    }
    .section-group-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 1.5rem;
    }
    .section-group-title {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.15em;
    }
    .section-group-count {
      font-size: 0.6875rem;
      color: var(--s-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    /* ==================== SUMMARY ==================== */
    .section-summary {
      margin-bottom: 2rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--s-border-subtle);
    }
    .section-summary:last-child { border-bottom: none; padding-bottom: 0; }
    .section-type {
      font-size: 0.625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--s-accent);
      margin-bottom: 0.5rem;
    }
    .section-heading {
      font-family: ${heading};
      font-size: 1.125rem;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 0.35rem;
    }
    .section-body {
      font-size: 0.875rem;
      color: var(--s-text-secondary);
      max-width: 540px;
    }

    /* ==================== CHIPS ==================== */
    .data-chips {
      display: flex; flex-wrap: wrap; gap: 0.5rem;
      margin-top: 0.75rem;
    }
    .chip {
      font-family: ${mono};
      font-size: 0.6875rem;
      color: var(--s-text-secondary);
    }
    .chip-label::after { content: ": "; }
    .chip-green { color: var(--s-green); }
    .chip-red { color: var(--s-red); }

    /* ==================== DIFF BAR ==================== */
    .diff-bar {
      display: flex; height: 3px; overflow: hidden;
      margin-top: 0.75rem; margin-bottom: 0.25rem;
      background: var(--s-border-subtle);
    }
    .diff-add { background: var(--s-green); height: 100%; }
    .diff-del { background: var(--s-red); height: 100%; }
    .diff-labels {
      display: flex; justify-content: space-between;
      font-family: ${mono}; font-size: 0.6875rem;
    }
    .diff-label-add { color: var(--s-green); }
    .diff-label-del { color: var(--s-red); }

    /* ==================== HEATMAP ==================== */
    .mini-heatmap { display: flex; gap: 4px; margin-top: 0.75rem; }
    .mh-day { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .mh-block {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      font-family: ${mono}; font-size: 0.6875rem;
    }
    .mh-label {
      font-size: 0.5625rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--s-text-tertiary);
    }
    .mh-level-0 { background: var(--s-heatmap-0); color: var(--s-text-tertiary); }
    .mh-level-1 { background: var(--s-heatmap-1); }
    .mh-level-2 { background: var(--s-heatmap-2); }
    .mh-level-3 { background: var(--s-heatmap-3); color: var(--s-heatmap-text); }
    .mh-level-4 { background: var(--s-heatmap-4); color: var(--s-heatmap-text); }

    /* ==================== REPO BARS ==================== */
    .repo-bars { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .repo-bar-header { display: flex; justify-content: space-between; font-size: 0.6875rem; }
    .repo-bar-label { font-family: ${mono}; color: var(--s-text-secondary); }
    .repo-bar-value { font-family: ${mono}; color: var(--s-text-tertiary); }
    .github-entity { display: inline-flex; align-items: center; gap: 0.35em; }
    a.github-entity {
      color: var(--s-text); text-decoration: none; transition: color 0.2s;
    }
    a.github-entity:hover { color: var(--s-accent); }
    .activity-block { margin: 0.85rem 0 0.5rem; }
    .activity-repo {
      display: flex; align-items: center; gap: 0.65em;
      font-weight: 600; color: var(--s-text); cursor: pointer;
      list-style: none;
    }
    .activity-repo::-webkit-details-marker { display: none; }
    .activity-repo::before {
      content: "";
      width: 0.4em; height: 0.4em;
      border-right: 1.5px solid var(--s-text-tertiary);
      border-bottom: 1.5px solid var(--s-text-tertiary);
      transform: rotate(-45deg);
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .activity-block[open] > .activity-repo::before { transform: rotate(45deg); }
    .activity-repo--static { cursor: default; }
    .activity-repo--static::before { visibility: hidden; }
    .activity-count {
      font-weight: 400; font-size: 0.8125rem;
      color: var(--s-text-tertiary);
    }
    a.activity-repo-ext {
      display: inline-flex; color: inherit; text-decoration: none;
      transition: color 0.2s;
    }
    a.activity-repo-ext:hover { color: var(--s-accent); }
    .activity-children {
      margin: 0.35rem 0 0.15rem 1.15rem;
      padding-left: 0.65rem;
      border-left: 1px solid var(--s-border-subtle);
    }
    .activity-pr-block { margin: 0.45rem 0; }
    .activity-pr {
      display: flex; align-items: center; gap: 0.55em; flex-wrap: wrap;
      font-weight: 500; color: var(--s-text); cursor: pointer;
      list-style: none;
    }
    .activity-pr::-webkit-details-marker { display: none; }
    .activity-pr::before {
      content: "";
      width: 0.35em; height: 0.35em;
      border-right: 1.5px solid var(--s-text-tertiary);
      border-bottom: 1.5px solid var(--s-text-tertiary);
      transform: rotate(-45deg);
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .activity-pr-block[open] > .activity-pr::before { transform: rotate(45deg); }
    .activity-pr-title {
      color: var(--s-text); text-decoration: none; font-weight: 600;
    }
    .activity-pr-title:hover { color: var(--s-accent); }
    .activity-pr-add { color: var(--s-green); }
    .activity-pr-del { color: var(--s-red); }
    .activity-other-label {
      font-weight: 600; color: var(--s-text-secondary); font-size: 0.875rem;
    }
    .activity-pr-block .activity-list { margin-left: 1.15rem; }
    .activity-list { list-style: none; padding: 0; margin: 0.35rem 0 0; }
    .activity-list a { color: var(--s-text); text-decoration: none; }
    .activity-list a:hover { color: var(--s-accent); }
    .activity-meta { color: var(--s-text-tertiary); font-size: 0.8125rem; margin-left: 0.35rem; }
    .activity-heading {
      font-size: 1rem; font-weight: 700; margin: 1.75rem 0 0.75rem;
      color: var(--s-text);
    }
    .pr-state {
      font-family: ${mono}; font-size: 0.6875rem;
      text-transform: uppercase; letter-spacing: 0.08em;
      margin-right: 0.35rem; color: var(--s-text-tertiary);
    }
    .pr-state.pr-merged { color: var(--s-badge-pr, #1a7f37); }
    .pr-state.pr-open { color: var(--s-accent); }
    .pr-state.pr-closed { color: var(--s-badge-issue, #cf222e); }
    .github-mark {
      display: inline-flex; width: 0.875rem; height: 0.875rem;
      flex-shrink: 0; color: currentColor; opacity: 0.85;
    }
    .github-mark svg { display: block; width: 100%; height: 100%; }
    .repo-bar-track { width: 100%; height: 3px; background: var(--s-border-subtle); overflow: hidden; }
    .repo-bar-fill { height: 100%; background: var(--s-accent); }

    /* ==================== HIGHLIGHTS ==================== */
    .highlight-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1.5rem;
    }
    .highlight-card {
      padding-top: 1rem;
      border-top: 2px solid var(--s-border);
    }
    .highlight-heading {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }
    .highlight-badge {
      font-size: 0.5625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      display: inline-block;
      flex-shrink: 0;
    }
    .highlight-pr { color: var(--s-badge-pr); }
    .highlight-release { color: var(--s-badge-release); }
    .highlight-issue { color: var(--s-badge-issue); }
    .highlight-discussion { color: var(--s-badge-discussion); }
    .highlight-title {
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.25;
      min-width: 0;
    }
    .highlight-title a { color: var(--s-text); text-decoration: none; }
    .highlight-title a:hover { color: var(--s-accent); }
    .highlight-meta {
      display: flex;
      align-items: center;
      gap: 0.35em;
      width: 100%;
      min-width: 0;
      font-family: ${mono};
      font-size: 0.625rem;
      color: var(--s-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .highlight-meta-repo {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
    }
    .highlight-meta-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .highlight-meta-tail {
      flex-shrink: 0;
      white-space: nowrap;
    }
    .highlight-body {
      font-size: 0.8125rem;
      color: var(--s-text-secondary);
    }

    /* ==================== SHARE ==================== */
    .share-bar {
      grid-column: 1 / -1;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--s-border-subtle);
      font-size: 0.75rem;
      display: flex; gap: 1rem; align-items: center;
    }
    .share-label {
      color: var(--s-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 0.625rem;
    }
    .share-btn {
      color: var(--s-text);
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.6875rem;
    }
    .share-btn:hover { color: var(--s-accent); }

    /* ==================== WEEK NAV ==================== */
    .week-nav {
      grid-column: 1 / -1;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--s-border-subtle);
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .week-nav a { color: var(--s-text); text-decoration: none; }
    .week-nav a:hover { color: var(--s-accent); }

    /* ==================== FOOTER ==================== */
    .footer {
      grid-column: 1 / -1;
      margin-top: 4rem;
      padding-top: 1.5rem;
      border-top: 2px solid var(--s-border);
      text-align: left;
      font-size: 0.6875rem;
      color: var(--s-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .footer a { color: var(--s-text-secondary); text-decoration: none; }
    .footer a:hover { color: var(--s-accent); }
    .theme-toggle-row { margin-bottom: 0.5rem; }

    /* ==================== RESPONSIVE ==================== */
    @media (max-width: 640px) {
      .swiss-layout {
        grid-template-columns: 1fr;
        padding: 2rem 1.25rem;
        gap: 0;
      }
      .section-num { display: none; }
      .overview-row,
      .section-row {
        grid-template-columns: 1fr;
      }
      h1 { font-size: 2rem; }
      .highlight-grid { grid-template-columns: 1fr; }
    }

    @media print {
      body { background: #fff; color: #000; }
      nav, .share-bar, .week-nav { display: none; }
      .section-num { color: #ddd; }
    }
  `;
};

export const buildIndexCSS = (language: Language = "en"): string => {
  const f = getFontConfig(language);
  const heading = `'Space Grotesk', ${f.bodyFamily}`;
  const mono = f.monoFamily;

  return `
    .index-layout {
      max-width: 880px;
      margin: 0 auto;
      padding: 4rem 2rem;
    }

    /* ==================== INDEX HEADER ==================== */
    .index-header {
      margin-bottom: 4rem;
    }
    .index-header h1 {
      font-family: ${heading};
      font-size: clamp(3rem, 10vw, 6rem);
      font-weight: 300;
      line-height: 1;
      letter-spacing: -0.04em;
      color: var(--s-text);
      margin-bottom: 2rem;
    }
    .index-profile {
      display: flex; align-items: center; gap: 0.75rem;
      text-decoration: none; color: inherit;
    }
    .index-profile:hover { color: var(--s-accent); }
    .index-profile img { width: 40px; height: 40px; border-radius: 50%; }
    .index-profile-name {
      font-weight: 700;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .index-profile-handle {
      font-size: 0.75rem;
      color: var(--s-text-tertiary);
      letter-spacing: 0.05em;
    }
    .index-stats {
      font-size: 0.6875rem;
      color: var(--s-text-tertiary);
      margin-top: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    /* ==================== YEAR GROUPS ==================== */
    .year-group {
      display: grid;
      grid-template-columns: 80px 1fr;
      gap: 0 2rem;
      margin-bottom: 3rem;
    }
    .year-label {
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1;
      color: var(--s-text-tertiary);
      text-align: right;
      padding-top: 0.75rem;
    }

    .week-list { list-style: none; padding: 0; border-top: 2px solid var(--s-border); }
    .week-item {
      display: block;
      padding: 1rem 0;
      border-bottom: 1px solid var(--s-border-subtle);
      text-decoration: none;
      color: inherit;
    }
    .week-item:hover .week-item-title { color: var(--s-accent); }
    .week-item-header {
      display: flex; justify-content: space-between; align-items: baseline;
    }
    .week-item-title {
      font-weight: 700;
      font-size: 0.9375rem;
    }
    .week-item-week {
      font-family: ${mono};
      font-size: 0.625rem;
      color: var(--s-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .week-item-subtitle {
      font-size: 0.8125rem;
      color: var(--s-text-secondary);
      margin-top: 0.125rem;
    }

    /* ==================== FOOTER ==================== */
    .footer {
      margin-top: 4rem;
      padding-top: 1.5rem;
      border-top: 2px solid var(--s-border);
      font-size: 0.6875rem;
      color: var(--s-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .footer a { color: var(--s-text-secondary); text-decoration: none; }
    .footer a:hover { color: var(--s-accent); }

    @media (max-width: 640px) {
      .index-layout { padding: 2rem 1.25rem; }
      .year-group { grid-template-columns: 1fr; }
      .year-label {
        text-align: left;
        font-size: 2rem;
        margin-bottom: 0.5rem;
      }
    }

    @media print {
      body { background: #fff; }
    }
  `;
};
