# Worklog design QA

Use this report for a requested visual review of a rendered Worklog page. Record evidence from the actual renderer output; do not claim visual verification from source inspection alone.

## Target

- Page/theme: default theme (`brutalist` config key) converted to Myriad Apps Graphical "Myriad Advisor Solutions". Covers the homepage, daily report, work-week page, estimator and `/finished/` explainer.
- Viewport: 1440×900 and 390×844, light and dark, in the T3 preview browser.
- Input data or fixture: stored `data/` (90 daily reports, 2026-06-16 to 2026-10-19). Rendered without fetching via `bun dist/cli/index.js render --config config.yaml --output-dir /tmp/worklog-myriad --date 2026-10-19 --base-url https://127.0.0.1`.
- Reference image or design: current source `gui/source/graphical-theme.css` (tokens) and `gui/source/styles.css` (aliases and shared component rules), plus `gui/themes/myriad-advisor-solutions-components.md` for the Button, Meter, Navigation and Tabs assignments.
- Rendered output location: `/tmp/worklog-myriad`, served by `worklog preview` on port 4183.
- Screenshots: `docs/design-qa/myriad-theme/` (23 PNGs, named `<page>-<width>-<mode>.png`).
- State: complete for the listed scope. Gaps are listed below.

## Visual review

- **Overall composition and content hierarchy.** The neutral top bar (`--neutral-2`, one composed edge) holds the mode-appropriate M mark, the site title in the brand font, and the Light/Dark control. Each page has a compact header on the canvas: kicker, then title, then metadata. Content sections are Myriad cards (`--surface`, edge plus `--shadow-s`, `--radius-m`). The homepage ledger is one card, with months, then weeks, then days as divided rows.
- **Typography and wrapping.**
  - Roboto (UI/brand) and Lora (editorial: subtitles, intros, the estimate note) load from `assets/fonts/`. Confirmed in the browser with `document.fonts` and the network log: no Google requests; the only third-party request is the GitHub avatar.
  - Every text element on the homepage, daily, week and estimate pages renders at a theme step (11/13/15/17/25/38/51 px), checked by computed-style scan.
  - On `/finished/`, the explainer's own UI text was mapped to steps. The only off-scale sizes left are Venn/pipeline artwork labels and glyphs (arrows, dots, chevrons), which scale with their container.
- **Spacing and alignment.** All padding, gaps and margins use `--space-*`. The page header and content column share a left edge, measured at 208 px at 1440 after the fix below. Prose is capped at 60–70ch inside full-width cards.
- **Color, contrast, and theme tokens.**
  - Light mode uses warm neutrals `#f2f1ee`/`#f8f7f4`. Dark mode uses the source's warm dark grey `#1a1817`/`#211f1e`, neither brown nor blue.
  - Actions and selection are monotone: the segmented control, pressed estimate card and alloc tabs use `--neutral-10`; focus uses `--focus-ring-outline`; meters use `--neutral-9`.
  - Brand red appears only in the logo mark and the homepage kicker rule (`--nav-accent`, which switches to `--error` in dark).
  - Positive states are green (`--status-positive*`). Deletions and closed PRs use `--danger-text`.
- **Tables, charts, and data density.**
  - The initiative and work-type categorical palettes are preserved unchanged, because they are a shared, validated data encoding.
  - The heatmap uses a sequential deep-teal ramp (`--color-4`) mixed into the surface.
  - The month activity tape and repository meters are monotone.
- **Responsive behavior.** At 390 px, every page has `scrollWidth` within the viewport (checked by script on all five pages). Ledger rows stack, estimate cards go two-up, and the explainer stacks.

## Behavior and diagnostics

- **Relevant controls and interactions.**
  - Light/Dark control: clicking it switches the mode, updates `aria-pressed`/`aria-label` and the active segment, and persists to `localStorage`. With no stored choice, the OS setting is honoured (light by default).
  - Estimate cards: clicking "A bug fix" moves `aria-pressed` and updates the select and the result.
  - Explainer tabs: ArrowRight moves the focus and selection to "Where the change is".
  - Ledger `<details>` expand and collapse.
- **Keyboard and focus behavior.** Tab focus on the estimator select shows a 2 px `--focus-ring-outline` (monotone, 50% ink). The skip link appears on focus. Summary rows and ledger links use an inset ring.
- **Generated HTML or browser console issues.** No console errors were recorded on any reviewed page. One fix was made during review: the dark-mode logo had `alt=""`, so the brand link lost its "Myriad" name in dark. Both marks now have `alt="Myriad"`, and only one is displayed at a time.
- **Checks actually run.**
  - `bun run build`: pass.
  - `bun run lint`: pass.
  - `bun run test`: 1248/1248 pass, including updated theme tests and a new assertion that `render` copies `assets/fonts`. After the checks-block revision: 1251/1251 pass.
  - Render from stored data, then browser review at 1440 and 390 in light and dark.

## Component coverage

| Component (Worklog selector) | Myriad assignment | Status |
| --- | --- | --- |
| Tokens, both modes | `graphical-theme.css` `:root` + dark block, plus `styles.css` aliases (`--surface`, `--page-bg`, `--border`, `--action`, `--link`, `--edge`, `--danger-text`, `--nav-*`) | converted (`tokens.ts`) |
| Top bar (`nav[aria-label]`, `.index-nav`) | `.myriad-app-header`, `.myriad-app-title`, mode-adaptive mark | converted |
| Light/Dark control (`.theme-toggle`) | `.ui-segmented` | converted |
| Skip link | `.ui-skip-link` | converted |
| Page header (`.report-hero`, `.overhead-header`, `.est-page` / week header) | compact page header on canvas; kicker label style from `.myriad-page-hero__kicker` | converted (charcoal hero band intentionally not used, see exceptions) |
| Section cards, ledger, home summary, highlight tiles | `.card` | converted |
| Chips, `est-tag`, alloc tags/stages | `.ui-badge-outline` / `.badge` (pill, composed edge) | converted |
| Highlight type badge | `--emphasis-type-*` badge | converted |
| Selects (`.est-select`, `.alloc-select`) | `.input-field` + `.ui-select` chevron | converted |
| Field labels (`.est-label`) | `.ui-label` | converted |
| Day/Week switch (`.alloc-switch`) | `.ui-segmented` | converted |
| Pager links (`.week-nav-link`, `.week-pager a`) | `.ui-button-outline` small | converted |
| Estimate kind cards (`.est-card[aria-pressed]`) | card + navigation-active fill + `--border-l` ink edge | converted |
| Meters (`.repo-bar-*`, `.alloc-item-track`) | `.ui-meter` | converted |
| Links | `--link` ink, 35% underline | converted |
| Focus | `--focus-ring-outline` | converted |
| Explainer (`/finished/`) | shared `finished-css.ts` fed Myriad tokens (radius, shadow, spacing, fonts, light-first); headings, labels and UI text mapped to steps in a theme-scoped adapter | converted; diagram artwork preserved |
| Initiative / work-type palettes | data encoding | intentionally preserved |
| Explainer status greens (`STATUS_PALETTES.forest`) | positive status | intentionally preserved |
| Other themes (minimal, editorial, swiss) | n/a | not in scope, unchanged |

## Intentional exceptions

- **Positive green.** The theme's `--success` (`#76ef6b`) fails text contrast on light neutrals, so `--status-positive*` reuses the explainer's forest greens (`#1b7a3d` light, `#3fb96b`/`#6fdc97` dark).
- **No charcoal hero band.** `.myriad-page-hero` uses fixed cool charcoal in both modes. The brief asks for warm neutral surfaces, so page headers sit on the canvas instead.
- **No body gradient or noise.** The source `body` gradient and noise overlay are not reproduced. They mix in the cool charcoal and are imperceptible on the neutral canvas.
- **Label tracking.** `letter-spacing: 0.08em` on uppercase labels is copied from the source kicker and badge rules. Month-tape bar gap and radius (2px/1px) are chart-mark geometry.

## Findings

1. Fixed (P2). The content column was inset 28 px from the page header (`max-width` excluded padding). It now uses `calc(64rem + 2 * var(--space-l))`, and both edges measure 208 px at 1440.
2. Fixed (P2). The dark-mode logo had an empty `alt`, as described under Behavior and diagnostics.
3. Fixed (P3). The checks block lines and explainer UI text were off the type scale. They are now mapped to text steps (the checks block was later regrouped, see below).
4. Open (P3, content, pre-existing). The daily report shows "See the whole week" twice, once in the header and once at the top of "Where the effort went". Template behaviour is covered by allocation tests; the duplicate was left as is.
5. Open (P3, data, pre-existing). On narrow screens the "Other" segment label in the week initiative bar is clipped to "(" because the segment is narrower than its label. The shared allocation builder decides when to show labels.

6. Fixed (P2). "Checks behind this work" was a label over two dense sentence lines. It is now grouped, as described in the next section.

## Revision: "Checks behind this work"

- **Scope.** The default theme's checks block only (`partials/allocation-panel.hbs`, `.alloc-verify-*` in `brutalist/styles.ts`). The minimal, editorial and swiss themes still render `readinessLine`/`checksLine` unchanged.
- **Data.** `buildVerification` now returns `scope` and `groups` (Where the changes are / Automated checks / Reviews and tests) of `{ value, label, tone }` facts. The two lines are joined from the same facts, so their wording is unchanged and no formatted sentence is parsed. Tones: `positive` only for live changes; `pending` for checks still running; `tentative` for not collected, incomplete results and drafts. Passed checks and code integrated stay neutral.
- **Layout.** The section label has an "across N changes" meta. Up to three outlined tiles (`--radius-s`, `--border` edge) sit in an auto-fit grid: three columns at 1440, stacked at 390. Each fact is a marker, a count (`text("m")`, UI medium, tabular) and a label (`text("s")`). Markers are filled `--neutral-5`, green `--status-positive` for live, a ring for running and dashed for missing evidence. The caveat and the finished-guide link share one `text("xs")` `--neutral-7` footnote. Each tile is an `h4` plus a list labelled by that heading. The block is a `section` labelled by its `h3`.
- **Evidence.** Rendered from stored data (`render --date 2026-10-19`, no fetch) and reviewed on `/2026/10/19/` (12 changes) and `/weeks/2026-10-15/` (13 changes) at 1440 and 390, light and dark, with the mode set through the toggle. At 390, `scrollWidth` is 390 and nothing inside the block overflows. Screenshots: `docs/design-qa/checks-section/{daily,week}-{1440,390}-{light,dark}.png` (8).
- **Tests.** View tests cover the groups, tones and empty-group omission. A render test checks that the default theme marks running checks as pending and uncollected ones as tentative, with no positive tone when nothing is live. The every-theme test still expects the sentence line in the other themes.
- **Not reviewed.** Stored data in this range has no live, in-testing, still-running or incomplete-check PRs, so those tones were checked only in tests, not on screen.

## Result

The default theme was converted on named Myriad tokens and component assignments, and reviewed in the browser at 1440 and 390 in light and dark across all five page types, with interactions checked as listed above.

Remaining gaps:

- **Font weights.** The supplied fonts cover weights 400–700, so the brand role's 200/300 weights render at 400. This matches the source app with the same files.
- **Data font.** `--font-data` ("Sidebar Geist Mono") is not supplied, so code falls back to the system monospace.
- **Non-Latin locales.** These no longer import Google fonts and use their script family only when it is installed locally. Only English was rendered.
- **Explainer screenshots.** The desktop light/dark captures were refreshed after the final typography changes; the interaction and mobile captures remain in the same directory.
- **Archive refresh.** All 90 stored daily reports were regenerated using `scripts/render-daily-archive.sh` with `OUTPUT_DIR=/tmp/worklog-myriad`, `BASE_URL=http://127.0.0.1:4183` and `CONFIG_PATH=config.yaml`. No GitHub fetch or data backfill was performed.
