# ForgeLog Design

ForgeLog is an optional WAL-backed event log for ReplayForge.

## What it does

- Appends JSON events to a durable local WAL.
- Replays events from a monotonic offset.
- Persists commit checkpoints per consumer.
- Exposes health and stats endpoints for orchestration and benchmarks.

## What it does not do

- It does not replace Redis Streams.
- It does not claim exactly-once semantics.
- It does not claim production database readiness.
- It does not ship Raft replication in the default implementation.

## Current shape

- `POST /append`
- `GET /read?offset=&limit=`
- `POST /commit`
- `GET /health`
- `GET /stats`

## Storage model

- Single WAL file on disk.
- Checkpoint JSON file for committed offsets.
- Monotonic offsets start at `1`.
- Recovery scans the WAL on startup and restores committed checkpoints.

## Integration model

- Redis Streams stays the default `EVENT_BACKEND`.
- ForgeLog is enabled only when `EVENT_BACKEND=forgelog`.
- The API chooses the backend at ingest time.
- The existing Redis worker path remains intact.

## Raft status

Raft replication is intentionally deferred until the WAL mode proves stable. The current implementation reports `raft_state=standalone`.
