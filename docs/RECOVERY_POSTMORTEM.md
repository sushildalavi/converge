# Recovery Postmortem Generator

Converge includes an optional recovery postmortem workflow that turns benchmark, chaos, and convergence evidence into a structured incident-style summary.

## Architecture

- Evidence collection gathers benchmark artifacts, chaos artifacts, workflow snapshots, convergence snapshots, retry counts, DLQ counts, worker health, and recovery timing.
- LangGraph orchestrates the workflow:
  - collect recovery evidence
  - summarize the recovery timeline
  - assess convergence
  - identify operational risks
  - generate the postmortem
  - validate the schema
  - verify evidence grounding
- LangChain structured-output parsing keeps the response aligned with the Pydantic schema.
- Ollama is supported as the optional local model backend.
- A fake provider powers tests, CI, and offline validation.

## Runtime Defaults

- `AI_PROVIDER=disabled`
- `OLLAMA_BASE_URL=http://localhost:11434`
- `AI_MODEL=llama3.1:8b`
- `AI_FALLBACK_MODEL=qwen2.5-coder:7b`
- `AI_TIMEOUT_SECONDS=20`

The service does not require Ollama at startup. If Ollama is unavailable, the generator falls back to deterministic evidence-based output.

## How To Generate

```bash
python scripts/generate_postmortem.py --artifact benchmarks/benchmark_replay_*.json --workflow-id <workflow_id>
```

You can also point the CLI at a running API:

```bash
python scripts/generate_postmortem.py --artifact benchmarks/benchmark_replay_*.json --base-url http://127.0.0.1:18000 --workflow-id <workflow_id>
```

## Evaluation

```bash
python scripts/evaluate_postmortem.py
```

The evaluation harness checks:

- schema-valid output rate
- recovery classification accuracy
- evidence coverage
- average latency
- insufficient-evidence handling

## Evidence Rules

- The generator must cite actual evidence collected from artifacts or live recovery state.
- If the evidence is too thin, it returns `insufficient_evidence`.
- The output should not claim 100K-event chaos runs or 3,000+ msg/sec throughput unless those numbers are actually measured in this repository.

## CI Behavior

- CI and tests use the fake provider.
- No paid API keys are required.
- Ollama is optional and not part of the default startup path.
