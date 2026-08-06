# Setup

Concise guide for running Worklog privately.

## 1. Configure

```bash
cp config.example.yaml config.yaml
# edit username, timezone, and repositories
```

## 2. Secrets (environment only)

```bash
export GITHUB_TOKEN=ghp_...   # or GH_PAT — needs access to listed private repos
export GITHUB_USERNAME=you
# optional LLM:
# export LLM_PROVIDER=openrouter
# export OPENROUTER_API_KEY=...
# export LLM_MODEL=...
```

Never put tokens in `config.yaml` or commit them. Generated HTML is scanned so secret values are not published.

## 3. Local report

```bash
bun install
bun run build
bun run report
```

HTML lands in `output/` (latest week under `output/YYYY/Wxx/`). Archives accumulate week by week.

To preview in a browser with live re-render when themes or data change:

```bash
bun run preview
# → http://127.0.0.1:4173
```

Flags: `--no-open`, `--no-watch`, `--port 3000`.

## 4. GitHub Actions

1. Push this repo (private recommended).
2. Add secret `GH_PAT` (same scopes as local token).
3. Set variables: `GITHUB_USERNAME`, `TIMEZONE` (e.g. `America/New_York`), optional `BASE_URL`, `LLM_*`.
4. Commit a `config.yaml` **without secrets** (repos list is fine).
5. Enable Pages from the `gh-pages` branch (or your host of choice for `output/`).

Workflows:

- **Daily Fetch** — midnight local (adjust cron)
- **Weekly Report** — Thursday morning — previous Thu through Wed

## 5. Manual backfill

```bash
bun dist/cli/index.js report --date 2026-04-09
```

`--date` is any day in/after the week you want; the tool resolves the previous completed Thu–Wed window.

### Refresh AI review metrics (Codex / Cursor)

Activity chips for AI reviews come from GitHub PR review data in configured repos:

| Chip piece | Meaning |
|---|---|
| **comments** | Root review comments by Codex/Cursor in the work week (≈ findings) |
| **PRs** | Distinct PRs those bots reviewed/commented on |
| **fixed** | Threads where you replied starting with `Fixed` / `Fixed in` / `Addressed` |

This is **not** the same as Codex Analytics “Issues found” / “PRs reviewed” (product dashboard, often a rolling 7D window across a broader scope).

To refresh a week after fixing collection logic:

```bash
export GITHUB_TOKEN=ghp_...   # or GH_PAT — must reach private repos in config.yaml
bun dist/cli/index.js weekly-fetch --date 2026-07-29
bun dist/cli/index.js generate --date 2026-07-29
bun dist/cli/index.js render --date 2026-07-29
```

Without a token, older YAML may only have **fixed** counts (from stored Fixed/Addressed replies).
