import pytest

from app.core.retry_policy import next_retry_delay, should_dead_letter


def test_retry_policy_returns_expected_backoff():
    assert next_retry_delay(1, jitter=False) == 0
    assert next_retry_delay(2, jitter=False) == 10
    assert next_retry_delay(3, jitter=False) == 30
    assert next_retry_delay(4, jitter=False) == 60


def test_retry_policy_returns_none_after_max():
    assert next_retry_delay(5, jitter=False) is None
    assert next_retry_delay(0, jitter=False) is None


def test_retry_policy_jitter_stays_in_range():
    for attempt in [2, 3, 4]:
        base = [10, 30, 60][attempt - 2]
        for _ in range(50):
            delay = next_retry_delay(attempt, jitter=True)
            assert delay is not None
            assert int(base * 0.8) <= delay <= int(base * 1.2) + 1


def test_should_dead_letter():
    assert should_dead_letter(4, 4) is True
    assert should_dead_letter(5, 4) is True
    assert should_dead_letter(3, 4) is False
    assert should_dead_letter(0, 4) is False
