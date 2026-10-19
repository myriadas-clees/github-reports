// Standalone "How long would it take?" page, written to estimate/index.html (one level below the site root).

import Handlebars from "handlebars";
import type { Language, Theme } from "../types.js";
import { getLocale, getFontConfig } from "../i18n/index.js";
import { loadTheme, readThemeTemplate } from "../renderer/themes/index.js";
import { buildEstimateCalculatorView, safeEmbedJson } from "../renderer/estimate-view.js";
import type { EstimateCalibration } from "../collector/estimate-calibration.js";

/** Entry cards; `param` is the shareable ?kind= value, `value` the calculator's "kind" option. */
export const ESTIMATE_KIND_CARDS = [
  { param: "app", value: "app", label: "A new app or product" },
  { param: "feature", value: "feature", label: "A new feature" },
  { param: "change", value: "change", label: "A change to something that exists" },
  { param: "bug", value: "bug-fix", label: "A bug fix" },
] as const;

/** Cards offered on the page; the app card needs at least one past app/product. */
export const visibleKindCards = (hasApps: boolean) =>
  hasApps ? ESTIMATE_KIND_CARDS : ESTIMATE_KIND_CARDS.filter((c) => c.param !== "app");

/**
 * Inline JS: preselect from ?kind=, wire the cards, keep the URL param in sync.
 * Without app history, ?kind=app is ignored so the select keeps its default ("feature").
 */
export const buildEstimateKindScript = (hasApps = true): string => `(function () {
  var map = ${safeEmbedJson(Object.fromEntries(visibleKindCards(hasApps).map((c) => [c.param, c.value])))};
  var select = document.getElementById("est-kind");
  if (!select) return;
  var cards = document.querySelectorAll("[data-est-card]");
  function paramFor(value) {
    for (var key in map) if (map[key] === value) return key;
    return null;
  }
  function sync(replace) {
    var param = paramFor(select.value);
    for (var i = 0; i < cards.length; i++) {
      cards[i].setAttribute("aria-pressed", String(cards[i].getAttribute("data-est-card") === param));
    }
    if (replace && param && window.history && history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set("kind", param);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }
  var wanted = new URLSearchParams(window.location.search).get("kind");
  if (wanted && Object.prototype.hasOwnProperty.call(map, wanted)) {
    select.value = map[wanted];
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  select.addEventListener("change", function () { sync(true); });
  for (var i = 0; i < cards.length; i++) {
    cards[i].addEventListener("click", function (e) {
      select.value = map[e.currentTarget.getAttribute("data-est-card")];
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.scrollIntoView({ behavior: "smooth", block: "center" });
      select.focus({ preventScroll: true });
    });
  }
  sync(false);
})();`;

export const renderEstimatePage = (
  calibration: EstimateCalibration | undefined,
  options: {
    username?: string;
    language?: Language;
    siteTitle?: string;
    baseUrl?: string;
    themeName?: Theme;
  } = {},
): string | undefined => {
  const calculator = buildEstimateCalculatorView(calibration);
  if (!calculator) return undefined;
  const language = options.language ?? "en";
  const locale = getLocale(language);
  const fontConfig = getFontConfig(language);
  const theme = loadTheme(options.themeName ?? "brutalist");
  const resolvedSiteTitle = (options.siteTitle ?? "Dev\nPulse").replace(/\\n/g, "\n");
  const siteTitleInline = resolvedSiteTitle.replace(/\n/g, " ");
  const description = "Pick the kind of work to get a planning range based on my past delivery.";
  const hbs = Handlebars.create();
  hbs.registerPartial("estimate-calculator", readThemeTemplate(theme, "partials/estimate-calculator.hbs"));
  const template = hbs.compile(readThemeTemplate(theme, "estimate-page.hbs"));
  return template({
    calculator,
    cards: visibleKindCards(calculator.hasApps),
    kindScript: buildEstimateKindScript(calculator.hasApps),
    css: theme.buildCSS(language),
    indexCss: theme.buildIndexCSS(language),
    username: options.username ?? "",
    siteTitle: resolvedSiteTitle,
    siteTitleInline,
    pageTitle: `How long would it take? · ${siteTitleInline}`,
    description,
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
