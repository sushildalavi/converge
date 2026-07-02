# Agentic Incident Analysis

The Converge incident recovery agent is a deterministic analysis wrapper around the benchmark artifact format.
For the structured recovery postmortem generator, see [docs/RECOVERY_POSTMORTEM.md](RECOVERY_POSTMORTEM.md).

## Workflow

1. Incident Summarizer Agent
2. Stream Lag Analyzer
3. Dead Letter Inspector
4. Runbook Recommendation Agent
5. Recovery Verification Agent

## Input

- benchmark artifact JSON
- optional live API URL

## Output

- incident summary
- suspected cause
- evidence
- recommended recovery action
- verification status
- trace

## Guardrails

- The agent does not mutate workflow state.
- The agent does not claim guaranteed recovery.
- Pending artifacts are handled explicitly.
