# Redis Stream Diagnostics

```bash
redis-cli XINFO GROUPS events:incoming
redis-cli XINFO GROUPS events:retry
redis-cli XPENDING events:incoming replayforge-workers
redis-cli XPENDING events:retry replayforge-workers
redis-cli XLEN events:incoming
```

Use these outputs to verify stream lag, pending entries, and total stream size during chaos tests.
