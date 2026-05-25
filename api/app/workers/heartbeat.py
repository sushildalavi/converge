from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Worker

log = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def mark_worker_active(db: Session, worker_id: UUID, current_event_id: UUID | None = None) -> None:
    db.execute(
        update(Worker)
        .where(Worker.id == worker_id)
        .values(
            last_heartbeat_at=_now(),
            status="busy" if current_event_id else "active",
            current_event_id=current_event_id,
        )
    )
    db.commit()


def mark_worker_stopped(db: Session, worker_id: UUID) -> None:
    db.execute(
        update(Worker).where(Worker.id == worker_id).values(status="stopped", current_event_id=None)
    )
    db.commit()


def mark_stale_workers(db: Session, threshold_seconds: int = 30) -> int:
    cutoff = _now() - timedelta(seconds=threshold_seconds)
    result = db.execute(
        update(Worker)
        .where(Worker.last_heartbeat_at < cutoff, Worker.status.in_(["active", "busy"]))
        .values(status="stale")
    )
    db.commit()
    return result.rowcount


class HeartbeatThread(threading.Thread):
    def __init__(self, worker_id: UUID, db_factory, interval: int = 5) -> None:
        super().__init__(daemon=True, name="heartbeat")
        self.worker_id = worker_id
        self.db_factory = db_factory
        self.interval = interval
        self._stop_event = threading.Event()
        self.current_event_id: UUID | None = None

    def run(self) -> None:
        while not self._stop_event.wait(self.interval):
            try:
                db = self.db_factory()
                mark_worker_active(db, self.worker_id, self.current_event_id)
                db.close()
            except Exception:
                log.exception("heartbeat failed")

    def stop(self) -> None:
        self._stop_event.set()
