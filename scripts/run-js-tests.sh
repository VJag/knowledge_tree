#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE="${NODE:-node}"
if ! command -v "$NODE" >/dev/null 2>&1; then
  echo "node is required to run JavaScript tests" >&2
  exit 1
fi

# Homebrew Node 21 may need icu4c 74 when opt/icu4c points at a newer major.
if [[ "$(uname -s)" == "Darwin" ]]; then
  for icu in /opt/homebrew/Cellar/icu4c/74.*/lib /opt/homebrew/Cellar/icu4c@74/*/lib; do
    if [[ -d "$icu" ]]; then
      export DYLD_LIBRARY_PATH="${icu}${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
      break
    fi
  done
fi

ARGS=(--test web/tests/*.test.js)
if [[ "${1:-}" == "--watch" ]]; then
  ARGS=(--test --watch web/tests/*.test.js)
fi

exec "$NODE" "${ARGS[@]}"
