# Recovery Postmortem

The postmortem generator is evidence-driven. It uses benchmark artifacts, chaos artifacts, and live snapshots to generate a bounded summary instead of pretending the model has extra context.

## Inputs

- benchmark JSON/Markdown under `benchmarks/`
- chaos JSON/Markdown under `benchmarks/`
- optional workflow/convergence snapshots from the API

## Usage

```bash
python scripts/generate_postmortem.py --artifact benchmarks/benchmark_replay_*.json --workflow-id <workflow_id>
python scripts/evaluate_postmortem.py
```

## Guardrails

- Returns `insufficient_evidence` when the source material is too thin
- Uses local deterministic mode by default
- Optional external providers are only used when configured
- Does not replace the recovery engine or the operator console

