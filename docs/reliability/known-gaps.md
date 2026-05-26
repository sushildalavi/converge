# Known Gaps and Next Fix Targets

- Redis drained with partial Postgres completion indicates durability boundary issues between stream acknowledgment and DB visibility.
- Prefer validating any durability fix with clean-slate `down -v` benchmark runs.
- Avoid publishing exactly-once guarantees; use at-least-once plus idempotent state convergence wording.
