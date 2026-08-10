# Agent guide for Worklog (fork of deariary/github-weekly-reporter)

## Purpose

Private, self-hosted daily GitHub status-page generator. Reports the **previous completed workday** every weekday morning. Supports configured private repos, commit messages, PRs (opened/merged/in progress), reviews, review comments, line changes, estimated hours (labeled as estimates), and plain-English stakeholder summaries.

## Layout

- `src/cli/` — CLI (`daily-fetch`, `generate`, `render`, `deploy`, `report`, `preview`, `setup`)
- `src/collector/` — GitHub API collection + hours estimate + stakeholder summary + AI review activity (Codex/Cursor comments, PRs, Fixed/Addressed)
- `src/config.ts` — YAML config + env overrides (secrets never from HTML)
- `src/llm/` — optional LLM narratives (fallback summary if unset)
- `src/renderer/` — Handlebars themes + activity detail partial
- `config.example.yaml` — sample configuration
- `.github/workflows/` — daily report generation and deployment

## Commands

```bash
bun run build && bun run lint && bun run test
bun run report   # local: daily-fetch → generate → render
```
## Rules

- Reports cover one completed local workday. The Actions cron runs Monday–Friday; Monday reports Friday.
- `GITHUB_TOKEN` / `GH_PAT` required for private repo access. Never embed secrets in config committed to git or in generated HTML (`assertNoSecretsInHtml`).
- LLM is optional; stakeholder fallback always works.
- Prefer extending upstream collectors/renderer over rewriting.
