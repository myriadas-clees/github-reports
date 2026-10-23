# Worklog (fork of deariary/github-weekly-reporter)

Private weekly GitHub status-page generator. Work week is **Thu–Wed** (Actions cron Thursday morning).

## Layout

- `src/cli/` — CLI entrypoints
- `src/collector/` — GitHub API + hours estimate + stakeholder summary + AI review activity
- `src/config.ts` — YAML + env (secrets never from HTML)
- `src/collector/allocation.ts` — effort allocation by initiative / work type, computed at render time from stored data
- `src/llm/` — optional LLM narratives
- `src/renderer/` — Handlebars themes
- `config.example.yaml`, `.github/workflows/`

## Commands

```bash
bun run build && bun run lint && bun run test
bun run report   # weekly-fetch → generate → render
```

## Rules

- Not ISO Mon–Sun. `GITHUB_TOKEN` / `GH_PAT` for private repos. Never embed secrets in committed config or generated HTML (`assertNoSecretsInHtml`).
- LLM optional; stakeholder fallback always works. Prefer extending upstream collectors/renderer over rewriting.

## UI Guidance

- For UI work, follow [GUI.md](GUI.md) and use `graphical-ui`, `graphical-convert`, or `graphical-audit` as appropriate.
- This is a Bun + Handlebars static HTML generator, not the source monorepo. Adapt design guidance to `src/renderer/themes/` and its existing HTML/CSS conventions. Do not import Next.js, Azure, Tailwind, or source-monorepo package infrastructure.
- Read `gui/source/graphical-theme.css` and `gui/source/styles.css` as current Myriad theme references; `gui/themes/` is a generated snapshot. Preserve the source's warm neutral dark mode and monotone actions/focus/progress when using those theme references. These files are references, not Worklog runtime imports.
