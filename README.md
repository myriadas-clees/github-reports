# Worklog

Daily GitHub status-page generator with private source and a public progress page. Forked from [deariary/github-weekly-reporter](https://github.com/deariary/github-weekly-reporter) and extended to read activity from private repositories while keeping their source code and credentials private.

> Reports published to GitHub Pages are public and may include commit messages, pull-request titles, review activity, and line-change totals. Repository file contents and tokens are never included.

Every weekday morning, Worklog reports activity from the **previous completed workday** (Monday reports Friday): commits, pull requests (opened / merged / in progress), reviews, review comments, repositories, line changes, and **estimated manual engineering effort**. This models the time one engineer might need to deliver the same changes without AI assistance. It is an intended comparison baseline, not actual hours worked or measured time saved, and has not been validated against recorded unassisted work. It publishes a clean static HTML report with daily archives.

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

HTML lands in `output/` (daily reports under `output/YYYY/MM/DD/`).

## Configuration

See [`config.example.yaml`](config.example.yaml). Important fields:

| Field | Purpose |
|-------|---------|
| `username` | GitHub user to report on |
| `repositories` | Private/public repos to include (empty = discover from activity) |
| `timezone` | IANA timezone used to determine calendar-day boundaries |
| `session_gap_minutes` / `max_session_hours` | Hours-estimate clustering |

Environment overrides: `GITHUB_TOKEN` / `GH_PAT`, `GITHUB_USERNAME`, `TIMEZONE`, `LANGUAGE`, `THEME`, `DATA_DIR`, `OUTPUT_DIR`, `REPOSITORIES` (comma-separated), `LLM_*`.

## GitHub Actions

Workflows in `.github/workflows/`:

- **Daily Report** — runs Monday–Friday: fetch previous workday → summarize → render → deploy to Pages

Required repository secret: `GH_PAT`. Optional: LLM provider secrets. Repository variables: `GITHUB_USERNAME`, `TIMEZONE`, `BASE_URL`, etc.

## CLI

```bash
worklog daily-fetch
worklog generate          # LLM if configured, else stakeholder fallback
worklog render
worklog render --archive  # complete daily archive; shared pages generated once
worklog deploy
worklog report            # daily-fetch + generate + render
worklog preview           # local server for output/ (watch + re-render)
```

## What the report includes

- Plain-English **stakeholder summary**
- Commit messages (linked)
- PRs opened, merged, and still in progress (linked)
- Code reviews and review comments (linked)
- Repositories / projects worked on
- Lines added / deleted
- **Estimated engineering hours** from delivered scope and GitHub activity (not tracked, elapsed, or billed time)
- Archived daily static HTML (existing themes, OG images, index)

## Security

Tokens and API keys are read only from the environment / Actions secrets. Render refuses to write HTML if a configured secret value would appear in the output.

## Development

```bash
bun run build && bun run lint && bun run test
```

`build` uses the same pinned Rust-based `tsrs` compiler as Myriad Apps, including type checking, JavaScript, declarations and source maps. `bun run typecheck` checks without emitting. TypeScript remains installed for ESLint/editor integration and `dev` watch mode. The pinned native compiler supports Apple Silicon macOS and Linux x64/arm64; use `bun run build:tsc` for the previous compiler path on unsupported hosts.

CI workflows share `.github/actions/setup-bun`, which pins Bun and caches package downloads by OS, architecture and lockfile. The existing `lint`/`test` check names and coverage stay intact; superseded CI runs are cancelled, while Pages deployments remain serialized.

Daily, backfill and archive deployment use `render --archive`: report inputs and evidence are loaded once, every dated HTML/OG page is emitted, and shared week pages, assets, index, cards, planning pages, RSS and sitemap are generated once. A missing report input fails the build; old reports are never omitted to save time. Local comparisons on 90 reports took 131.4s before and 6.7–13.0s after, with all 226 output files byte-identical; the 13.0s run overlapped the full test suite. These are local timings, not a measured post-change Actions run; API/LLM collection and Pages deployment time are unaffected.

The default theme (config key `brutalist`, kept for compatibility) is the Myriad Apps Graphical theme. Its tokens live in `src/renderer/themes/brutalist/tokens.ts`, copied from `gui/source/graphical-theme.css`; component rules in `styles.ts` consume those names only. It has warm neutral surfaces in light and dark (light by default, then the OS setting, then the reader's Light/Dark choice), a neutral top bar, and monotone actions, focus and progress. Brand red appears only in the logo mark and one short rule on the homepage. Positive statuses stay green, and the initiative chart colours are unchanged.

Roboto and Lora are self-hosted (SIL OFL 1.1, licences in `assets/fonts/`). `render` copies them to `<output>/assets/fonts/`, so the theme makes no Google Fonts requests. Non-Latin locales keep their script font after Roboto but only use it when it is installed locally. Design QA evidence is in `design-qa.md`.

Local preview of the generated site (serves `output/`, re-renders when themes or data change):

```bash
bun run build
bun run report          # once, to populate data + output
bun run preview         # http://127.0.0.1:4173 — use --no-open / --no-watch as needed
```

For theme TypeScript (`styles.ts`) changes, run `bun run dev` (`tsc --watch`) in another terminal so re-renders pick up compiled CSS.

Upstream documentation for themes and LLM providers remains useful under `docs/`.
