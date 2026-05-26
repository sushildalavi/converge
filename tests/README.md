# Tests Directory

- `benchmark_chaos.py`: seeds high-volume Redis Stream events, kills a worker mid-flight, and verifies PostgreSQL convergence.

Run from repo root:

```bash
python3 tests/benchmark_chaos.py
```
