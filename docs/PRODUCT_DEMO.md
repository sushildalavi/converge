# Product Demo

## Story

Converge is an AI workflow recovery platform. It shows how long-running agent tasks, tool calls, and generic workflows can be replayed, compared, and evaluated after worker interruption, retry failure, or Redis publish failure.

## Walkthrough

1. Open `http://localhost:5171`
2. Open `AI Console`
3. Seed an AI workload from the command palette or `/app/ai-runs`
4. Open `/app/ai-runs/:agentRunId`
5. Open `/app/ai-runs/:agentRunId/compare`
6. Open `/app/ai-evals`
7. Open `/app/benchmarks`
8. Open `/app/replay`
9. Open `/app/convergence`

## Preview URLs

- Frontend: `http://localhost:5171`
- API docs: `http://127.0.0.1:8101/docs`
- Health: `http://127.0.0.1:8101/health`

## What to say

- The system keeps a transactional outbox so publish failures after DB commit are recoverable.
- Agent runs keep step-level hashes, token counts, provider names, trace status, and replay confidence.
- Evals are deterministic locally, with optional OpenAI or Gemini judges when keys exist.
- Benchmark and chaos artifacts are written as timestamped JSON and Markdown files under `benchmarks/`.

