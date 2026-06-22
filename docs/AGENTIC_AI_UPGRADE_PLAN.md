# ReplayForge Agentic AI Upgrade Plan

## Current relevant capabilities
- Chaos and recovery tooling already exist in `scripts/run_chaos_benchmark.py`, `scripts/check_state.sh`, `scripts/load_test.py`, `docs/FAILURE_MODES.md`, and `docs/BENCHMARKS.md`.
- Backend, worker, and replay logic already expose incident and dead-letter workflows.
- Dashboard pages already show workflow, worker, and dead-letter state.

## Safest agentic extension points
- Add an incident-analysis script that reads benchmark artifacts and optionally queries a live API.
- Keep the workflow deterministic and artifact-backed by default.
- Reuse existing failure mode docs and runbook guidance.
- Avoid making the agent a second control plane; it should only recommend recovery actions.

## Proposed files to change
- `scripts/incident_recovery_agent.py`
- `docs/AGENTIC_INCIDENT_ANALYSIS.md`
- `tests/test_incident_recovery_agent.py`

## Tests to add
- Worker crash artifact produces the expected summary.
- Dead letters produce a recovery recommendation.
- Pending artifact is handled gracefully.
- Trace schema remains stable.

## Local demo command
- `python scripts/incident_recovery_agent.py --artifact <path>`

## Risks / unknowns
- The repo already contains several operational docs, so the agent must not duplicate the runbook.
- Live API access should be optional, not required.
- Need to keep the output grounded in artifacts and avoid speculative root causes.

## What not to claim
- Do not claim autonomous incident response.
- Do not claim guaranteed recovery.
- Do not claim live incident analysis unless a live artifact or API trace exists.
- Do not claim exactly-once semantics.
