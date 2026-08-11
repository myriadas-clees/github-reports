#!/usr/bin/env bash
# Render every stored daily report into one complete Pages artifact.
set -euo pipefail

DATA_DIR="${DATA_DIR:-./data}"

found_report=false
while IFS= read -r report_file; do
  found_report=true
  relative_path="${report_file#"$DATA_DIR"/}"
  report_path="${relative_path%/github-data.yaml}"
  if [[ ! "$report_path" =~ ^[0-9]{4}/[0-9]{2}/[0-9]{2}$ ]]; then
    continue
  fi
  report_date="${report_path//\//-}"
  echo "Rendering archived report $report_date"
  bun dist/cli/index.js render --date "$report_date"
done < <(find "$DATA_DIR" -mindepth 4 -maxdepth 4 -type f -name github-data.yaml | sort)

if [ "$found_report" = false ]; then
  echo "No daily reports found in $DATA_DIR" >&2
  exit 1
fi
