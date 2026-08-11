#!/usr/bin/env bash
# Generate preview site: theme x lang combinations from example/ data
set -euo pipefail

THEMES="brutalist minimal editorial swiss"
LANGS="en ja"
BASE_URL="${BASE_URL:-https://myriadas-clees.github.io/github-weekly-reporter}"
OUT_DIR="${OUT_DIR:-preview-site}"
# The checked-in preview fixture is the legacy weekly report at 2026/W14.
# 2026-04-09 resolves to that completed Thu-Wed work week.
DATE="${DATE:-2026-04-09}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

for theme in $THEMES; do
  for lang in $LANGS; do
    # Use lang-specific data directory if it exists, otherwise default
    if [ -d "example/$lang" ]; then
      data_dir="example/$lang"
    else
      data_dir="example"
    fi

    dir="$OUT_DIR/$theme/$lang"
    echo "Generating $theme / $lang (data: $data_dir) ..."
    bun dist/cli/index.js render \
      --mode weekly \
      --data-dir "$data_dir" \
      --output-dir "$dir" \
      --base-url "$BASE_URL/$theme/$lang" \
      --theme "$theme" \
      --language "$lang" \
      --date "$DATE" \
      --site-title "Preview ($theme / $lang)"
  done
done

# Copy theme screenshots for LP
cp -r scripts/screenshots "$OUT_DIR/screenshots"

# Copy card SVGs for LP and README
cp scripts/screenshots/card.svg scripts/screenshots/card-dark.svg "$OUT_DIR/screenshots/"

# Generate top-level index
bun scripts/generate-preview-index.js "$OUT_DIR" "$BASE_URL" "$THEMES" "$LANGS"

echo "Preview site generated at $OUT_DIR/"
