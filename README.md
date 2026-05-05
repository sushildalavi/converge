# ReplayForge

**Async Workflow Replay & Failure Debugging Platform**

A production-grade developer platform that ingests workflow events from applications, processes them through Redis Streams consumer groups, tracks retries with exponential backoff, moves exhausted events to a dead-letter queue, and provides a live dashboard for inspecting workflow timelines and replaying failed events.

> ReplayForge uses AI only for incident summary generation. Retry behavior, replay semantics, and failure classification are **deterministic and testable**.

---

## Screenshots

### Dashboard — Live Metrics & Activity Feed
![Dashboard](docs/screenshots/dashboard.png)

### Workflow Detail — Event Timeline with Retry History
![Workflow Detail](docs/screenshots/workflow-detail.png)

### Workflow Timeline — Expanded Attempt Log
![Workflow Timeline](docs/screenshots/workflow-timeline-expanded.png)

### Command Palette — ⌘K Quick Navigation
![Command Palette](docs/screenshots/command-palette.png)

### Dead Letter Queue — Review & Replay Failures
![Dead Letters](docs/screenshots/dead-letters.png)

### Worker Health — Heartbeat Monitor
![Workers](docs/screenshots/workers.png)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Demo Checkout Simulator                           │
│   5-step workflow: started → payment → inventory → email → ship     │
│   Failure rates: payment 15% · inventory 10% · email 25%           │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ POST /api/events (idempotent)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FastAPI Ingestion API                             │
│                                                                      │
│  ① Validate payload                                                  │
│  ② Resolve or create Application by name                            │
│  ③ Check UNIQUE(application_id, idempotency_key)                    │
│     • Duplicate → return existing event, duplicate=true             │
│     • New → INSERT event (status: received)                         │
│  ④ XADD events:incoming  (MAXLEN ~ 100,000)                         │
│  ⑤ Set status: queued                                               │
│  ⑥ Return event_id                                                  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Redis Streams        │
              │  events:incoming      │
              │  events:retry         │
              │  events:deadletter    │
              └──────────┬────────────┘
                         │ XREADGROUP (consumer group: replayforge-workers)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Worker Process                                    │
│                                                                      │
│  Three concurrent loops:                                            │
│  ┌─────────────────┐ ┌───────────────────┐ ┌──────────────────┐   │
│  │ XREADGROUP loop │ │ Retry Scheduler   │ │ Heartbeat Thread │   │
│  │                 │ │                   │ │                  │   │
│  │ Pick up events  │ │ ZRANGEBYSCORE     │ │ UPDATE workers   │   │
│  │ Process with    │ │ events:retry:zset │ │ SET status=active│   │
│  │ failure sim     │ │ every 1s          │ │ every 5s         │   │
│  │                 │ │ → XADD to stream  │ │                  │   │
│  └────────┬────────┘ └───────────────────┘ └──────────────────┘   │
│           │                                                          │
│  ┌────────▼─────────────────────────────────────────────────────┐  │
│  │                   Event Handler                               │  │
│  │                                                               │  │
│  │  SUCCESS path:                                               │  │
│  │    status → succeeded                                        │  │
│  │    INSERT event_attempt (status=succeeded, duration_ms)      │  │
│  │    XACK                                                      │  │
│  │                                                               │  │
│  │  FAILURE path:                                               │  │
│  │    attempt_count++                                           │  │
│  │    INSERT event_attempt (status=failed, error_message)       │  │
│  │    if attempt_count >= max_attempts:                         │  │
│  │      INSERT dead_letters                                     │  │
│  │      XADD events:deadletter                                  │  │
│  │      status → dead_lettered                                  │  │
│  │    else:                                                     │  │
│  │      ZADD events:retry:zset  score=run_at_unix_ts            │  │
│  │      status → retrying                                       │  │
│  │    XACK                                                      │  │
│  │                                                               │  │
│  │  CRASH path:                                                 │  │
│  │    Record attempt (prevents infinite crash loop)             │  │
│  │    status → crashed                                          │  │
│  │    sys.exit(1)  → compose restarts worker                   │  │
│  │    On restart: XAUTOCLAIM orphaned PEL entries               │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Event Store                            │
│                                                                      │
│  applications  events  event_attempts  dead_letters                 │
│  workers       incident_summaries                                    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FastAPI Dashboard API                             │
│                                                                      │
│  GET /api/workflows/{id}/timeline   ← event + attempt history       │
│  GET /api/deadletters               ← DLQ list                      │
│  POST /api/deadletters/{id}/replay  ← replay failed events          │
│  GET /api/metrics                   ← live counts + percentiles     │
│  GET /api/workers                   ← heartbeat status              │
│  POST /api/incidents/{id}/summarize ← AI summary (optional)         │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              React + Vite + Tailwind Dashboard                       │
│                                                                      │
│  • Live KPI metrics with animated counters + sparklines             │
│  • Event throughput chart (rate per 4s tick)                        │
│  • Real-time activity feed (2.5s polling)                           │
│  • Workflow timeline with retry history                             │
│  • One-click replay from DLQ                                        │
│  • Worker heartbeat monitor                                         │
│  • ⌘K command palette                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Event Lifecycle

```
                    ┌─────────┐
                    │RECEIVED │  ← event ingested
                    └────┬────┘
                         │ publish to Redis
                         ▼
                    ┌─────────┐
                    │ QUEUED  │  ← in events:incoming stream
                    └────┬────┘
                         │ worker picks up
                         ▼
                   ┌──────────┐
                   │PROCESSING│  ← worker processing
                   └─────┬────┘
              ┌──────────┴──────────┐
              │ success             │ failure
              ▼                     ▼
        ┌──────────┐          ┌────────┐
        │SUCCEEDED │          │ FAILED │
        └──────────┘          └───┬────┘
                                  │ attempt < max
                                  ▼
                            ┌──────────┐
                            │RETRYING  │  ← ZADD to zset
                            └─────┬────┘    (backoff: 0s/10s/30s/60s)
                                  │ scheduler fires
                                  ▼
                           ┌───────────┐
                           │PROCESSING │  ← picked up again
                           └─────┬─────┘
                                 │ still fails
                                 ▼  (attempt == max)
                         ┌──────────────┐
                         │DEAD_LETTERED │  ← inserted to dead_letters
                         └──────┬───────┘
                                │ operator clicks Replay
                                ▼
                          ┌──────────┐
                          │ REPLAYED │  ← re-queued with linked attempt
                          └─────┬────┘     idempotency key unchanged
                                │ worker re-processes
                                ▼
                      ┌────────────────┐
                      │ SUCCEEDED /    │
                      │ DEAD_LETTERED  │  ← full audit trail preserved
                      └────────────────┘
```

---

## Retry Policy

| Attempt | Delay      | Status     |
|---------|-----------|------------|
| 1st     | immediate  | processing |
| 2nd     | ~10s ±20% | retrying   |
| 3rd     | ~30s ±20% | retrying   |
| 4th     | ~60s ±20% | retrying   |
| 5th+    | —         | dead_lettered |

Configured via `MAX_ATTEMPTS` env var (default: 4).

---

## Redis Streams Design

```
Ingestion API
    │
    └─► XADD events:incoming (MAXLEN ~ 100k)
              │
              └─► Consumer Group: replayforge-workers
                        │
                        └─► Workers pull via XREADGROUP

On failure (not exhausted):
    Worker ─► ZADD events:retry:zset (score = run_at_unix_ts)
                        │
    Retry Scheduler ────┘ polls every 1s
    (in-process thread)     ZRANGEBYSCORE 0 now
                            → ZREM + XADD events:retry

On crash/orphan:
    New worker → XAUTOCLAIM events:incoming  (idle > 60s)
                  reclaims pending entries from crashed consumer
```

---

## Idempotency Strategy

Every event has a `UNIQUE(application_id, idempotency_key)` constraint in PostgreSQL.

```
POST /api/events
        │
        ├─ INSERT with ON CONFLICT DO NOTHING
        │
        ├─ Duplicate? → return existing event (duplicate=true, HTTP 201)
        │               no second XADD
        │
        └─ New?      → INSERT, XADD, return (duplicate=false, HTTP 201)
```

Safe to retry `POST /api/events` from producers — exactly-once semantics at the DB layer.

---

## Replay Semantics

Replaying a dead letter **does not** create a new event or break idempotency:

```
POST /api/deadletters/{id}/replay
        │
        ├─ Find DeadLetter row
        ├─ Find original Event (same idempotency_key, same event row)
        ├─ INSERT EventAttempt (attempt_number++, metadata.replay_of_dead_letter_id)
        ├─ SET events.status = 'queued'
        ├─ SET dead_letters.replayed_at, replay_status = 'requeued'
        └─ XADD events:incoming  ← re-uses original event_id
```

Full attempt history is preserved. The UI shows "replayed at T+5m" alongside original failures.

---

## Database Schema

```
applications
├── id          UUID PK
├── name        VARCHAR UNIQUE
└── created_at  TIMESTAMPTZ

events
├── id               UUID PK
├── application_id   FK → applications.id
├── workflow_id      VARCHAR (indexed)
├── event_type       VARCHAR (indexed)
├── service_name     VARCHAR (indexed)
├── idempotency_key  VARCHAR
├── status           VARCHAR (indexed)   ← received|queued|processing|succeeded|failed|retrying|dead_lettered|replayed|cancelled
├── payload_json     JSONB
├── metadata_json    JSONB
├── attempt_count    INT
├── max_attempts     INT
├── next_retry_at    TIMESTAMPTZ (indexed)
├── last_error       TEXT
└── UNIQUE(application_id, idempotency_key)

event_attempts
├── id             UUID PK
├── event_id       FK → events.id
├── attempt_number INT
├── worker_id      FK → workers.id (nullable, ON DELETE SET NULL)
├── worker_name    VARCHAR (denormalized — survives worker deletion)
├── status         VARCHAR
├── error_message  TEXT
├── metadata_json  JSONB
├── started_at     TIMESTAMPTZ
├── finished_at    TIMESTAMPTZ
└── duration_ms    INT

dead_letters
├── id           UUID PK
├── event_id     FK → events.id
├── reason       TEXT
├── last_error   TEXT
├── created_at   TIMESTAMPTZ
├── replayed_at  TIMESTAMPTZ
└── replay_status VARCHAR

workers
├── id                UUID PK
├── worker_name       VARCHAR UNIQUE
├── status            VARCHAR  ← active|busy|stale|stopped|crashed
├── last_heartbeat_at TIMESTAMPTZ (indexed)
└── current_event_id  UUID (nullable)

incident_summaries
├── id           UUID PK
├── workflow_id  VARCHAR (indexed)
├── summary_text TEXT
├── model_name   VARCHAR
└── created_at   TIMESTAMPTZ
```

---

## Synthetic Workload Generator

`POST /api/demo/generate-workload?count=N` creates N synthetic checkout workflows:

```
checkout.started  →  payment.authorized  →  inventory.reserved
      →  email.receipt_sent  →  shipment.created
```

**Failure rates** (server-side, seeded RNG keyed on `event_id:attempt_count` for reproducibility):

| Step                  | Fail Rate | Notes                              |
|-----------------------|-----------|------------------------------------|
| `payment.authorized`  | 15%       | simulates payment gateway timeouts |
| `inventory.reserved`  | 10%       | simulates stock contention         |
| `email.receipt_sent`  | 25%       | simulates SMTP failures            |
| Worker crash          | 1%        | simulates process OOM / sigkill    |

Payload override `_force_fail: true` forces failure for deterministic testing.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/events` | Ingest event (idempotent) |
| GET | `/api/events/recent` | Live activity feed |
| GET | `/api/events/{id}` | Get event with attempts |
| GET | `/api/workflows` | List all workflows |
| GET | `/api/workflows/{id}` | Workflow summary |
| GET | `/api/workflows/{id}/timeline` | Full event timeline + attempts |
| GET | `/api/deadletters` | List dead letters |
| POST | `/api/deadletters/{id}/replay` | Replay dead letter |
| GET | `/api/workers` | Worker health (stale detection) |
| GET | `/api/metrics` | Aggregate counts + latency percentiles |
| POST | `/api/demo/generate-workload` | Generate synthetic workload |
| POST | `/api/incidents/{workflow_id}/summarize` | AI incident summary (optional) |

---

## Quickstart

**Prerequisites:** Docker Desktop

```bash
git clone https://github.com/sushildalavi/ReplayForge-Async-Workflow-Replay-Failure-Debugging-Platform.git
cd ReplayForge-Async-Workflow-Replay-Failure-Debugging-Platform
cp backend/.env.example backend/.env
docker compose up -d
```

Open **http://localhost:5173**

Generate workload:
```bash
curl -X POST 'http://localhost:8000/api/demo/generate-workload?count=30'
```

Watch events process, retry, and dead-letter in real time.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://replayforge:replayforge@postgres:5432/replayforge` | PostgreSQL connection |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection |
| `ANTHROPIC_API_KEY` | *(empty)* | Optional — leave blank for free template summaries |
| `WORKER_NAME` | `worker-1` | Unique worker identity |
| `MAX_ATTEMPTS` | `4` | Attempts before dead-lettering |
| `LOG_LEVEL` | `INFO` | Log verbosity |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed frontend origins |

---

## Running Tests

```bash
docker compose exec backend pytest app/tests/ -v
```

**14 tests covering:**
- `test_duplicate_idempotency_key_returns_existing_event`
- `test_new_event_is_published_to_stream`
- `test_retry_policy_returns_expected_backoff`
- `test_event_moves_to_deadletter_after_max_attempts`
- `test_replay_requeues_deadletter_event`
- `test_worker_heartbeat_marks_worker_active`
- `test_stale_worker_detection`
- `test_workflow_timeline_ordering`
- *(and 6 more)*

---

## Free-Tier Deployment

**All four hops are free tier:**

### Postgres → [Neon](https://neon.tech) (0.5GB free)
```bash
export DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
```

### Redis → [Upstash](https://upstash.com) (10k commands/day free)
```bash
export REDIS_URL="rediss://default:pass@host:port"
```

### Backend → [Cloud Run](https://cloud.google.com/run) (2M requests/month free)
```bash
cd backend
gcloud run deploy replayforge-backend --source . \
  --set-env-vars DATABASE_URL=$DATABASE_URL,REDIS_URL=$REDIS_URL \
  --allow-unauthenticated --region us-central1
```

### Worker → Cloud Run (separate service)
```bash
gcloud run deploy replayforge-worker --source . \
  --command python,-m,app.workers.worker \
  --set-env-vars DATABASE_URL=$DATABASE_URL,REDIS_URL=$REDIS_URL,WORKER_NAME=worker-1 \
  --region us-central1
```

### Frontend → [Vercel](https://vercel.com) (free)
Connect GitHub repo → set root to `frontend/` → add `VITE_API_BASE_URL=https://your-cloud-run-url`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Animations | Framer Motion (28 distinct animations) |
| Charts | Recharts |
| Backend | FastAPI + Python 3.11 |
| Database | PostgreSQL 16 + SQLAlchemy 2 + Alembic |
| Queue | Redis 7.4 Streams |
| Workers | Python threads (heartbeat + consumer + retry scheduler) |
| Validation | Pydantic v2 |
| Testing | Pytest |
| Local Dev | Docker Compose |

---

## Limitations (v1)

- No authentication or authorization
- Single-tenant (`demo-checkout` application)
- No WebSockets — UI polls every 2.5–8s
- No Prometheus/OpenTelemetry
- Offset/limit pagination only (no cursors)
- Single retry policy (not per-event-type configurable)
- Replay is one-at-a-time
- `cancelled` status reserved but not exposed via API
