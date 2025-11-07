#!/usr/bin/env bash
set -euo pipefail

PORT=${PORT:-5000}

if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null; then
  echo "OK"
  exit 0
else
  echo "FAIL"
  exit 1
fi

