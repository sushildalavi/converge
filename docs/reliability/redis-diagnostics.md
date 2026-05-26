# Redis Stream Diagnostics

```bash
redis-cli XINFO GROUPS workflow_events
redis-cli XPENDING workflow_events replay_forge_workers
redis-cli XLEN workflow_events
```

Use these outputs to verify stream lag, pending entries, and total stream size during chaos tests.
