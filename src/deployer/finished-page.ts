// Static explainer page "How we say something is finished", written to finished/index.html.
// Content is fixed text; colors and chrome come from the selected theme.

import Handlebars from "handlebars";
import type { Language, Theme } from "../types.js";
import type { AllocationCssTheme } from "../renderer/themes/allocation-css.js";
import { buildFinishedCSS } from "../renderer/themes/finished-css.js";
import { getLocale, getFontConfig } from "../i18n/index.js";
import { loadTheme, readThemeTemplate } from "../renderer/themes/index.js";

export const FINISHED_TITLE = "How we say something is finished";
const FINISHED_DESCRIPTION =
  "How this site tells apart Done, Ready to release, Merged, Code integrated, In testing and Live.";

/** Theme token names (CSS variables) per theme, mirroring what each theme passes to its own shared CSS. */
const THEME_TOKENS: Record<Theme, Omit<AllocationCssTheme, "defaultMode" | "mono">> = {
  brutalist: {
    text: "var(--b-text)", textSecondary: "var(--b-text-secondary)", textTertiary: "var(--b-text-tertiary)",
    heading: "var(--b-heading)", border: "var(--b-border)", borderSubtle: "var(--b-border-subtle)",
    surface: "var(--b-bg)", accent: "var(--b-accent)", radius: "0",
  },
  minimal: {
    text: "var(--text)", textSecondary: "var(--text-secondary)", textTertiary: "var(--text-tertiary)",
    heading: "var(--text)", border: "var(--border)", borderSubtle: "var(--border-subtle)",
    surface: "var(--bg)", accent: "var(--accent)", radius: "2px",
  },
  editorial: {
    text: "var(--e-text)", textSecondary: "var(--e-text-secondary)", textTertiary: "var(--e-text-tertiary)",
    heading: "var(--e-heading)", border: "var(--e-border)", borderSubtle: "var(--e-border-subtle)",
    surface: "var(--e-bg)", accent: "var(--e-accent)", radius: "2px",
  },
  swiss: {
    text: "var(--s-text)", textSecondary: "var(--s-text-secondary)", textTertiary: "var(--s-text-tertiary)",
    heading: "var(--s-text)", border: "var(--s-border)", borderSubtle: "var(--s-border-subtle)",
    surface: "var(--s-bg)", accent: "var(--s-accent)", radius: "0",
  },
};

/** Static body for the <main> element. No dynamic data, so no escaping is needed. */
export const FINISHED_BODY = `
  <h1>How we say something is finished</h1>
  <p class="fin-intro">Three different questions all get called “done”. This page shows how this site tells them apart.</p>

  <section class="fin-key" aria-labelledby="fin-key-title">
    <h2 id="fin-key-title">Key</h2>
    <dl>
      <dt><abbr title="Definition of Done">DoD</abbr></dt>
      <dd>Definition of Done: the team's checklist for how a change is built. Same checklist every time: code reviewed, automated tests pass, automated checks pass with no new errors, the GitHub issue is updated.</dd>
      <dt><abbr title="Acceptance Criteria">AC</abbr></dt>
      <dd>Acceptance Criteria: what this particular request must do, agreed with the client. A new list for each request.</dd>
      <dt><abbr title="pull request">PR</abbr></dt>
      <dd>pull request: one proposed change to the code.</dd>
      <dt>Ready to release</dt>
      <dd>The change meets both its DoD and its AC, so it may go out to all users and clients.</dd>
      <dt>Merged (our team's word)</dt>
      <dd>The change has gone out to users or clients with the DoD and AC both met. GitHub's "Merge" button means something narrower, so this site avoids the word.</dd>
      <dt>Code integrated</dt>
      <dd>The PR's changes are in the target branch. This is not a release, and not DoD or AC sign-off.</dd>
      <dt>In testing</dt>
      <dd>The change is on the preview site.</dd>
      <dt>Live</dt>
      <dd>The change is running in production.</dd>
    </dl>
  </section>

  <section class="fin-section" aria-labelledby="fin-s1">
    <h2 id="fin-s1">Built the right way, and what we asked for</h2>
    <div class="fin-venn" role="group" aria-label="Definition of Done and Acceptance Criteria overlap at Ready to release">
      <div class="fin-venn-stage">
        <div class="fin-circle fin-circle--dod">
          <div class="fin-circle-body">
            <p class="fin-circle-label">Set by the development team</p>
            <h3>Definition of Done</h3>
            <p class="fin-quote">“Is it built the right way?”</p>
            <ul class="fin-checklist">
              <li>Code reviewed</li>
              <li>Automated tests pass</li>
              <li>Automated checks pass, no new errors</li>
              <li>GitHub issue updated</li>
            </ul>
            <span class="fin-pill">Same checklist every time</span>
          </div>
        </div>
        <div class="fin-circle fin-circle--ac">
          <div class="fin-circle-body">
            <p class="fin-circle-label">Agreed with the client</p>
            <h3>Acceptance Criteria</h3>
            <p class="fin-quote">“Is it what we asked for?”</p>
            <ul class="fin-checklist">
              <li>Lists what the client needs</li>
              <li>Says what it should do</li>
              <li>Agreed with the client before work starts</li>
              <li>Confirmed with the client</li>
            </ul>
            <span class="fin-pill">New list for each request</span>
          </div>
        </div>
        <div class="fin-overlap">
          <span class="fin-check" aria-hidden="true">&#10003;</span>
          <p class="fin-overlap-title">Ready to release</p>
          <p class="fin-overlap-text">Built the right way and confirmed as what was asked. It can now go out to all users and clients.</p>
        </div>
      </div>
    </div>
    <div class="fin-cases">
      <article class="fin-case">
        <h3>Built right, but not what was asked</h3>
        <span class="fin-pill">Not ready to release</span>
      </article>
      <article class="fin-case">
        <h3>What was asked, but not built right</h3>
        <span class="fin-pill">Not ready to release</span>
      </article>
      <article class="fin-case fin-case--ready">
        <h3>Built right and what was asked</h3>
        <span class="fin-pill fin-pill--accent">Ready to release</span>
      </article>
    </div>
  </section>

  <section class="fin-section" aria-labelledby="fin-s2">
    <h2 id="fin-s2">Where the change is now</h2>
    <ol class="fin-stages">
      <li class="fin-stage"><h3>In review</h3><p>Being reviewed; not in the target branch yet.</p></li>
      <li class="fin-stage"><h3>Code integrated</h3><p>In the target branch. Not a release, not DoD or AC sign-off.</p></li>
      <li class="fin-stage"><h3>In testing</h3><p>On the preview site.</p></li>
      <li class="fin-stage"><h3>Live</h3><p>Running in production.</p></li>
    </ol>
    <p class="fin-note">“Code integrated · not live yet” means it is in the target branch but no production release has been recorded.</p>
    <p class="fin-note">These stages describe where the code is, not whether it was approved.</p>
  </section>

  <section class="fin-section" aria-labelledby="fin-s3">
    <h2 id="fin-s3">What this site can and can't see</h2>
    <p class="fin-lead">This site reads GitHub automatically: reviews, automated checks and deployments. It can't see the rest of the Definition of Done, or whether the client has accepted the work. Code integrated and Live describe where the code is, not whether it has been approved. Only the team can say a change is Ready to release or merged. Missing evidence is shown as “not collected”, never as a pass.</p>
  </section>

  <section class="fin-section" aria-labelledby="fin-s4">
    <h2 id="fin-s4">Issues and projects</h2>
    <div class="fin-pair">
      <article class="fin-card">
        <h3>Issue board — small, single tasks</h3>
        <p class="fin-quote">“Is this one fix done?”</p>
        <div class="fin-board">
          <div class="fin-col"><h4>To do</h4><div class="fin-item">#214 Add export button</div><div class="fin-item">#218 Fix date filter</div></div>
          <div class="fin-col"><h4>In progress</h4><div class="fin-item">#209 Update logo</div><div class="fin-item">#215 Speed up search</div></div>
          <div class="fin-col"><h4>Closed</h4><div class="fin-item">#201 Dark mode toggle</div><div class="fin-item">#205 Login redirect</div><div class="fin-item">#207 Upgrade library</div></div>
        </div>
        <ul class="fin-bullets">
          <li>One feature, bug, fix, or chore per card</li>
          <li>Closed when that one task is finished</li>
          <li>Need it again? Open a new issue, or reopen if it was unfinished</li>
          <li>Never means “the app is done”</li>
        </ul>
        <span class="fin-pill">Many small cards that close</span>
      </article>
      <article class="fin-card">
        <h3>Project board — big-picture work</h3>
        <p class="fin-quote">“Where is the whole project?”</p>
        <div class="fin-board">
          <div class="fin-col"><h4>Planning</h4><div class="fin-item">Customer portal v2</div></div>
          <div class="fin-col"><h4>Building</h4><div class="fin-item">Billing migration</div><div class="fin-item">Partner rollout</div></div>
          <div class="fin-col"><h4>Launched</h4><div class="fin-item">Search launch</div></div>
        </div>
        <ul class="fin-bullets">
          <li>One project or goal per card</li>
          <li>Moves through stages over time</li>
          <li>Progress comes from many issues</li>
          <li>Shows overall status to leadership</li>
        </ul>
        <span class="fin-pill">A few big cards that move through stages</span>
      </article>
    </div>
    <p class="fin-connect"><strong>How they connect:</strong> one project card is made up of many GitHub issues. Closing an issue moves the project forward, but does not finish it.</p>
  </section>

  <p class="fin-back"><a href="../">&larr; Back to the worklog</a></p>
`;

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
    finishedCss: buildFinishedCSS({ ...THEME_TOKENS[themeName], defaultMode: "light", mono: fontConfig.monoFamily }),
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
