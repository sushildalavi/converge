#!/usr/bin/env bash
# Postgres backup script — pg_dump to a timestamped file.
# Usage: ./scripts/backup-db.sh [output_dir]
set -euo pipefail

OUT_DIR="${1:-./backups}"
TS=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$OUT_DIR/converge-$TS.sql.gz"

mkdir -p "$OUT_DIR"

echo "→ dumping postgres → $FILE"
docker compose exec -T postgres \
  pg_dump -U converge -d converge --no-owner --no-acl --clean --if-exists \
  | gzip > "$FILE"

SIZE=$(du -h "$FILE" | awk '{print $1}')
echo "✓ backup complete: $FILE ($SIZE)"
