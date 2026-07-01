from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.api.metrics import get_metrics
from app.api import metrics as metrics_module
from app.models import Application, DeadLetter, Event, EventAttempt, Worker


class _RedisStub:
    def zcard(self, *_args, **_kwargs):
        return 7

    def xlen(self, stream):
        return 11 if stream.endswith("incoming") else 3

    def xpending(self, stream, _group):
        return {"pending": 4 if stream.endswith("incoming") else 2}


def _event(db, app_id, status: str, attempt_count: int = 0) -> Event:
    event = Event(
        application_id=app_id,
        workflow_id=f"wf-{uuid4().hex[:8]}",
        event_type="checkout.started",
        service_name="checkout-service",
        idempotency_key=uuid4().hex,
        status=status,
        attempt_count=attempt_count,
        payload_json={},
    )
    db.add(event)
    db.flush()
    return event


def test_metrics_include_stream_backlog_and_replay_latency(db, monkeypatch):
    app = Application(name=f"app-{uuid4().hex[:6]}")
    db.add(app)
    db.flush()

    succeeded = _event(db, app.id, "succeeded")
    failed = _event(db, app.id, "failed")
    dead = _event(db, app.id, "dead_lettered")
    queued = _event(db, app.id, "queued")
    retrying = _event(db, app.id, "retrying")
    processing = _event(db, app.id, "processing")

    now = datetime.now(timezone.utc)
    db.add_all(
        [
            EventAttempt(
                event_id=succeeded.id,
                attempt_number=1,
                worker_name="worker-a",
                status="succeeded",
                started_at=now - timedelta(seconds=2),
                finished_at=now - timedelta(seconds=1),
                duration_ms=100,
                metadata_json={},
            ),
            EventAttempt(
                event_id=failed.id,
                attempt_number=1,
                worker_name="worker-a",
                status="failed",
                error_message="boom",
                started_at=now - timedelta(seconds=5),
                finished_at=now - timedelta(seconds=4),
                duration_ms=250,
                metadata_json={},
            ),
        ]
    )

    dead_letter = DeadLetter(
        event_id=dead.id,
        reason="max attempts exceeded",
        last_error="boom",
        created_at=now - timedelta(seconds=30),
        replayed_at=now,
        replay_status="requeued",
    )
    db.add(dead_letter)
    db.add(Worker(worker_name="worker-a", status="active", last_heartbeat_at=now))
    db.add(Worker(worker_name="worker-b", status="stale", last_heartbeat_at=now - timedelta(minutes=2)))
    db.commit()

    monkeypatch.setattr(metrics_module, "get_redis", lambda: _RedisStub())

    metrics = get_metrics(db)

    assert metrics.total_events == 6
    assert metrics.succeeded == 1
    assert metrics.failed == 1
    assert metrics.dead_lettered == 1
    assert metrics.queued == 1
    assert metrics.retrying == 1
    assert metrics.processing == 1
    assert metrics.replay_requeued == 1
    assert metrics.retry_queue_depth == 7
    assert metrics.incoming_stream_depth == 11
    assert metrics.retry_stream_depth == 3
    assert metrics.incoming_pending == 4
    assert metrics.retry_pending == 2
    assert metrics.event_attempt_failures == 1
    assert metrics.replay_latency_ms == 30000.0
    assert metrics.processed_per_sec is not None
