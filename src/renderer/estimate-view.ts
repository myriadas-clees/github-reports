// Template data for the static "How long would it take?" planning calculator.
// Everything is client-side: calibration JSON is embedded and a tiny inline script updates the output.

import { MIN_SAMPLE_SIZE, type EstimateCalibration } from "../collector/estimate-calibration.js";

export type EstimateCalculatorView = {
  sampleSize: number;
  /** e.g. "Jun 2026" */
  sinceLabel: string;
  /** JSON safe to embed in a <script type="application/json"> element. */
  json: string;
  /** Inline vanilla JS (no <script> wrapper). */
  script: string;
};

/** JSON.stringify, then escape characters that could close or confuse the script element. */
export const safeEmbedJson = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const formatSince = (since: string): string => {
  const [year, month] = since.split("-");
  const name = MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : since;
};

/** Mirrors the multipliers described in the "How this is calculated" note. */
export const ESTIMATE_SCRIPT = `(function () {
  var root = document.querySelector("[data-est-root]");
  if (!root) return;
  var data = JSON.parse(root.querySelector("script[type='application/json']").textContent);
  var form = root.querySelector("form");
  var out = function (n) { return root.querySelector("[data-est-" + n + "]"); };
  var FAM50 = [1, 1.15, 1.3], FAM90 = [1, 1.3, 1.6], INTEG = [1, 1.2, 1.4];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function show(v) {
    if (v < 10) return Math.max(0.5, Math.round(v * 2) / 2);
    return Math.round(v);
  }
  function plural(v, unit) { return v + " " + unit + (v === 1 ? "" : "s"); }
  function effort(days) {
    var n = show(days);
    var text = String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
    return "~" + text + " " + (n === 1 ? "engineer-day" : "engineer-days");
  }
  function since() {
    var p = data.since.split("-");
    return MONTHS[Number(p[1]) - 1] + " " + p[0];
  }
  function field(name) { return form.elements[name].value; }
  function update() {
    var kind = field("kind"), isApp = kind === "app";
    var fam = Number(field("familiar")), integ = Number(field("integrations"));
    var scale = INTEG[integ] * (field("target") === "prototype" ? 0.5 : 1);
    var m50 = FAM50[fam] * scale, m90 = FAM90[fam] * scale;
    var sizeField = root.querySelector("[data-est-size]");
    sizeField.hidden = isApp;
    var lo, hi, eff, basis, extra = "", ref = [];
    if (isApp) {
      var a = data.apps;
      lo = show(a.activeDays.p50 * m50);
      hi = show(a.activeDays.p90 * m90);
      eff = a.effortDays.p50 * m50;
      var weeks = Math.max(1, Math.round(a.spanWeeks.p50 * m50));
      extra = " of focused work, spread over roughly " + plural(weeks, "week");
      basis = "Based on " + a.initiatives.length + " apps/products";
      ref = a.initiatives.map(function (i) {
        return i.name + ": " + i.activeDays + " working days over " + i.spanWeeks + " weeks";
      });
    } else {
      var g = data.groups.filter(function (x) { return x.kind === kind && x.size === field("size"); })[0];
      lo = show(g.turnaroundDays.p50 * m50);
      hi = show(g.turnaroundDays.p90 * m90);
      eff = g.effortDays.p50 * m50;
      basis = "Based on " + g.poolN + " similar changes I've merged since " + since();
      if (g.thin) basis += ". Thin history (only " + g.n + " exactly like this), so I widened the comparison; treat as a rough guide";
    }
    if (hi < lo) hi = lo;
    var line = "Likely about " + plural(lo, "working day") + extra;
    out("primary").textContent = hi > lo ? line + " \\u00b7 allow up to " + hi : line;
    out("secondary").textContent = "Equivalent effort for a typical engineer: " + effort(eff);
    out("basis").textContent = basis + ".";
    var list = out("ref");
    list.hidden = !ref.length;
    list.textContent = "";
    ref.forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text;
      list.appendChild(li);
    });
  }
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  update();
})();`;

export const buildEstimateCalculatorView = (
  calibration: EstimateCalibration | undefined,
): EstimateCalculatorView | undefined => {
  if (!calibration || calibration.sampleSize < MIN_SAMPLE_SIZE) return undefined;
  return {
    sampleSize: calibration.sampleSize,
    sinceLabel: formatSince(calibration.since),
    json: safeEmbedJson(calibration),
    script: ESTIMATE_SCRIPT,
  };
};
