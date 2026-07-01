# Converge — Operations Runbook

Quick reference for running Converge in development and production.

---

## Local development

```bash
docker compose up -d                          # everything (3 workers)
docker compose ps
docker compose logs -f worker                 # tail all worker replicas
docker compose logs -f backend
```

Open **http://localhost:5173** for the dashboard.
The API listens on **http://127.0.0.1:18000** when started via compose.

---

## Scaling workers

The worker service is **horizontally scalable** out of the box. Each replica
auto-derives a unique name from its container hostname (`worker-<hostname>`),
so they all join the same Redis Streams consumer group and split work.

### Set replica count
```bash
# Edit docker-compose.yml → services.worker.deploy.replicas
docker compose up -d --scale worker=5
```

### Verify
```bash
curl -s http://127.0.0.1:18000/api/workers | jq '.[] | {name: .worker_name, status, hb: .last_heartbeat_at}'
```

You should see N rows, one per replica, all heartbeating.

---

## Health probes

| Endpoint | Use | Behavior |
|----------|-----|----------|
| `GET /health/live` | Liveness — orchestrator restart decision | Always 200 if process up |
| `GET /health/ready` | Readiness — load balancer routing | 200 if Postgres + Redis reachable, else 503 with detail |
| `GET /health` | Legacy alias for `/health/live` | 200 |

### Example
```bash
curl -s http://127.0.0.1:18000/health/ready | jq
curl -s http://127.0.0.1:18000/health/backend | jq
curl -s http://127.0.0.1:18000/health/backend/stats | jq
```

```json
{
  "status": "ok",
  "checks": {
    "postgres": {"status": "ok", "latency_ms": 1.2},
    "redis":    {"status": "ok", "latency_ms": 0.8}
  },
  "env": "development"
}
```

---

## Production deployment

```bash
# Apply the prod overlay (more replicas, higher resource limits, nginx serving frontend)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Inspect computed config
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

**What changes in prod:**
- `ENVIRONMENT=production` (disables `/docs` and `/redoc`)
- Frontend served via nginx static (no Vite dev server)
- 2 backend replicas, 5 worker replicas
- Higher CPU/memory limits
- JSON-structured logs

For real cloud deploys, point `DATABASE_URL`/`REDIS_URL` at managed services
(Neon, RDS, Upstash, ElastiCache) and run only `backend` + `worker` containers.

---

## Backup / restore

### Backup (gzipped pg_dump)
```bash
./scripts/backup-db.sh                  # → ./backups/replayforge-<UTC>.sql.gz
./scripts/backup-db.sh /tmp/dumps       # custom dir
```

### Restore
```bash
./scripts/restore-db.sh ./backups/replayforge-20260505T100000Z.sql.gz
```

> **Production:** schedule `backup-db.sh` via cron / GitHub Actions / Cloud
> Scheduler. Off-site copies → S3/GCS via lifecycle policies.

---

## Observability

### Structured JSON logs
With `LOG_FORMAT=json`, every log line is one JSON object with:
- `ts`, `level`, `logger`, `message`
- `request_id` (correlation ID set per HTTP request)
- `service`, `env`, `worker` (when applicable)
- Any structured `extra=` fields from the application

```bash
docker compose logs backend | jq 'select(.level=="ERROR")'
docker compose logs backend | jq 'select(.path=="/api/events")' | head
```

### Request correlation
Every HTTP response includes `X-Request-ID` and `X-Response-Time-Ms`.
Pass `X-Request-ID` from clients to trace requests end-to-end.

### Forwarding to a log aggregator
Pipe stdout via your container runtime to:
- **Datadog** (`docker logs` driver)
- **Loki / Grafana** (Promtail)
- **Cloud Logging / CloudWatch** (managed)

---

## Common runbook entries

### "Backend `/health/ready` returns 503"
```bash
docker compose logs backend | jq 'select(.message | startswith("http request"))' | tail -5
docker compose exec postgres pg_isready
docker compose exec redis redis-cli ping
```
Restart the failing dep, or fail over to a replica.

### "Workers all crashed"
```bash
docker compose ps worker
docker compose logs worker --tail=50 | jq 'select(.level=="ERROR")'
docker compose restart worker
```
Each worker auto-reclaims orphaned PEL entries via `XAUTOCLAIM` on startup,
so up to 60s of in-flight work will be re-processed.

### "Dead letter queue growing"
```bash
curl -s http://127.0.0.1:18000/api/deadletters | jq 'length'
curl -s http://127.0.0.1:18000/api/insights/errors | jq
```
Investigate top error types. Replay one at a time:
```bash
DLQ_ID=$(curl -s http://127.0.0.1:18000/api/deadletters | jq -r '.[0].id')
curl -X POST http://127.0.0.1:18000/api/deadletters/$DLQ_ID/replay
```

### "Stream backlog growing (events queued not draining)"
```bash
docker compose exec redis redis-cli XLEN events:incoming
docker compose exec redis redis-cli XINFO GROUPS events:incoming
```
- Scale workers: `docker compose up -d --scale worker=N`
- Check workers are alive: `curl http://127.0.0.1:18000/api/workers`
- Check `XAUTOCLAIM` isn't stuck on a poison message

---

## Tunable configuration (env vars)

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAX_ATTEMPTS` | 4 | Retries before dead-letter |
| `WORKER_HEARTBEAT_INTERVAL` | 5s | Heartbeat write cadence |
| `WORKER_STALE_THRESHOLD` | 30s | Stale detection window |
| `WORKER_XREADGROUP_BLOCK_MS` | 5000 | XREADGROUP wait time |
| `WORKER_XREADGROUP_COUNT` | 10 | Messages per batch |
| `DB_POOL_SIZE` | 5 | SQLAlchemy pool size |
| `DB_MAX_OVERFLOW` | 10 | Pool overflow |
| `DB_POOL_RECYCLE` | 300 | Connection recycle (Neon-friendly) |
| `LOG_FORMAT` | json | `json` or `text` |
| `ENVIRONMENT` | development | `production` disables `/docs` |

## Event lifecycle

1. API persists the event and publishes it to `events:incoming`.
2. Go workers claim the event row in PostgreSQL before acknowledging the stream entry.
3. On success, the event is marked `succeeded` and replay latency is captured.
4. On retryable failure, the worker records the attempt, updates `retrying`, and schedules the next delivery in Redis.
5. On poison or exhausted attempts, the worker writes a dead-letter record and emits a DLQ stream entry.
6. The replay endpoint can move a dead-lettered event back into the live stream.

## Reliability model

- Delivery is at-least-once.
- Correctness comes from idempotent state transitions and claim locking.
- Redis pending-entry recovery handles worker crashes and disconnects.
- Database writes happen before stream acknowledgements.
