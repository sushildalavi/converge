#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Redis Group =="
docker compose exec -T redis redis-cli XINFO GROUPS events:incoming
docker compose exec -T redis redis-cli XINFO GROUPS events:retry

echo "\n== Redis Pending =="
docker compose exec -T redis redis-cli XPENDING events:incoming converge-workers
docker compose exec -T redis redis-cli XPENDING events:retry converge-workers

echo "\n== Postgres Status Counts =="
docker compose exec -T postgres psql -U converge_cp -d converge -c "SELECT status, COUNT(*) FROM event_idempotency_registry GROUP BY status ORDER BY status;"
