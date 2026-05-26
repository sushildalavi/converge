#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose down -v --remove-orphans
docker compose up --build -d
python3 tests/benchmark_chaos.py
