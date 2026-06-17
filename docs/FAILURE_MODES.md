# Failure Modes

## Covered scenarios

- worker crash
- Redis restart
- Postgres unavailable
- duplicate event
- poison message
- API timeout
- dead-letter replay

## Reliability model

- At-least-once delivery with idempotent convergence.
- Dead-letter replay and recovery janitor support eventual reconciliation.

