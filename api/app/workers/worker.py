from __future__ import annotations

import logging
import signal
import sys
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.core.logging import setup_logging
from app.core.redis_streams import (
    GROUP, STREAM_INCOMING, STREAM_RETRY,
    ensure_consumer_group, get_redis, publish_deadletter, schedule_retry,
)
from app.core.retry_policy import next_retry_delay, should_dead_letter
from app.database import SessionLocal
from app.models import DeadLetter, Event, EventAttempt, Worker
from app.workers.heartbeat import HeartbeatThread, mark_worker_stopped
from app.workers.retry_scheduler import RetrySchedulerThread

log = logging.getLogger(__name__)


class SimulatedFailure(Exception): pass
class WorkerCrashError(Exception): pass


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
    from app.demo.checkout_simulator import should_crash, should_fail_event

    event_id = str(event.id)
    attempt = event.attempt_count

    if event.payload_json.get("_force_fail"):
        raise SimulatedFailure("forced failure via _force_fail flag")
    if should_crash(event_id, attempt):
        raise WorkerCrashError("simulated worker crash")
    if should_fail_event(event_id, event.event_type, attempt):
        raise SimulatedFailure(f"{event.event_type} failed (simulated)")

    # Keep the demo workload fast enough to surface realistic throughput
    # while still leaving a little deterministic jitter for the recovery path.
    time.sleep(0.008 + (hash(event_id) % 24) * 0.001)


def _handle_success(db: Session, event: Event, worker: Worker, attempt_num: int, started_at: datetime) -> None:
    finished = _now()
    duration = int((finished - started_at).total_seconds() * 1000)
    db.add(EventAttempt(
        event_id=event.id, attempt_number=attempt_num,
        worker_id=worker.id, worker_name=worker.worker_name,
        status="succeeded", started_at=started_at, finished_at=finished,
        duration_ms=duration, metadata_json={},
    ))
    event.status = "succeeded"
    event.updated_at = _now()
    db.commit()
    log.info("event succeeded", extra={"event_id": str(event.id), "attempt": attempt_num, "duration_ms": duration})


def _handle_failure(db: Session, event: Event, worker: Worker, attempt_num: int, started_at: datetime, error: Exception) -> None:
    finished = _now()
    duration = int((finished - started_at).total_seconds() * 1000)
    error_msg = str(error)

    event.attempt_count += 1
    event.last_error = error_msg
    event.updated_at = _now()
    db.add(EventAttempt(
        event_id=event.id, attempt_number=attempt_num,
        worker_id=worker.id, worker_name=worker.worker_name,
        status="failed", error_message=error_msg,
        started_at=started_at, finished_at=finished,
        duration_ms=duration, metadata_json={},
    ))

    if should_dead_letter(event.attempt_count, event.max_attempts):
        db.add(DeadLetter(event_id=event.id, reason="max_attempts_exceeded", last_error=error_msg))
        event.status = "dead_lettered"
        db.commit()
        publish_deadletter(str(event.id), "max_attempts_exceeded")
        log.warning("event dead-lettered", extra={"event_id": str(event.id), "attempts": event.attempt_count})
    else:
        delay = next_retry_delay(event.attempt_count, jitter=True) or 0
        retry_at = _now() + timedelta(seconds=delay)
        event.status = "retrying"
        event.next_retry_at = retry_at
        db.commit()
        schedule_retry(str(event.id), retry_at)
        log.info("event retry scheduled", extra={"event_id": str(event.id), "delay_s": delay, "attempt": event.attempt_count})


def _reclaim_orphans(consumer_name: str, streams: list[str]) -> None:
    """XAUTOCLAIM PEL entries from dead consumers."""
    r = get_redis()
    for stream in streams:
        try:
            result = r.xautoclaim(stream, GROUP, consumer_name, min_idle_time=60_000, start_id="0-0", count=100)
            claimed = result[1] if isinstance(result, (list, tuple)) and len(result) > 1 else []
            if claimed:
                log.info("reclaimed orphans", extra={"count": len(claimed), "stream": stream})
        except Exception:
            log.debug("xautoclaim noop on %s (stream may be empty)", stream)


def _gc_stale_workers(db: Session) -> int:
    """Delete workers that haven't heartbeat in >5 minutes (gone for good)."""
    from sqlalchemy import delete
    cutoff = _now() - timedelta(minutes=5)
    res = db.execute(delete(Worker).where(Worker.last_heartbeat_at < cutoff))
    db.commit()
    return res.rowcount or 0


def run() -> None:
    setup_logging()
    import socket
    worker_name = (settings.worker_name or "").strip() or f"worker-{socket.gethostname()[:12]}"
    log.info("worker starting", extra={"worker": worker_name, "env": settings.environment})

    ensure_consumer_group(STREAM_INCOMING)
    ensure_consumer_group(STREAM_RETRY)

    db = SessionLocal()
    gc_count = _gc_stale_workers(db)
    if gc_count:
        log.info("garbage-collected stale workers", extra={"count": gc_count})
    worker = _register_worker(db, worker_name)
    log.info("worker registered", extra={"worker_id": str(worker.id), "worker_label": worker_name})

    heartbeat = HeartbeatThread(worker.id, SessionLocal, interval=settings.worker_heartbeat_interval)
    heartbeat.start()
    scheduler = RetrySchedulerThread(interval=1.0)
    scheduler.start()

    _reclaim_orphans(worker_name, [STREAM_INCOMING, STREAM_RETRY])

    r = get_redis()
    shutdown = threading.Event()

    def _sigterm(signum, _frame):
        log.info("shutdown signal received", extra={"signal": signum})
        shutdown.set()

    signal.signal(signal.SIGTERM, _sigterm)
    signal.signal(signal.SIGINT, _sigterm)

    try:
        while not shutdown.is_set():
            streams = {STREAM_INCOMING: ">", STREAM_RETRY: ">"}
            try:
                results = r.xreadgroup(
                    GROUP, worker_name, streams,
                    count=settings.worker_xreadgroup_count,
                    block=settings.worker_xreadgroup_block_ms,
                )
            except Exception:
                log.exception("xreadgroup failed, retrying")
                time.sleep(1)
                continue

            if not results:
                continue

            for stream_name, messages in results:
                if shutdown.is_set():
                    log.info("draining halted — shutdown in progress")
                    break
                for msg_id, fields in messages:
                    event_id = fields.get("event_id")
                    if not event_id:
                        r.xack(stream_name, GROUP, msg_id)
                        continue

                    event = db.execute(select(Event).where(Event.id == event_id)).scalar_one_or_none()
                    if not event:
                        log.warning("event not found", extra={"event_id": event_id})
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
                        # Record as failure but don't exit the worker — production-grade
                        # workers should not crash-loop themselves on simulated faults.
                        # XAUTOCLAIM still recovers PEL entries from genuinely-crashed workers.
                        log.error("crash simulated (recovered)", extra={"event_id": str(event.id)})
                        _handle_failure(db, event, worker, attempt_num, started_at, exc)
                        r.xack(stream_name, GROUP, msg_id)
                    except Exception as exc:
                        _handle_failure(db, event, worker, attempt_num, started_at, exc)
                        r.xack(stream_name, GROUP, msg_id)
                    finally:
                        heartbeat.current_event_id = None

    finally:
        log.info("worker draining and shutting down", extra={"worker": worker_name})
        heartbeat.stop()
        scheduler.stop()
        try:
            mark_worker_stopped(db, worker.id)
        except Exception:
            log.exception("could not mark worker stopped")
        db.close()
        log.info("worker stopped cleanly", extra={"worker": worker_name})


if __name__ == "__main__":
    run()
