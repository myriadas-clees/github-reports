# Worklog

Private, self-hosted weekly GitHub status-page generator. Forked from [deariary/github-weekly-reporter](https://github.com/deariary/github-weekly-reporter) and extended for private repositories and Thursday–Wednesday reporting.

Every **Thursday morning**, Worklog reports activity from the **previous Thursday through Wednesday**: commits, pull requests (opened / merged / in progress), reviews, review comments, repositories, line changes, and **estimated hours** (clearly labeled as estimates). It publishes a clean static HTML report with weekly archives.

## Quick setup

See [`docs/setup.md`](docs/setup.md) for the full checklist. Short version:

1. Copy the sample config and edit it:

```bash
cp config.example.yaml config.yaml
```

2. Create a fine-grained or classic PAT with access to the private repos you list (`repo` scope / Contents + Pull requests + Metadata).

3. Export secrets as environment variables (never put them in `config.yaml` or generated HTML):

```bash
export GITHUB_TOKEN=ghp_...
export GITHUB_USERNAME=your-user
# optional LLM for richer narrative:
# export LLM_PROVIDER=openrouter
# export OPENROUTER_API_KEY=...
# export LLM_MODEL=...
```

4. Install and build:

```bash
bun install
bun run build
```

5. Generate a report locally:

```bash
bun run report
# or:
bun dist/cli/index.js report --config ./config.yaml
```

HTML lands in `output/` (latest week under `output/YYYY/Wxx/`). Archives accumulate week by week.

## Configuration

See [`config.example.yaml`](config.example.yaml). Important fields:

| Field | Purpose |
|-------|---------|
| `username` | GitHub user to report on |
| `repositories` | Private/public repos to include (empty = discover from activity) |
| `timezone` | IANA timezone for Thu–Wed window |
| `session_gap_minutes` / `max_session_hours` | Hours-estimate clustering |

Environment overrides: `GITHUB_TOKEN` / `GH_PAT`, `GITHUB_USERNAME`, `TIMEZONE`, `LANGUAGE`, `THEME`, `DATA_DIR`, `OUTPUT_DIR`, `REPOSITORIES` (comma-separated), `LLM_*`.

## GitHub Actions

Workflows in `.github/workflows/`:

- **Daily Fetch** — accumulates yesterday’s events (including private ones the PAT can see)
- **Weekly Report** — runs Thursday morning: fetch → summarize → render → deploy to Pages

Required repository secret: `GH_PAT`. Optional: LLM provider secrets. Repository variables: `GITHUB_USERNAME`, `TIMEZONE`, `BASE_URL`, etc.

## CLI

```bash
worklog daily-fetch
worklog weekly-fetch
worklog generate          # LLM if configured, else stakeholder fallback
worklog render
worklog deploy
worklog report            # weekly-fetch + generate + render
worklog preview           # local server for output/ (watch + re-render)
```

## What the report includes

- Plain-English **stakeholder summary**
- Commit messages (linked)
- PRs opened, merged, and still in progress (linked)
- Code reviews and review comments (linked)
- Repositories / projects worked on
- Lines added / deleted
- **Estimated hours** from activity timestamps (labeled as estimates)
- Archived weekly static HTML (existing themes, OG images, index)

## Security

Tokens and API keys are read only from the environment / Actions secrets. Render refuses to write HTML if a configured secret value would appear in the output.

## Development

```bash
bun run build && bun run lint && bun run test
```

Local preview of the generated site (serves `output/`, re-renders when themes or data change):

```bash
bun run build
bun run report          # once, to populate data + output
bun run preview         # http://127.0.0.1:4173 — use --no-open / --no-watch as needed
```

For theme TypeScript (`styles.ts`) changes, run `bun run dev` (`tsc --watch`) in another terminal so re-renders pick up compiled CSS.

Upstream documentation for themes and LLM providers remains useful under `docs/`.
