from __future__ import annotations

import random

# backoff in seconds indexed by attempt number (1-based)
# attempt 1 → 0s, attempt 2 → 10s, attempt 3 → 30s, attempt 4 → 60s
_BACKOFF = [0, 10, 30, 60]


def next_retry_delay(attempt: int, jitter: bool = True) -> int | None:
    """Return seconds to wait before the next attempt, or None if exhausted."""
    idx = attempt - 1
    if idx < 0 or idx >= len(_BACKOFF):
        return None
    base = _BACKOFF[idx]
    if jitter and base > 0:
        base = int(base * random.uniform(0.8, 1.2))
    return base


def should_dead_letter(attempt_count: int, max_attempts: int) -> bool:
    return attempt_count >= max_attempts
