# Benchmarks

## Status

Benchmark runner now supports both pending artifacts and live local API measurement.

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
python scripts/run_chaos_benchmark.py --events 10000 --workers 4
```

## Notes

- If `--dry-run` or `--pending` is set, the script emits a pending artifact.
- If the local API is reachable, the script posts events, polls completion, and writes measured JSON/Markdown output.
