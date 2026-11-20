import { describe, it, expect } from "vitest";
import { buildEstimateCalculatorView, safeEmbedJson, ESTIMATE_SCRIPT } from "./estimate-view.js";
import { renderIndexPage, buildReportEntry } from "../deployer/index-page.js";
import { AVAILABLE_THEMES } from "./themes/index.js";
import { assertNoSecretsInHtml } from "../config.js";
import type { EstimateCalibration } from "../collector/estimate-calibration.js";
import type { Theme } from "../types.js";

const p = (a: number, b: number) => ({ p50: a, p90: b });
const calibration = (name = "Hub", sampleSize = 11): EstimateCalibration => ({
  version: "1.0", asOf: "2026-10-07", since: "2026-06", sampleSize,
  groups: [{ kind: "feature", size: "M", n: 3, thin: true, pooled: "kind", poolN: 8,
    turnaroundDays: p(3, 7), activeDays: p(2, 4), effortDays: p(1.5, 3) }],
  apps: { initiatives: [{ name, activeDays: 34, spanWeeks: 9, effortDays: 20, mergedPrs: 5 }],
    activeDays: p(34, 34), spanWeeks: p(9, 9), effortDays: p(20, 20) },
});

describe("estimate view", () => {
  it("returns undefined without enough data", () => {
    expect(buildEstimateCalculatorView(undefined)).toBeUndefined();
    expect(buildEstimateCalculatorView(calibration("Hub", 4))).toBeUndefined();
  });
  it("escapes JSON so it cannot break out of the script element", () => {
    const json = safeEmbedJson({ n: "</script><script>alert(1)</script> & \u2028" });
    expect(json).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(json).n).toContain("</script>");
    const view = buildEstimateCalculatorView(calibration("</script><b>x"))!;
    expect(view.json).not.toContain("</script>");
    expect(view.sinceLabel).toBe("Jun 2026");
  });
  it("reports hasApps only when past apps/products exist", () => {
    expect(buildEstimateCalculatorView(calibration())!.hasApps).toBe(true);
    const noApps = { ...calibration(), apps: { ...calibration().apps, initiatives: [] } };
    expect(buildEstimateCalculatorView(noApps)!.hasApps).toBe(false);
  });
});

describe("calculator script", () => {
  it("is valid JavaScript and reports effort in engineer-days only", () => {
    expect(() => new Function(ESTIMATE_SCRIPT)).not.toThrow();
    expect(ESTIMATE_SCRIPT).not.toContain("engineer-week");
    expect(ESTIMATE_SCRIPT).not.toContain("hours / 40");
    expect(ESTIMATE_SCRIPT).toContain('"engineer-days"');
    // Calendar span stays in weeks.
    expect(ESTIMATE_SCRIPT).toContain("spread over roughly");
  });
  it("falls back from app to a non-app kind when there is no app history", () => {
    expect(ESTIMATE_SCRIPT).toContain("var hasApps = data.apps.initiatives.length > 0;");
    expect(ESTIMATE_SCRIPT).toContain('if (kind === "app" && !hasApps)');
    expect(ESTIMATE_SCRIPT).toContain("firstNonAppKind()");
  });
});

describe("homepage", () => {
  const entries = [buildReportEntry("2026/10/07", "T", "S", { commits: 1, prs: 1, reviews: 0 })];
  for (const theme of AVAILABLE_THEMES as Theme[]) {
    it(`no longer embeds the calculator in the ${theme} theme`, () => {
      const html = renderIndexPage(entries, { username: "u" }, "en", undefined, undefined, undefined, theme,
        { hasEstimatePage: true });
      expect(html).not.toContain("How long would it take?");
      expect(html).not.toContain("data-est-root");
      expect(() => assertNoSecretsInHtml(html)).not.toThrow();
    });
  }
});
