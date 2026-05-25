from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from app.models import Worker
from app.workers.heartbeat import mark_stale_workers, mark_worker_active


def _make_worker(db, name: str = "test-worker") -> Worker:
    w = Worker(worker_name=name, status="active")
    db.add(w)
    db.commit()
    db.refresh(w)
    return w


def test_worker_heartbeat_marks_worker_active(db):
    w = _make_worker(db)
    old_ts = w.last_heartbeat_at

    time.sleep(0.05)
    mark_worker_active(db, w.id)

    db.refresh(w)
    assert w.status == "active"
    assert w.last_heartbeat_at > old_ts


def test_stale_worker_detection(db):
    from sqlalchemy import update
    w = _make_worker(db, name="stale-worker")

    # backdate heartbeat to 60s ago
    stale_ts = datetime.now(timezone.utc) - timedelta(seconds=60)
    db.execute(update(Worker).where(Worker.id == w.id).values(last_heartbeat_at=stale_ts))
    db.commit()

    count = mark_stale_workers(db, threshold_seconds=30)
    assert count >= 1

    db.refresh(w)
    assert w.status == "stale"


def test_fresh_worker_not_marked_stale(db):
    w = _make_worker(db, name="fresh-worker")
    mark_worker_active(db, w.id)

    count = mark_stale_workers(db, threshold_seconds=30)
    db.refresh(w)
    assert w.status in ("active", "busy")
