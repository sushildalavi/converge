<div align="center">

# ⟳ ReplayForge

**Async Workflow Replay & Failure Debugging Platform**

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Redis](https://img.shields.io/badge/Redis-7.4-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose)

A production-grade developer platform that ingests workflow events, processes them through **Redis Streams consumer groups**, tracks retries with **exponential backoff**, moves exhausted events to a **dead-letter queue**, and provides a live dashboard for inspecting timelines and replaying failures.

> **ReplayForge uses AI only for incident summary generation. Retry behavior, replay semantics, and failure classification are deterministic and testable.**

</div>

---

## Screenshots

<table>
  <tr>
    <td colspan="2"><b>Dashboard — Live Metrics, Animated KPI Cards & Activity Feed</b></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/dashboard.png" alt="Dashboard" /></td>
  </tr>
  <tr>
    <td><b>Workflow Detail — Event Timeline with Retry History</b></td>
    <td><b>Workflow Timeline — Expanded Attempt Log</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/workflow-detail.png" alt="Workflow Detail" /></td>
    <td><img src="docs/screenshots/workflow-timeline-expanded.png" alt="Timeline Expanded" /></td>
  </tr>
  <tr>
    <td><b>Dead Letter Queue — Review & Replay</b></td>
    <td><b>Worker Health — Heartbeat Monitor</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/dead-letters.png" alt="Dead Letters" /></td>
    <td><img src="docs/screenshots/workers.png" alt="Workers" /></td>
  </tr>
  <tr>
    <td colspan="2"><b>Command Palette — ⌘K Quick Navigation</b></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/command-palette.png" alt="Command Palette" /></td>
  </tr>
</table>

---

## Problem Statement

Distributed systems fail in partial, non-deterministic ways. When a payment authorization silently times out, an email notification drops after 3 retries, or a worker process crashes mid-processing — operators need to:

1. **See exactly what happened** — which step failed, on which attempt, with what error
2. **Understand retry behavior** — was the backoff correct? Did it exhaust all attempts?
3. **Safely replay** — re-enqueue failed events without duplicating side effects

ReplayForge solves this with an event-driven architecture that makes failures first-class, observable, and recoverable.

---

## Architecture

```mermaid
graph TB
    subgraph Producers["📤 Event Producers"]
        SIM["Demo Checkout Simulator<br/>5-step workflow"]
        API_CLIENT["Any HTTP Client<br/>POST /api/events"]
    end

    subgraph Ingestion["🔌 FastAPI Ingestion API"]
        VALIDATE["① Validate Payload"]
        IDEMPOTENCY["② Idempotency Check<br/>UNIQUE(app_id, key)"]
        INSERT["③ INSERT Event<br/>status: received"]
        XADD["④ XADD events:incoming<br/>MAXLEN ~ 100,000"]
    end

    subgraph Queue["⚡ Redis Streams"]
        STREAM_IN["events:incoming"]
        STREAM_RETRY["events:retry"]
        STREAM_DLQ["events:deadletter"]
        RETRY_ZSET["events:retry:zset<br/>sorted set<br/>score = run_at_unix_ts"]
    end

    subgraph Worker["⚙️ Worker Process (3 concurrent loops)"]
        CONSUMER["XREADGROUP Consumer<br/>group: replayforge-workers"]
        HANDLER["Event Handler"]
        SCHEDULER["Retry Scheduler<br/>polls zset every 1s"]
        HEARTBEAT["Heartbeat Thread<br/>UPDATE workers every 5s"]
    end

    subgraph DB["🗄️ PostgreSQL"]
        EVENTS[("events")]
        ATTEMPTS[("event_attempts")]
        DLQ_TABLE[("dead_letters")]
        WORKERS_TABLE[("workers")]
    end

    subgraph Dashboard["🖥️ React Dashboard"]
        METRICS["Live Metrics"]
        TIMELINE["Workflow Timeline"]
        DLQ_UI["Dead Letter Queue"]
        WORKER_UI["Worker Health"]
    end

    Producers --> VALIDATE
    VALIDATE --> IDEMPOTENCY
    IDEMPOTENCY -->|"new"| INSERT
    IDEMPOTENCY -->|"duplicate"| API_CLIENT
    INSERT --> XADD
    XADD --> STREAM_IN

    STREAM_IN --> CONSUMER
    STREAM_RETRY --> CONSUMER
    CONSUMER --> HANDLER
    HANDLER -->|"success"| EVENTS
    HANDLER -->|"failure < max"| RETRY_ZSET
    HANDLER -->|"failure = max"| DLQ_TABLE
    HANDLER -->|"crash"| STREAM_IN
    RETRY_ZSET --> SCHEDULER
    SCHEDULER --> STREAM_RETRY
    HEARTBEAT --> WORKERS_TABLE
    HANDLER --> ATTEMPTS

    DB --> Dashboard
```

---

## Event Lifecycle

```mermaid
stateDiagram-v2
    [*] --> received : POST /api/events

    received --> queued : published to Redis stream

    queued --> processing : worker picks up via XREADGROUP

    processing --> succeeded : handler returns OK
    succeeded --> [*]

    processing --> failed : handler throws exception
    failed --> retrying : attempt_count < max_attempts\nZADD events:retry:zset\ndelay = [0s, 10s, 30s, 60s]
    retrying --> processing : scheduler fires\nXADD events:retry

    failed --> dead_lettered : attempt_count >= max_attempts\nINSERT dead_letters
    dead_lettered --> queued : operator clicks Replay\nlinked EventAttempt created\nidempotency_key unchanged
    queued --> processing

    processing --> queued : worker crash\nXAUTOCLAIM reclaims after 60s
```

---

## Retry Flow

```mermaid
sequenceDiagram
    participant P as Producer
    participant API as FastAPI API
    participant R as Redis Streams
    participant W as Worker
    participant DB as PostgreSQL
    participant S as Retry Scheduler

    P->>API: POST /api/events {idempotency_key: "k1"}
    API->>DB: INSERT event (status=received)
    API->>R: XADD events:incoming event_id=uuid
    API->>P: 201 {id: "uuid", duplicate: false}

    R->>W: XREADGROUP (attempt 1)
    W->>DB: UPDATE status=processing
    W->>W: process_event() → FAILS
    W->>DB: INSERT event_attempt (status=failed, attempt=1)
    W->>DB: UPDATE attempt_count=1, status=retrying
    W->>R: ZADD events:retry:zset (score=now+10s)
    W->>R: XACK

    S->>R: ZRANGEBYSCORE 0 now (fires after 10s)
    S->>R: ZREM + XADD events:retry

    R->>W: XREADGROUP (attempt 2)
    W->>W: process_event() → FAILS again

    Note over W,R: After max_attempts (4)...

    W->>DB: INSERT dead_letters
    W->>DB: UPDATE status=dead_lettered
    W->>R: XADD events:deadletter
    W->>R: XACK
```

---

## Replay Semantics

```mermaid
sequenceDiagram
    participant UI as Dashboard UI
    participant API as FastAPI API
    participant DB as PostgreSQL
    participant R as Redis Streams
    participant W as Worker

    UI->>API: POST /api/deadletters/{id}/replay

    API->>DB: SELECT dead_letter WHERE id=X
    API->>DB: SELECT event WHERE id=event_id

    Note over API,DB: No new event created!<br/>Idempotency key unchanged.

    API->>DB: INSERT event_attempt (pending,<br/>metadata.replay_of_dead_letter_id=X)
    API->>DB: UPDATE event SET status=queued, next_retry_at=NULL
    API->>DB: UPDATE dead_letter SET replayed_at=NOW(), replay_status=requeued

    API->>R: XADD events:incoming (original event_id)
    API->>UI: 200 {status: "queued"}

    R->>W: XREADGROUP picks up original event_id
    W->>W: process_event() → SUCCESS
    W->>DB: UPDATE event SET status=succeeded
    W->>DB: INSERT event_attempt (succeeded)
    W->>R: XACK
```

---

## Database Schema

```mermaid
erDiagram
    applications {
        uuid id PK
        varchar name UK
        timestamptz created_at
    }

    events {
        uuid id PK
        uuid application_id FK
        varchar workflow_id
        varchar event_type
        varchar service_name
        varchar idempotency_key
        varchar status
        jsonb payload_json
        jsonb metadata_json
        int attempt_count
        int max_attempts
        timestamptz next_retry_at
        text last_error
        timestamptz created_at
        timestamptz updated_at
    }

    event_attempts {
        uuid id PK
        uuid event_id FK
        int attempt_number
        uuid worker_id FK
        varchar worker_name
        varchar status
        text error_message
        jsonb metadata_json
        timestamptz started_at
        timestamptz finished_at
        int duration_ms
    }

    dead_letters {
        uuid id PK
        uuid event_id FK
        text reason
        text last_error
        timestamptz created_at
        timestamptz replayed_at
        varchar replay_status
    }

    workers {
        uuid id PK
        varchar worker_name UK
        varchar status
        timestamptz last_heartbeat_at
        uuid current_event_id
        timestamptz created_at
        timestamptz updated_at
    }

    incident_summaries {
        uuid id PK
        varchar workflow_id
        text summary_text
        varchar model_name
        timestamptz created_at
    }

    applications ||--o{ events : "has"
    events ||--o{ event_attempts : "has"
    events ||--o| dead_letters : "may have"
    workers ||--o{ event_attempts : "processes"
```

---

## Worker Architecture

```mermaid
graph LR
    subgraph WorkerProcess["Worker Process (single container)"]
        direction TB

        subgraph Loop1["Consumer Loop"]
            XRG["XREADGROUP<br/>events:incoming<br/>events:retry"]
            HANDLER["Event Handler"]
        end

        subgraph Loop2["Retry Scheduler"]
            POLL["ZRANGEBYSCORE<br/>events:retry:zset<br/>score ≤ now()"]
            REQUEUE["ZREM + XADD<br/>events:retry"]
        end

        subgraph Loop3["Heartbeat Thread"]
            HB["UPDATE workers<br/>SET last_heartbeat_at=NOW()<br/>every 5s"]
        end

        XRG --> HANDLER
        POLL -->|"due entries"| REQUEUE
    end

    HANDLER -->|"success"| ACK["XACK"]
    HANDLER -->|"failure"| ZADD["ZADD retry:zset"]
    HANDLER -->|"exhausted"| DLQ["INSERT dead_letters"]
    HANDLER -->|"crash"| EXIT["sys.exit(1)"]
    EXIT -->|"compose restart"| WorkerProcess
    EXIT -->|"on restart"| CLAIM["XAUTOCLAIM orphans"]
```

---

## Idempotency Strategy

```mermaid
flowchart TD
    A["POST /api/events\n{idempotency_key: k1}"] --> B{"UNIQUE constraint\napp_id + key"}
    B -->|"Row exists"| C["SELECT existing event"]
    B -->|"No row"| D["INSERT event\nstatus = received"]
    C --> E["Return event\nduplicate = true\nHTTP 201"]
    D --> F["XADD events:incoming"]
    F --> G["UPDATE status = queued"]
    G --> H["Return event\nduplicate = false\nHTTP 201"]

    style E fill:#1a2640,stroke:#6366f1
    style H fill:#1a2640,stroke:#10b981
```

---

## Synthetic Workload Generator

```mermaid
graph LR
    GEN["POST /api/demo/generate-workload\n?count=N"]

    subgraph Checkout["Checkout Workflow (5 steps)"]
        direction LR
        S1["🛒 checkout.started"] --> S2["💳 payment.authorized"]
        S2 --> S3["📦 inventory.reserved"]
        S3 --> S4["✉️ email.receipt_sent"]
        S4 --> S5["🚚 shipment.created"]
    end

    subgraph Failures["Server-Side Failure Rates"]
        F1["payment.authorized → 15%"]
        F2["inventory.reserved → 10%"]
        F3["email.receipt_sent → 25%"]
        F4["Worker crash → 1%"]
    end

    GEN --> Checkout
    Checkout -.-> Failures
```

---

## Quickstart

**Prerequisite:** Docker Desktop

```bash
git clone https://github.com/sushildalavi/ReplayForge-Async-Workflow-Replay-Failure-Debugging-Platform.git
cd ReplayForge-Async-Workflow-Replay-Failure-Debugging-Platform
cp backend/.env.example backend/.env
docker compose up -d                  # 3 workers, backend, frontend, postgres, redis
```

Open **http://localhost:5173**

```bash
# Generate synthetic workload
curl -X POST 'http://localhost:8000/api/demo/generate-workload?count=30'

# Watch events process, retry, and dead-letter in real time across 3 workers
docker compose logs -f worker | grep '"event succeeded"'
```

---

## Production-grade features

| Feature | Implementation |
|---------|---------------|
| **Horizontal worker scaling** | Workers auto-derive name from container hostname → `docker compose up -d --scale worker=N` adds replicas to the same Redis Streams consumer group |
| **Multi-stage Docker builds** | Backend builder image (with gcc/libpq-dev) is dropped at runtime → smaller, hardened image with non-root `app` user |
| **Health probes** | `GET /health/live` (process up) and `GET /health/ready` (Postgres + Redis reachable, returns 503 with detail if degraded) |
| **Graceful shutdown** | Workers handle SIGTERM, drain in-flight events, mark themselves stopped in DB before exit |
| **Crash recovery** | Worker crashes call `XAUTOCLAIM` on next startup to reclaim PEL entries from dead consumers (60s idle) |
| **Structured JSON logging** | Every log line: `{ts, level, logger, message, request_id, service, env, worker, ...extras}` — pipeable into Datadog, Loki, Cloud Logging |
| **Request correlation** | Middleware sets `X-Request-ID` header end-to-end (and adds `X-Response-Time-Ms`) |
| **Global exception handler** | Returns structured `{error, request_id, details}` instead of HTML stack traces |
| **Resource limits** | CPU/memory limits per service in compose; restart policies |
| **Connection pooling** | SQLAlchemy `pool_size=5, max_overflow=10, pool_pre_ping=True, pool_recycle=300` (handles Neon idle suspend) |
| **Idempotent migrations** | `alembic upgrade head` runs at backend start (no-op if up to date) |
| **CI on every PR** | GitHub Actions: pytest with real Postgres + Redis services, frontend typecheck + build, Docker build smoke |

---

## Security — three defense layers

| Layer | Mechanism | Implementation |
|-------|-----------|---------------|
| **Layer 1 — Authentication** | API key on write endpoints | `X-API-Key` header required for `POST /api/events`, `POST /api/deadletters/{id}/replay`, and demo workload generation in `production` mode. Constant-time hash comparison (`hmac.compare_digest`). Multi-key support via `API_KEYS` env (comma-separated). Disabled in `development` for local convenience. |
| **Layer 2 — Rate limiting** | Per-IP sliding window via Redis | Sorted-set sliding window in Redis (`ZREMRANGEBYSCORE` + `ZADD`) with separate limits for read (600/min) and write (60/min) endpoints. Returns `429` with `Retry-After` and `X-RateLimit-*` headers. Health/docs endpoints exempt. |
| **Layer 3 — Hardening** | Security headers + payload caps | OWASP-recommended response headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(),microphone=(),camera=()`, `Strict-Transport-Security` in production. Request bodies capped at 256 KB (`413` on overflow). Strict Pydantic validation on all inputs. |

```bash
# Verify security headers
curl -sI localhost:8000/api/metrics | grep -iE "ratelimit|frame|content-type-options"

# Verify rate limiting (after 60 writes/min)
for i in {1..70}; do curl -X POST localhost:8000/api/events -d '{}' -s -o /dev/null -w "%{http_code}\n"; done | tail -5
```

---

## AI insight layers

Three AI-powered analysis endpoints. **Layers 1 and 2 are fully deterministic** (statistical analysis, no API calls — work without an API key). **Layer 3 uses Claude when `ANTHROPIC_API_KEY` is set**, otherwise falls back to a deterministic root-cause classifier.

### Layer 1 — Anomaly Detection — `GET /api/ai/anomalies`

Statistical detection of unusual patterns in event flow:
- **Error rate spike** — current fail rate >2× baseline
- **Latency degradation** — p95 latency >2× rolling p95
- **Throughput drop** — current rate <50% of baseline
- **Service outliers** — one service with >3× DLQ rate vs fleet average

```bash
curl 'localhost:8000/api/ai/anomalies?lookback_minutes=30' | jq
```

```json
{
  "anomalies": [
    {
      "type": "error_rate_spike",
      "severity": "high",
      "message": "Error rate jumped from 1.2% to 8.4%",
      "baseline": 0.012,
      "current":  0.084
    }
  ],
  "anomaly_count": 1,
  "status": "anomaly"
}
```

### Layer 2 — Smart Retry Policy Recommender — `GET /api/ai/retry-recommendations`

Per-event-type retry policy suggestions based on observed behavior:
- **`reduce_attempts`** — failures are rare, current 4 attempts is wasteful
- **`increase_backoff`** — high DLQ rate suggests downstream is slow to recover
- **`investigate_root_cause`** — most events need many retries, fix flakiness instead
- **`keep_current`** — well-tuned for this event type

```bash
curl localhost:8000/api/ai/retry-recommendations | jq '.[0]'
```

```json
{
  "event_type": "email.receipt_sent",
  "total": 4080,
  "success_rate": 0.792,
  "dead_letter_rate": 0.002,
  "avg_attempts": 0.26,
  "recommendation": "reduce_attempts",
  "suggested_max_attempts": 2,
  "rationale": "Failures are rare and most events succeed on first attempt — reducing max_attempts saves DB load."
}
```

### Layer 3 — Root Cause Analysis — `GET /api/ai/root-cause/{workflow_id}`

For a specific failing workflow:
1. Identifies the primary (first) failure
2. Classifies error category (timeout, crash, connectivity, auth, missing resource, simulated)
3. Finds similar past workflows with same `event_type` + similar error pattern
4. Computes recovery rate of similar workflows
5. **If `ANTHROPIC_API_KEY` set**, sends compact prompt to Claude Haiku for senior-engineer-quality summary; otherwise template fallback

```bash
WF=$(curl -s localhost:8000/api/workflows | jq -r '.[0].workflow_id')
curl localhost:8000/api/ai/root-cause/$WF | jq
```

```json
{
  "primary_failure": {
    "event_type": "payment.authorized",
    "service":    "payment-service",
    "status":     "dead_lettered",
    "attempts":   4,
    "error":      "simulated worker crash"
  },
  "category":     "process_crash",
  "likely_cause": "Worker process died mid-execution. Check OOM, deploy events, or simulated crash injections.",
  "ai_summary":   "Payment service crashed during the auth step…",  // when ANTHROPIC_API_KEY is set
  "similar_failures": {
    "count": 20,
    "recovered": 20,
    "recovery_rate": 1.0,
    "top_error_patterns": [
      { "error": "payment.authorized failed (simulated)", "count": 17 }
    ]
  }
}
```

### Scaling workers

The worker service in `docker-compose.yml` runs 3 replicas by default. Bump it:

```bash
docker compose up -d --scale worker=10
curl -s http://localhost:8000/api/workers | jq 'length'   # → 10
```

Each worker auto-registers as `worker-<container-id>`. Redis Streams consumer
group `replayforge-workers` distributes pending entries across all consumers
via `XREADGROUP`. No code changes required.

### Production deploy

```bash
# Apply the production overlay (more replicas, nginx static frontend, JSON logs)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

What changes with the prod overlay:
- 2× backend replicas (HA)
- 5× worker replicas
- Frontend served by nginx (not Vite dev server) on port 80
- `ENVIRONMENT=production` (disables `/docs` Swagger UI)
- Higher CPU/memory limits

For a real cloud deploy, swap `DATABASE_URL` and `REDIS_URL` to managed services
(Neon, RDS, Upstash, ElastiCache) and run only the `backend` + `worker` services.

### Operations

See **[`docs/RUNBOOK.md`](docs/RUNBOOK.md)** for:
- Health probe behaviour
- Backup / restore scripts (`scripts/backup-db.sh`, `scripts/restore-db.sh`)
- Common incident playbooks (workers crashed, DLQ growing, backlog draining)
- All tunable env vars

---

## Project Structure

```
replayforge/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, lifespan, CORS, router wiring
│   │   ├── config.py            # Pydantic Settings (env vars)
│   │   ├── database.py          # SQLAlchemy engine, SessionLocal, get_db
│   │   ├── models.py            # 6 SQLAlchemy models
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── api/
│   │   │   ├── routes_events.py      # POST /api/events, GET /api/events/recent
│   │   │   ├── routes_workflows.py   # Workflow list + timeline
│   │   │   ├── routes_deadletters.py # DLQ list + replay
│   │   │   ├── routes_workers.py     # Worker health + stale detection
│   │   │   ├── routes_metrics.py     # Aggregate counts + latency percentiles
│   │   │   └── routes_incidents.py   # AI incident summary
│   │   ├── core/
│   │   │   ├── idempotency.py        # get_or_create_event (unique constraint)
│   │   │   ├── redis_streams.py      # XADD, ZADD, XAUTOCLAIM helpers
│   │   │   ├── retry_policy.py       # Exponential backoff schedule
│   │   │   ├── replay.py             # Linked-attempt replay logic
│   │   │   └── incident_summary.py   # Claude haiku / template fallback
│   │   ├── workers/
│   │   │   ├── worker.py             # XREADGROUP consumer loop + crash recovery
│   │   │   ├── heartbeat.py          # Periodic last_heartbeat_at update
│   │   │   └── retry_scheduler.py    # ZRANGEBYSCORE poll → XADD
│   │   ├── demo/
│   │   │   ├── checkout_simulator.py # 5-step checkout failure rates
│   │   │   └── workload_generator.py # Bulk workflow generation
│   │   └── tests/
│   │       ├── conftest.py           # Test DB fixtures (replayforge_test)
│   │       ├── test_idempotency.py
│   │       ├── test_event_ingestion.py
│   │       ├── test_retry_policy.py
│   │       ├── test_replay.py
│   │       ├── test_worker_heartbeat.py
│   │       ├── test_workflow.py
│   │       └── test_smoke_e2e.py     # Full stack (marker: e2e)
│   ├── alembic/                      # Database migrations
│   ├── requirements.txt
│   ├── Dockerfile
│   └── pytest.ini
├── frontend/
│   └── src/
│       ├── api/client.ts             # Typed Axios wrappers for all endpoints
│       ├── components/
│       │   ├── Animated.tsx          # Framer Motion primitives (28 animations)
│       │   ├── CommandPalette.tsx    # ⌘K palette with layoutId sliding pill
│       │   ├── EventStatusBadge.tsx  # Status badge with pulse dot
│       │   ├── Header.tsx            # Sticky header with health badge
│       │   ├── LiveFeed.tsx          # Real-time event activity (2.5s polling)
│       │   └── MetricCard.tsx        # KPI card with sparkline + spotlight
│       ├── hooks/usePolling.ts       # Polling with exponential error backoff
│       ├── pages/
│       │   ├── Dashboard.tsx         # Overview, charts, workflow table
│       │   ├── WorkflowDetail.tsx    # Timeline, arc, attempt history
│       │   ├── DeadLetters.tsx       # DLQ table with animated replay
│       │   └── WorkerHealth.tsx      # Worker cards with heartbeat bars
│       └── types.ts                  # TypeScript interfaces mirroring schemas
├── docs/screenshots/                 # Playwright-generated screenshots
├── scripts/
│   └── take-screenshots.js          # Playwright screenshot script
├── docker-compose.yml
└── README.md
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/events` | Ingest event (idempotent) |
| `GET` | `/api/events/recent` | Recent activity feed (for live UI) |
| `GET` | `/api/events/{id}` | Event detail with full attempt history |
| `GET` | `/api/workflows` | List workflows with aggregate stats |
| `GET` | `/api/workflows/{id}` | Workflow summary |
| `GET` | `/api/workflows/{id}/timeline` | Full event timeline + sorted attempts |
| `GET` | `/api/deadletters` | Dead letter queue (paginated) |
| `POST` | `/api/deadletters/{id}/replay` | Replay dead letter (linked attempt) |
| `GET` | `/api/workers` | Worker health with stale detection |
| `GET` | `/api/metrics` | Counts by status + p50/p95 latency |
| `POST` | `/api/demo/generate-workload` | Generate N synthetic checkout workflows |
| `POST` | `/api/incidents/{workflow_id}/summarize` | AI or template incident summary |

---

## Retry Policy

| Attempt | Delay | With ±20% Jitter |
|---------|-------|------------------|
| 1st | 0s | immediate |
| 2nd | 10s | 8s – 12s |
| 3rd | 30s | 24s – 36s |
| 4th | 60s | 48s – 72s |
| 5th+ | — | → `dead_lettered` |

Configurable via `MAX_ATTEMPTS` env var (default: `4`).

---

## Running Tests

```bash
# All unit tests (runs inside backend container)
docker compose exec backend pytest app/tests/ -v

# End-to-end smoke test (requires running compose stack)
docker compose exec backend pytest app/tests/test_smoke_e2e.py -m e2e -v
```

**14 tests covering:**

| Test | What it verifies |
|------|-----------------|
| `test_duplicate_idempotency_key_returns_existing_event` | Unique constraint + same row returned |
| `test_new_event_is_published_to_stream` | XADD called after successful INSERT |
| `test_retry_policy_returns_expected_backoff` | `[0, 10, 30, 60]` schedule, `None` after max |
| `test_event_moves_to_deadletter_after_max_attempts` | 4 failures → dead_letters row exists |
| `test_replay_requeues_deadletter_event` | Replay creates linked attempt, resets status |
| `test_worker_heartbeat_marks_worker_active` | `last_heartbeat_at` updates, `status=active` |
| `test_stale_worker_detection` | Worker silent >30s gets marked `stale` |
| `test_workflow_timeline_ordering` | Events returned in `created_at` + `attempt_number` order |
| *(+ 6 more)* | Jitter range, false-negative stale, ingestion edge cases |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://replayforge:replayforge@postgres:5432/replayforge` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection (`rediss://` for TLS) |
| `ANTHROPIC_API_KEY` | *(empty)* | Optional. Leave blank for free template summaries |
| `WORKER_NAME` | `worker-1` | Unique worker identity (set per replica) |
| `MAX_ATTEMPTS` | `4` | Max retry attempts before dead-lettering |
| `LOG_LEVEL` | `INFO` | Uvicorn + Python logging level |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed frontend origins |

---

## Free-Tier Deployment

Every component has a free tier — no credit card required.

### 1. Postgres → [Neon](https://neon.tech) (free: 0.5 GB)

```bash
# Copy your Neon connection string
export DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

> **Note:** Set `pool_pre_ping=True` (already configured) — Neon auto-suspends after 5 min idle, pre-ping reconnects transparently.

### 2. Redis → [Upstash](https://upstash.com) (free: 10k commands/day)

```bash
export REDIS_URL="rediss://default:yourpassword@your-endpoint.upstash.io:6379"
```

> **Note:** All `XADD` calls use `MAXLEN ~ 100000` to stay within Upstash's 256 MB free tier.

### 3. Backend → [Cloud Run](https://cloud.google.com/run/docs/quickstarts) (free: 2M requests/month)

```bash
cd backend
gcloud run deploy replayforge-backend \
  --source . \
  --set-env-vars "DATABASE_URL=$DATABASE_URL,REDIS_URL=$REDIS_URL,CORS_ORIGINS=https://your-app.vercel.app" \
  --allow-unauthenticated \
  --region us-central1
```

### 4. Worker → Cloud Run (separate service)

```bash
gcloud run deploy replayforge-worker \
  --source . \
  --command python \
  --args "-m,app.workers.worker" \
  --set-env-vars "DATABASE_URL=$DATABASE_URL,REDIS_URL=$REDIS_URL,WORKER_NAME=worker-cloud" \
  --region us-central1 \
  --no-allow-unauthenticated \
  --min-instances 1
```

### 5. Frontend → [Vercel](https://vercel.com) (free)

1. Connect GitHub repo in Vercel dashboard
2. Set **Root Directory** → `frontend/`
3. Set **Build Command** → `npm run build`
4. Set **Output Directory** → `dist`
5. Add env var: `VITE_API_BASE_URL=https://your-backend.run.app`

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + TypeScript + Vite | 18.3 / 5.6 / 5.4 |
| Styling | Tailwind CSS | 3.4 |
| Animations | Framer Motion | 28 distinct animations |
| Charts | Recharts | 3.x |
| Backend | FastAPI + Uvicorn | 0.115 / 0.32 |
| Language | Python | 3.11.9 |
| ORM | SQLAlchemy + Alembic | 2.0.36 / 1.13 |
| Validation | Pydantic v2 | 2.9 |
| Database | PostgreSQL | 16-alpine |
| Queue | Redis Streams | 7.4-alpine |
| Testing | Pytest | 8.3 |
| Screenshots | Playwright | 1.x |
| Dev | Docker Compose v2 | — |

---

## Dashboard Features

| Feature | Detail |
|---------|--------|
| **8 KPI metric cards** | Animated spring-physics counters, inline SVG sparklines, spotlight mouse-follow |
| **Rotating gradient border** | CSS `@property --border-angle` + conic-gradient on Total Events card |
| **Event throughput chart** | Rate per 4s tick (not cumulative), 35-point rolling window |
| **Status distribution bars** | Horizontal bars with `scaleX` fill animation per status |
| **Live activity feed** | 2.5s polling, new items flash indigo then fade, service emojis |
| **Workflow timeline** | Animated timeline nodes with spring pop, expandable attempt logs |
| **Dead-letter replay** | One-click replay with success glow flash animation |
| **Worker heartbeat bars** | Oscillating `scaleX` animation for active workers |
| **⌘K command palette** | Spring entrance, `layoutId` sliding background pill, keyboard nav |
| **Page transitions** | Blur + opacity fade between routes |
| **System health badge** | Operational / Degraded / Critical with pulsing dot |

---

## Limitations (v1)

- No authentication or authorisation on any endpoint
- Single-tenant (`demo-checkout` application by default)
- No WebSockets — UI polls every 2.5–8s depending on component
- No Prometheus / OpenTelemetry / structured log shipping
- Offset/limit pagination only (no cursor-based pagination)
- Single global retry policy (not per-event-type configurable)
- Replay is one-at-a-time only
- `cancelled` status is reserved in the enum but not exposed via API
- No dead-letter expiry or archival
- No CI/CD pipeline (manual deploy steps above)

## Reliability Benchmark Quickstart

```bash
make down
make up
make chaos
make check
```

For ingestion-focused profiling, run:

```bash
make load
```
