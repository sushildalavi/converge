from __future__ import annotations

import logging
import os
import signal
import sys
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.core.redis_streams import (
    GROUP,
    STREAM_INCOMING,
    STREAM_RETRY,
    ensure_consumer_group,
    get_redis,
    publish_deadletter,
    schedule_retry,
)
from app.core.retry_policy import next_retry_delay, should_dead_letter
from app.database import SessionLocal
from app.models import DeadLetter, Event, EventAttempt, Worker
from app.workers.heartbeat import HeartbeatThread, mark_worker_active, mark_worker_stopped
from app.workers.retry_scheduler import RetrySchedulerThread

log = logging.getLogger(__name__)


class SimulatedFailure(Exception):
    pass


class WorkerCrashError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _register_worker(db: Session, worker_name: str) -> Worker:
    existing = db.execute(select(Worker).where(Worker.worker_name == worker_name)).scalar_one_or_none()
    if existing:
        existing.status = "active"
        existing.last_heartbeat_at = _now()
        existing.current_event_id = None
        db.commit()
        return existing
    w = Worker(worker_name=worker_name, status="active")
    db.add(w)
    db.commit()
    db.refresh(w)
    return w


def process_event_stub(event: Event) -> None:
    """Simulate event processing with realistic failure rates."""
    from app.demo.checkout_simulator import should_crash, should_fail_event

    event_id = str(event.id)
    attempt = event.attempt_count

    if event.payload_json.get("_force_fail"):
        raise SimulatedFailure("forced failure via _force_fail flag")

    if should_crash(event_id, attempt):
        raise WorkerCrashError("simulated worker crash")

    if should_fail_event(event_id, event.event_type, attempt):
        raise SimulatedFailure(f"{event.event_type} failed (simulated)")

    time.sleep(0.05 + (hash(event_id) % 100) * 0.002)


def _handle_success(db: Session, event: Event, worker: Worker, attempt_num: int, started_at: datetime) -> None:
    finished = _now()
    duration = int((finished - started_at).total_seconds() * 1000)
    attempt = EventAttempt(
        event_id=event.id,
        attempt_number=attempt_num,
        worker_id=worker.id,
        worker_name=worker.worker_name,
        status="succeeded",
        started_at=started_at,
        finished_at=finished,
        duration_ms=duration,
        metadata_json={},
    )
    db.add(attempt)
    event.status = "succeeded"
    event.updated_at = _now()
    db.commit()
    log.info("event %s succeeded (attempt %d)", event.id, attempt_num)


def _handle_failure(
    db: Session,
    event: Event,
    worker: Worker,
    attempt_num: int,
    started_at: datetime,
    error: Exception,
) -> None:
    finished = _now()
    duration = int((finished - started_at).total_seconds() * 1000)
    error_msg = str(error)

    event.attempt_count += 1
    event.last_error = error_msg
    event.updated_at = _now()

    attempt = EventAttempt(
        event_id=event.id,
        attempt_number=attempt_num,
        worker_id=worker.id,
        worker_name=worker.worker_name,
        status="failed",
        error_message=error_msg,
        started_at=started_at,
        finished_at=finished,
        duration_ms=duration,
        metadata_json={},
    )
    db.add(attempt)

    if should_dead_letter(event.attempt_count, event.max_attempts):
        dl = DeadLetter(event_id=event.id, reason="max attempts exceeded", last_error=error_msg)
        db.add(dl)
        event.status = "dead_lettered"
        db.commit()
        publish_deadletter(str(event.id), "max attempts exceeded")
        log.warning("event %s dead-lettered after %d attempts", event.id, event.attempt_count)
    else:
        delay = next_retry_delay(event.attempt_count, jitter=True) or 0
        retry_at = _now().__class__.fromtimestamp(_now().timestamp() + delay, tz=timezone.utc)
        event.status = "retrying"
        event.next_retry_at = retry_at
        db.commit()
        schedule_retry(str(event.id), retry_at)
        log.info("event %s scheduled retry in %ds (attempt %d)", event.id, delay, event.attempt_count)


def _reclaim_orphans(consumer_name: str, streams: list[str]) -> None:
    r = get_redis()
    for stream in streams:
        try:
            result = r.xautoclaim(stream, GROUP, consumer_name, min_idle_time=60_000, start_id="0-0", count=100)
            claimed = result[1] if isinstance(result, (list, tuple)) and len(result) > 1 else []
            if claimed:
                log.info("reclaimed %d orphaned messages from %s", len(claimed), stream)
        except Exception:
            log.debug("xautoclaim failed for %s (stream may be empty)", stream)


def run() -> None:
    worker_name = settings.worker_name
    log.info("worker starting: %s", worker_name)

    ensure_consumer_group(STREAM_INCOMING)
    ensure_consumer_group(STREAM_RETRY)

    db = SessionLocal()
    worker = _register_worker(db, worker_name)
    log.info("registered as worker %s", worker.id)

    heartbeat = HeartbeatThread(worker.id, SessionLocal)
    heartbeat.start()

    scheduler = RetrySchedulerThread(interval=1.0)
    scheduler.start()

    _reclaim_orphans(worker_name, [STREAM_INCOMING, STREAM_RETRY])

    r = get_redis()
    shutdown = threading.Event()

    import threading as threading_mod

    shutdown = threading_mod.Event()

    def _sigterm(*_):
        log.info("SIGTERM received, shutting down")
        shutdown.set()

    signal.signal(signal.SIGTERM, _sigterm)
    signal.signal(signal.SIGINT, _sigterm)

    try:
        while not shutdown.is_set():
            streams = {STREAM_INCOMING: ">", STREAM_RETRY: ">"}
            try:
                results = r.xreadgroup(
                    GROUP, worker_name, streams, count=5, block=2000
                )
            except Exception:
                log.exception("xreadgroup failed, retrying")
                time.sleep(1)
                continue

            if not results:
                continue

            for stream_name, messages in results:
                for msg_id, fields in messages:
                    event_id = fields.get("event_id")
                    if not event_id:
                        r.xack(stream_name, GROUP, msg_id)
                        continue

                    event = db.execute(select(Event).where(Event.id == event_id)).scalar_one_or_none()
                    if not event:
                        log.warning("event %s not found, acking", event_id)
                        r.xack(stream_name, GROUP, msg_id)
                        continue

                    if event.status in ("succeeded", "dead_lettered", "cancelled"):
                        r.xack(stream_name, GROUP, msg_id)
                        continue

                    attempt_num = event.attempt_count + 1
                    started_at = _now()
                    event.status = "processing"
                    event.updated_at = _now()
                    db.commit()

                    heartbeat.current_event_id = event.id

                    try:
                        process_event_stub(event)
                        _handle_success(db, event, worker, attempt_num, started_at)
                        r.xack(stream_name, GROUP, msg_id)
                    except WorkerCrashError as exc:
                        log.error("worker crash simulated: %s", exc)
                        db.execute(update(Worker).where(Worker.id == worker.id).values(status="crashed"))
                        db.commit()
                        db.close()
                        heartbeat.stop()
                        scheduler.stop()
                        sys.exit(1)
                    except Exception as exc:
                        _handle_failure(db, event, worker, attempt_num, started_at, exc)
                        r.xack(stream_name, GROUP, msg_id)
                    finally:
                        heartbeat.current_event_id = None

    finally:
        heartbeat.stop()
        scheduler.stop()
        mark_worker_stopped(db, worker.id)
        db.close()
        log.info("worker %s stopped", worker_name)


if __name__ == "__main__":
    import threading
    logging.basicConfig(level=settings.log_level)
    run()
