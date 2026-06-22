# ForgeLog Benchmarks

## Scope

Measure the ForgeLog append/read path without inventing results.

## Command

```bash
python scripts/benchmark_forgelog.py --events 1000
```

## Reported fields

- append p50 latency
- append p95 latency
- append throughput
- read throughput
- WAL size
- last offset
- committed offset
- recovery time

## Notes

- If ForgeLog is not reachable, the script emits a pending artifact.
- If the benchmark is not executed, no numbers should be claimed.
- Raft metrics are not included because Raft is not implemented in the default mode.
