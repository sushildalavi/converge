# Portfolio Proof

## What the project does

Converge is a distributed workflow recovery system built around Redis Streams, PostgreSQL, and idempotent replay.

## Why it is technically impressive

- Recovery and replay are first-class concerns rather than afterthoughts.
- The repo includes chaos and reliability runbooks.
- The design emphasizes at-least-once delivery with idempotent convergence.

## Architecture summary

- FastAPI control plane -> Redis Streams -> Go workers -> PostgreSQL.
- Recovery janitor and dead-letter replay support convergence after failures.

## How to run locally

- `docker compose up --build -d`
- `./scripts/check_state.sh`
- `make chaos`

## How to test

- Backend/API tests with `pytest`
- Worker tests with `go test ./...` if present
- Frontend build if a UI check is needed

## How to benchmark or evaluate

- Review `docs/RUNBOOK.md`
- Review `docs/reliability/chaos-runbook.md`
- Benchmark runner now emits pending artifacts in dry-run mode and measured artifacts when the local API is reachable
- Prefer `python scripts/benchmark_replay.py --events 1000 --workers 2` and `python scripts/chaos_replay.py --events 1000 --workers 2 --kill-delay 2` for local verification

## Verified metrics only

- No inflated benchmark claims are made.
- Checked-in replay artifact: `benchmarks/benchmark_replay_20260701T225501Z.json` with 1000 events, 612.29s recovery time, 1.63 end-to-end events/sec, and zero DLQ.
- Checked-in chaos artifact: `benchmarks/chaos_replay_20260701T230628Z.json` with 100 events, 5.29s recovery time, 18.9 end-to-end events/sec, and zero DLQ.

## Current limitations

- Some recovery metrics are described operationally rather than captured in one artifact.

## Future improvements

- Add a failure modes guide and artifact schema tests.
- Add explicit PEL and recovery visibility in docs or API status.

## Resume bullets

- Built an at-least-once workflow recovery system with Redis Streams and PostgreSQL.
- Designed idempotent replay and dead-letter recovery flows for distributed jobs.
- Added a public landing page plus a dedicated recovery console for operators.
- Documented chaos and recovery procedures for failure scenarios.

## Verification Log

- `python3 /Users/sushildalavi/Desktop/Github/converge/scripts/benchmark_replay.py --events 1000 --workers 2 --pending` - pass - 2026-07-01 - Wrote pending JSON and Markdown artifacts under `benchmarks/`.
- `python3 /Users/sushildalavi/Desktop/Github/converge/scripts/chaos_replay.py --events 1000 --workers 2 --pending` - pass - 2026-07-01 - Verified chaos artifact writing in pending mode.
- Direct helper checks against `scripts/benchmark_replay.py` - pass - 2026-07-01 - Verified pending and measured artifact shapes through direct assertions.
