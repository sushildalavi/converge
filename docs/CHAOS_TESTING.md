# Chaos Testing

Converge ships a local chaos runner that interrupts a live Go worker and verifies recovery.

## Recommended flow

```bash
docker compose up -d --build
python scripts/chaos_replay.py --events 1000 --workers 2 --kill-delay 2
```

## What it checks

- worker interruption mid-processing
- pending-entry recovery
- retry stream handling
- DLQ counts
- orphaned worker claims
- duplicate side effects
- final convergence state

## Optional larger run

```bash
python scripts/chaos_replay.py --events 10000 --workers 4 --kill-delay 2 --restart-delay 3
```

## Honesty rule

- Do not claim 100K-event convergence or zero backlog unless the command above is actually run and the artifact is checked into `benchmarks/`.
- The script writes optional JSON and Markdown artifacts for local inspection, but benchmark output files should not be committed unless they are intentional evidence.
