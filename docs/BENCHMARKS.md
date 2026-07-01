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

- No canonical benchmark numbers are recorded in the repository until a measured run is executed on this machine.
- Do not claim 100K-event chaos, zero backlog, or 3,000+ messages/sec without a matching artifact in `benchmarks/`.
