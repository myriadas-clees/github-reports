import { describe, it, expect } from "vitest";
import { renderFinishedPage, FINISHED_BODY } from "./finished-page.js";
import { AVAILABLE_THEMES } from "../renderer/themes/index.js";
import { assertNoSecretsInHtml } from "../config.js";
import type { Theme } from "../types.js";

const TERMS = ["DoD", "AC", "PR", "Ready to release", "Merged (our team's word)", "Code integrated", "In testing", "Live"];

describe("renderFinishedPage", () => {
  for (const theme of AVAILABLE_THEMES as Theme[]) {
    it(`renders the explainer with its key and sections in the ${theme} theme`, () => {
      const html = renderFinishedPage({ username: "u", themeName: theme, baseUrl: "https://example.com" });
      expect(html.match(/<h1[^>]*>How we say something is finished<\/h1>/g), theme).toHaveLength(1);
      for (const term of TERMS) expect(html, theme).toContain(term);
      expect(html, theme).toContain("<dl>");
      expect(html, theme).toContain('<abbr title="Definition of Done">DoD</abbr>');
      expect(html, theme).toContain("Built the right way, and what we asked for");
      expect(html, theme).toContain("Where the change is now");
      expect(html, theme).toContain("What this site can and can't see");
      expect(html, theme).toContain("Issues and projects");
      expect(html, theme).toContain('href="../"');
      expect(html, theme).toContain('class="fin-page"');
      expect(html, theme).toContain('og:url" content="https://example.com/finished/"');
      expect(() => assertNoSecretsInHtml(html), theme).not.toThrow();
    });
  }

  it("keeps out the wording and labels that were ruled out", () => {
    for (const theme of AVAILABLE_THEMES as Theme[]) {
      const html = renderFinishedPage({ themeName: theme });
      expect(html, theme).not.toContain("Technical Analyst");
      expect(html, theme).not.toContain("PR Ready");
      expect(html, theme).not.toContain(">Ready<");
    }
  });

  it("has no percentage progress text in the page body", () => {
    const html = renderFinishedPage({});
    const main = html.slice(html.indexOf('<main class="fin-page">'), html.indexOf("</main>"));
    expect(main).not.toMatch(/\d\s*%/);
    expect(FINISHED_BODY).not.toMatch(/\d\s*%/);
  });

  it("uses theme tokens, not hard-coded page colors, and stacks the Venn on narrow screens", () => {
    const brutalist = renderFinishedPage({ themeName: "brutalist" });
    expect(brutalist).toContain("var(--b-text)");
    expect(brutalist).toContain("var(--b-accent)");
    expect(renderFinishedPage({ themeName: "swiss" })).toContain("var(--s-text)");
    expect(brutalist).toMatch(/@media \(max-width: 720px\)[\s\S]*\.fin-venn-stage \{ height: auto/);
    expect(brutalist).toContain("theme-toggle");
  });

  it("makes no external requests from its own markup", () => {
    const html = renderFinishedPage({ themeName: "minimal" });
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
  });
});
