# Converge Runbook

## Local endpoints

- Frontend: `http://localhost:5171`
- API: `http://127.0.0.1:8101`
- API docs: `http://127.0.0.1:8101/docs`
- Health: `http://127.0.0.1:8101/health`

## Start the stack

```bash
docker compose up --build -d
docker compose ps
```

## Quick checks

```bash
curl -fsS http://127.0.0.1:8101/health
curl -fsS http://127.0.0.1:8101/health/ready
curl -fsS http://127.0.0.1:8101/api/convergence | jq
curl -fsS http://127.0.0.1:8101/api/metrics | jq
curl -fsS http://127.0.0.1:8101/api/ai/providers/status | jq
```

## AI trace flow

1. Seed synthetic AI workloads from the console or API.
2. Inspect `/app/ai-runs` for agent runs and confidence.
3. Open `/app/ai-runs/:agentRunId` for prompt/tool JSON.
4. Open `/app/ai-runs/:agentRunId/compare` for trace diffs.
5. Review `/app/ai-evals` for evaluator output.

## Recovery flow

1. Check `/app/streams` for backlog and pending entries.
2. Check `/app/replay` for DLQ items.
3. Replay the DLQ item.
4. Verify `/app/convergence` reports drained state.
5. If Redis publish failed after DB commit, call:

```bash
curl -X POST http://127.0.0.1:8101/api/events/outbox/recover
```

## Benchmark flow

```bash
python scripts/benchmark_replay.py --events 1000 --workers 2 --mode generic
python scripts/benchmark_replay.py --events 1000 --workers 2 --mode ai-agent --eval-enabled --trace-comparison-enabled
python scripts/chaos_replay.py --events 10 --workers 2 --kill-delay 2
```

Artifacts are written to `benchmarks/` as timestamped `.json` and `.md` files.

## Interview-safe claims

- The platform has a real outbox recovery path.
- The platform has real AI trace and eval storage.
- The checked-in artifacts prove a 1000-event replay and a smaller chaos run.
- The repo does not currently prove a 100K replay or 3,000+ events/sec run.

