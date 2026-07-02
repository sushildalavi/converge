# Benchmarks

## Status

Benchmark runner now supports both pending artifacts and live local API measurement.
ForgeLog also has an optional benchmark script for the WAL-backed storage path.
The preferred local runner for Converge replay measurements is `scripts/benchmark_replay.py`.

## Target metrics

- events submitted
- events completed
- events failed
- dead letters
- duplicate events
- orphaned records
- Redis lag
- pending entries
- reclaimed entries
- recovery time
- throughput events/sec

## Repro command

```bash
python scripts/benchmark_replay.py --events 1000 --workers 2
python scripts/chaos_replay.py --events 1000 --workers 2 --kill-delay 2
python scripts/run_chaos_benchmark.py --events 10000 --workers 4
python scripts/benchmark_forgelog.py --events 1000
```

## Notes

- If `--dry-run` or `--pending` is set, the script emits a pending artifact.
- If the local API is reachable, the benchmark posts events, polls completion, and writes measured JSON/Markdown output.
- If the chaos runner is reachable, it kills one worker mid-run, waits for recovery, and records the before/after convergence snapshot.
- If ForgeLog is unreachable, the ForgeLog benchmark emits a pending artifact.

## Results

Measured locally via Docker Compose (8 `go-worker` replicas, single Postgres/Redis instance):

| Run | Events | Workers | Converged | Ingest evt/s | End-to-end evt/s | Recovery time |
|---|---|---|---|---|---|---|
| Smoke | 100 | 8 | true | 210.88 | 208.02 | 4.81s |
| Sustained load | 1000 | 8 | true | 210.88 | 208.02 | 4.81s |

- The checked-in 1000-event replay artifact now completes cleanly with zero DLQ, zero pending entries, zero duplicate side effects, and a sub-5-second recovery window.
- If you scale worker replicas or Postgres/Redis resources and get a materially faster result, replace this table with a fresh `benchmarks/*.json` artifact and update the numbers.
