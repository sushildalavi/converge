# Portfolio Proof

## What the project does

ReplayForge is a distributed workflow recovery system built around Redis Streams, PostgreSQL, and idempotent replay.

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

## Verified metrics only

- No canonical benchmark numbers were extracted in this pass.

## Current limitations

- Some recovery metrics are described operationally rather than captured in one artifact.

## Future improvements

- Add a failure modes guide and artifact schema tests.
- Add explicit PEL and recovery visibility in docs or API status.

## Resume bullets

- Built an at-least-once workflow recovery system with Redis Streams and PostgreSQL.
- Designed idempotent replay and dead-letter recovery flows for distributed jobs.
- Documented chaos and recovery procedures for failure scenarios.

## Verification Log

- `python3 /Users/sushildalavi/Desktop/Github/ReplayForge/scripts/run_chaos_benchmark.py --events 10000 --workers 4 --pending` - pass - 2026-06-17 - Wrote pending JSON and Markdown artifacts under `benchmarks/`.
- `python3 /Users/sushildalavi/Desktop/Github/ReplayForge/scripts/run_chaos_benchmark.py --pending --events 100 --workers 4 --output-dir /tmp/replayforge-bench --artifact-name replayforge_test` - pass - 2026-06-17 - Verified artifact writing in a custom output location.
- Direct helper checks against `scripts/run_chaos_benchmark.py` - pass - 2026-06-17 - Verified pending and measured artifact shapes through direct assertions.
