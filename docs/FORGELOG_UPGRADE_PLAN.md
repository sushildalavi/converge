# ForgeLog Upgrade Plan

## Scope

Add an optional, experimental durable event-log backend called `ForgeLog` without replacing the existing Redis Streams workflow.

## Current Event Flow

1. FastAPI ingests events through `POST /api/events`.
2. `app.core.idempotency.get_or_create_event()` persists idempotent event state in PostgreSQL.
3. Successful first-time events are published to Redis Streams via `publish_incoming()`.
4. The Go worker reads from the Redis consumer group, processes the event, and updates PostgreSQL idempotency state.
5. The janitor path uses `XAUTOCLAIM` and consumer-group recovery to reclaim stalled Redis entries.

## Audit Notes

### Safe extension points

- `api/app/api/events.py` is the narrowest ingest choke point.
- `api/app/core/redis_streams.py` already centralizes Redis stream names and group creation.
- `api/app/main.py` initializes the control plane and is the right place to register a backend abstraction.
- The Go worker is already isolated from the HTTP control plane, which makes backend migration easier to stage.
- Benchmarks and smoke scripts already exist for pending/measured artifact generation.

### Risky areas

- The Go worker is hardwired to Redis Streams stream/group names today.
- PostgreSQL is used as the source of truth for idempotency, not as a queue, so it should not become a hidden queue backend.
- The current compose stack assumes Redis and Postgres only; adding ForgeLog in the base compose file would change the default runtime.
- Anything labeled "Raft" or "leader/follower" is substantially more complex than the current stack and should remain optional.

## Proposed Backend Interface

Define a small backend contract with these operations:

- `append(event) -> offset/id`
- `read_from(offset, limit) -> events`
- `ack/commit` only if the backend semantics require it
- `health()`
- `stats()`

### Backend selection

- `EVENT_BACKEND=redis` remains the default.
- `EVENT_BACKEND=forgelog` enables the experimental ForgeLog path.
- `FORGELOG_URL` points the API or tooling to the ForgeLog service.

### Integration rule

- Redis Streams remains the default runtime path for production and local development.
- ForgeLog is additive and optional.
- If the worker path cannot be made safe in the first pass, keep ForgeLog as an independently validated append/read log and document worker integration as partial.

## Proposed ForgeLog Shape

Start with a local-first implementation:

- Append-only WAL-backed log.
- Monotonic offsets.
- Read-from-offset iteration.
- Durable recovery after restart.
- Health and stats endpoints.

Only add Raft, snapshots, or replication if they can be implemented without destabilizing the existing system.

## Proposed Files To Add

- `docs/FORGELOG_DESIGN.md`
- `docs/FORGELOG_BENCHMARKS.md`
- `docker-compose.forgelog.yml`
- `scripts/benchmark_forgelog.py`
- `tests/test_forgelog_backend.py`
- `tests/test_forgelog_smoke.py`
- `forgelog/` or `go/forgelog/` service/package

## Proposed Files To Change

- `README.md`
- `docs/FAILURE_MODES.md`
- `api/app/api/events.py`
- `api/app/main.py`
- `api/app/config.py`
- `api/app/core/redis_streams.py`
- `docker-compose.yml`
- `tests/benchmark_chaos.py` only if it needs to recognize the new backend

## Test Strategy

### Must-have tests

- append returns monotonic offsets
- read_from returns events in order
- restart recovers WAL/events
- duplicate event id handling remains compatible with existing idempotency behavior
- health/stats endpoints respond correctly
- Redis backend still works
- config default remains Redis

### Optional Raft tests

- 3-node local cluster starts
- leader election occurs
- follower catches up after restart
- append survives leader restart if feasible

### Validation commands

- Go tests for the ForgeLog service/package
- Python tests for the API backend selection path
- Docker compose config rendering
- benchmark dry-run that emits a pending artifact if live measurement is not available
- `git diff --check`

## Rollback Strategy

- Keep Redis Streams as the default backend.
- Guard ForgeLog behind `EVENT_BACKEND=forgelog`.
- Use a separate compose override so the base stack remains unchanged.
- If ForgeLog introduces instability, disable it by removing the environment flag and continue using the current Redis path.
- Do not migrate worker processing to ForgeLog until append/read durability and recovery are verified.

## Recommended Implementation Order

1. Add the backend abstraction.
2. Implement ForgeLog append/read/health/stats in local WAL mode.
3. Wire the API to select Redis or ForgeLog by config.
4. Add smoke tests and benchmark artifacts.
5. Only then evaluate whether a worker consumer path is safe.

## Out Of Scope For The First Pass

- Production-grade Raft replication.
- Exactly-once semantics.
- Claims of production database readiness.
- Replacing the Redis Streams path.
