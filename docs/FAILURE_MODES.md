# Failure Modes

## Covered scenarios

- worker crash
- Redis restart
- Postgres unavailable
- duplicate event
- poison message
- API timeout
- dead-letter replay
- ForgeLog WAL unavailable or corrupted
- ForgeLog service unavailable

## Reliability model

- At-least-once delivery with idempotent convergence.
- Dead-letter replay and recovery janitor support eventual reconciliation.
- ForgeLog is optional and experimental; Redis Streams remains the default backend.
