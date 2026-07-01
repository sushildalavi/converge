#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== ReplayForge smoke test ==="

echo "→ restarting stack clean..."
docker compose down -v
docker compose up -d postgres redis
sleep 8
docker compose up -d backend worker
sleep 8

echo "→ health check..."
BASE_URL="${REPLAYFORGE_BASE_URL:-http://127.0.0.1:18000}"

curl -fsS "$BASE_URL/health" | grep '"ok"'

echo "→ generating workload (20 workflows)..."
curl -fsS -X POST "$BASE_URL/api/demo/generate-workload?count=20" | python3 -m json.tool

echo "→ waiting for retries to cycle (120s max)..."
SECONDS=0
while true; do
  IN_FLIGHT=$(curl -s "$BASE_URL/api/metrics" | python3 -c \
    'import sys,json; d=json.load(sys.stdin); print(d["queued"]+d["processing"])' 2>/dev/null || echo "999")
  if [ "$IN_FLIGHT" -lt 3 ] 2>/dev/null; then
    break
  fi
  if [ $SECONDS -gt 120 ]; then
    echo "WARNING: events still in flight after 120s, proceeding"
    break
  fi
  sleep 5
done

echo "→ metrics after processing..."
curl -fsS "$BASE_URL/api/metrics" | python3 -m json.tool

echo "→ checking for dead letters..."
DLQ_COUNT=$(curl -s "$BASE_URL/api/deadletters" | python3 -c \
  'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo "0")
echo "   dead letters: $DLQ_COUNT"

if [ "$DLQ_COUNT" -gt 0 ]; then
  echo "→ replaying first dead letter..."
  DLQ_ID=$(curl -s "$BASE_URL/api/deadletters" | python3 -c \
    'import sys,json; items=json.load(sys.stdin); print(items[0]["id"] if items else "")' 2>/dev/null)
  if [ -n "$DLQ_ID" ]; then
    curl -fsS -X POST "$BASE_URL/api/deadletters/$DLQ_ID/replay" | python3 -c \
      'import sys,json; d=json.load(sys.stdin); print(f"replayed → status: {d[\"status\"]}")'
  fi
fi

echo "→ running unit tests..."
docker compose exec -T backend pytest app/tests/ -q

echo "=== smoke test passed ==="
