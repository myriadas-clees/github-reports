#!/usr/bin/env bash
# Render every stored daily report into one complete Pages artifact.
set -euo pipefail

DATA_DIR="${DATA_DIR:-./data}"

bun dist/cli/index.js render --archive --data-dir "$DATA_DIR"
