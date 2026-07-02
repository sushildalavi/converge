# Converge Product Demo

## What to open

- `/` public landing page
- `/app` recovery console
- `/app/workers` worker health
- `/app/streams` Redis stream backlog and retry state
- `/app/replay` dead letters and replay
- `/app/convergence` convergence verification
- `/app/chaos` benchmark and chaos evidence

## Demo flow

1. Start at the landing page and explain the product as a crash-safe workflow recovery engine.
2. Open `/app` and show the live recovery console.
3. Move to `/app/workers` and point out stale worker detection and heartbeats.
4. Move to `/app/streams` and show pending entries, retry queue depth, and backlog pressure.
5. Move to `/app/replay` and replay a dead letter after checking the downstream state.
6. Move to `/app/convergence` and verify whether the system actually drained.
7. Finish on `/app/chaos` and quote only the checked-in measured artifacts.

## Measured artifacts

These values come from files already committed in the repository.

- `benchmarks/benchmark_replay_20260702T213817Z.json`
  - Submitted: 1000 events
  - Converged: true
  - Dead letters: 0
  - Recovery time: 4.81s
  - End-to-end throughput: 208.02 events/sec
  - Pending entries after recovery: 0
- `benchmarks/chaos_replay_20260701T230628Z.json`
  - Submitted: 100 events
  - Converged: true
  - Dead letters: 0
  - Recovery time: 5.29s
  - End-to-end throughput: 18.9 events/sec
  - Pending after recovery: 0

## Honest wording

- Do not claim 100K-event chaos runs unless you can point to a checked-in artifact.
- Do not claim 3,000+ messages/sec unless you can point to a checked-in artifact.
- If you generate temporary smoke runs, label them as smoke-scale validation.
- If the data is too thin, the postmortem generator should return `insufficient_evidence`.

## Local setup

```bash
docker compose up --build -d
curl -fsS http://127.0.0.1:18000/health
curl -fsS http://127.0.0.1:18000/health/ready
```

## Related docs

- [README](../README.md)
- [Recovery postmortem architecture](RECOVERY_POSTMORTEM.md)
- [Portfolio proof](PORTFOLIO_PROOF.md)
