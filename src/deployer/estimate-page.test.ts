import { describe, it, expect } from "vitest";
import { renderEstimatePage, buildEstimateKindScript } from "./estimate-page.js";
import { AVAILABLE_THEMES } from "../renderer/themes/index.js";
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

describe("renderEstimatePage", () => {
  it("returns undefined without enough history", () => {
    expect(renderEstimatePage(undefined)).toBeUndefined();
    expect(renderEstimatePage(calibration("Hub", 3))).toBeUndefined();
  });

  for (const theme of AVAILABLE_THEMES as Theme[]) {
    it(`renders the standalone page in the ${theme} theme`, () => {
      const html = renderEstimatePage(calibration("</script><b>x"), {
        username: "u", themeName: theme, baseUrl: "https://example.com",
      })!;
      expect(html).toContain('href="../"');
      expect(html).toContain("Back to the worklog");
      expect(html.match(/How long would it take\?/g)?.length).toBeGreaterThanOrEqual(1);
      expect(html.match(/<h1[^>]*>How long would it take\?<\/h1>/g)).toHaveLength(1);
      expect(html).not.toContain('id="est-title"');
      for (const label of ["A new app or product", "A new feature", "A change to something that exists", "A bug fix"]) {
        expect(html).toContain(label);
      }
      expect(html).toContain("data-est-root");
      expect(html).toContain('name="kind" id="est-kind"');
      expect(html).toContain("URLSearchParams");
      expect(html).toContain("replaceState");
      expect(html).toContain("What this doesn&#x27;t include".replace("&#x27;", "'"));
      expect(html).not.toContain("</script><b>x");
      expect(html).not.toMatch(/src="assets\//);
      expect(() => assertNoSecretsInHtml(html)).not.toThrow();
    });
  }

  it("maps ?kind values to calculator options", () => {
    const script = buildEstimateKindScript();
    expect(script).toContain('"bug":"bug-fix"');
    expect(script).toContain('"app":"app"');
  });
});
