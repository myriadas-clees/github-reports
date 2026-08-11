# Worklog (fork of deariary/github-weekly-reporter)

Private weekly GitHub status-page generator. Work week is **Thu–Wed** (Actions cron Thursday morning).

## Layout

- `src/cli/` — CLI entrypoints
- `src/collector/` — GitHub API + hours estimate + stakeholder summary + AI review activity
- `src/config.ts` — YAML + env (secrets never from HTML)
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
