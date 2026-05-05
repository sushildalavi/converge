from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from app.core.retry_policy import should_dead_letter
from app.models import Application, DeadLetter, Event, EventAttempt


def _make_event(db, *, status: str = "received", attempt_count: int = 0, max_attempts: int = 4) -> Event:
    app = Application(name=f"app-{uuid4().hex[:6]}")
    db.add(app)
    db.flush()
    ev = Event(
        application_id=app.id,
        workflow_id=f"wf-{uuid4().hex[:6]}",
        event_type="payment.authorized",
        service_name="payment-service",
        idempotency_key=uuid4().hex,
        status=status,
        attempt_count=attempt_count,
        max_attempts=max_attempts,
        payload_json={"_force_fail": True},
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def test_event_moves_to_deadletter_after_max_attempts(db):
    ev = _make_event(db, max_attempts=4)

    # simulate 4 failed attempts
    for i in range(1, 5):
        ev.attempt_count = i
        if should_dead_letter(i, ev.max_attempts):
            dl = DeadLetter(event_id=ev.id, reason="max attempts exceeded", last_error="forced failure")
            db.add(dl)
            ev.status = "dead_lettered"
        else:
            ev.status = "retrying"
    db.commit()
    db.refresh(ev)

    assert ev.status == "dead_lettered"
    assert ev.attempt_count == 4
    dls = db.query(DeadLetter).filter_by(event_id=ev.id).all()
    assert len(dls) == 1


def test_replay_requeues_deadletter_event(db):
    ev = _make_event(db, status="dead_lettered", attempt_count=4)
    dl = DeadLetter(event_id=ev.id, reason="max attempts exceeded", last_error="boom")
    db.add(dl)
    db.commit()
    db.refresh(dl)

    published: list[str] = []

    with patch("app.core.redis_streams.get_redis") as mock_redis:
        mock_redis.return_value.xadd = lambda *a, **kw: None
        mock_redis.return_value.zadd = lambda *a, **kw: None

        from app.core.replay import replay_dead_letter
        updated_event = replay_dead_letter(db, dl.id)

    assert updated_event.status == "queued"
    db.refresh(dl)
    assert dl.replayed_at is not None
    assert dl.replay_status == "requeued"

    # new attempt row should exist
    new_attempts = db.query(EventAttempt).filter_by(event_id=ev.id).all()
    assert len(new_attempts) == 1
    assert new_attempts[0].metadata_json.get("replay_of_dead_letter_id") == str(dl.id)
