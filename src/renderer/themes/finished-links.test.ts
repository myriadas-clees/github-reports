import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INDEX_PLANNING_PARTIAL } from "./index-home.js";

const here = dirname(fileURLToPath(import.meta.url));
const THEMES = ["brutalist", "editorial", "minimal", "swiss"];

describe("links to the finished explainer page", () => {
  it("is linked from the homepage planning section, outside the calculator condition", () => {
    const afterCalculator = INDEX_PLANNING_PARTIAL.slice(INDEX_PLANNING_PARTIAL.lastIndexOf("{{/if}}"));
    expect(afterCalculator).toContain('href="finished/"');
  });

  for (const theme of THEMES) {
    it(`is linked from the checks block and the calculator exclusions in the ${theme} theme`, () => {
      const panel = readFileSync(join(here, theme, "templates/partials/allocation-panel.hbs"), "utf-8");
      expect(panel).toContain('href="{{@root.rootPrefix}}finished/"');
      const estimate = readFileSync(join(here, theme, "templates/estimate-page.hbs"), "utf-8");
      expect(estimate).toContain('href="../finished/"');
      expect(estimate).toContain("Definition of Done");
    });
  }
});
