from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.redis_streams import GROUP, RETRY_ZSET, STREAM_INCOMING, STREAM_RETRY, get_redis
from app.database import get_db
from app.models import DeadLetter, EventAttempt, Worker
from app.models import Event
from app.schemas import MetricsOut

router = APIRouter(tags=["metrics"])

DbDep = Annotated[Session, Depends(get_db)]


@router.get("/api/metrics")
def get_metrics(db: DbDep) -> MetricsOut:
    status_rows = db.execute(
        select(Event.status, func.count(Event.id)).group_by(Event.status)
    ).all()
    counts: dict[str, int] = {r[0]: r[1] for r in status_rows}

    total = sum(counts.values())
    succeeded = counts.get("succeeded", 0)
    failed = counts.get("failed", 0)
    dead_lettered = counts.get("dead_lettered", 0)
    retrying = counts.get("retrying", 0)
    queued = counts.get("queued", 0)
    processing = counts.get("processing", 0)

    recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=1)
    recent_processed = db.execute(
        select(func.count(EventAttempt.id)).where(
            EventAttempt.status == "succeeded",
            EventAttempt.finished_at.isnot(None),
            EventAttempt.finished_at >= recent_cutoff,
        )
    ).scalar() or 0
    processed_per_sec = round(recent_processed / 60.0, 3)

    # replay success rate: replayed DLs where event ended up succeeded
    replayed_count = db.execute(
        select(func.count(DeadLetter.id)).where(DeadLetter.replayed_at.isnot(None))
    ).scalar() or 0
    replayed_succeeded = db.execute(
        select(func.count(DeadLetter.id))
        .join(Event, Event.id == DeadLetter.event_id)
        .where(DeadLetter.replayed_at.isnot(None), Event.status == "succeeded")
    ).scalar() or 0
    replay_success_rate = (replayed_succeeded / replayed_count) if replayed_count > 0 else 0.0

    replay_latencies = db.execute(
        select(
            (func.extract("epoch", DeadLetter.replayed_at - DeadLetter.created_at) * 1000).label("latency_ms")
        ).where(DeadLetter.replayed_at.isnot(None))
    ).scalars().all()
    replay_latency_ms = None
    if replay_latencies:
        replay_latency_ms = round(sum(float(v) for v in replay_latencies) / len(replay_latencies), 1)

    # worker counts
    now = datetime.now(timezone.utc)
    workers = db.query(Worker).all()
    active_workers = sum(1 for w in workers if w.status in ("active", "busy"))
    stale_workers = sum(
        1 for w in workers
        if (now - (w.last_heartbeat_at.replace(tzinfo=timezone.utc) if w.last_heartbeat_at.tzinfo is None else w.last_heartbeat_at)).total_seconds() > 30
    )

    # Redis stream/backlog state
    r = get_redis()
    try:
        retry_queue_depth = int(r.zcard(RETRY_ZSET))
    except Exception:
        retry_queue_depth = 0
    try:
        incoming_stream_depth = int(r.xlen(STREAM_INCOMING))
    except Exception:
        incoming_stream_depth = 0
    try:
        retry_stream_depth = int(r.xlen(STREAM_RETRY))
    except Exception:
        retry_stream_depth = 0
    try:
        incoming_pending = int((r.xpending(STREAM_INCOMING, GROUP) or {}).get("pending", 0))
    except Exception:
        incoming_pending = 0
    try:
        retry_pending = int((r.xpending(STREAM_RETRY, GROUP) or {}).get("pending", 0))
    except Exception:
        retry_pending = 0

    # attempt duration stats
    durations = db.execute(
        select(EventAttempt.duration_ms).where(EventAttempt.duration_ms.isnot(None))
    ).scalars().all()

    avg_dur = None
    p50_dur = None
    p95_dur = None
    if durations:
        sorted_dur = sorted(durations)
        n = len(sorted_dur)
        avg_dur = sum(sorted_dur) / n
        p50_dur = float(sorted_dur[int(n * 0.50)])
        p95_dur = float(sorted_dur[min(int(n * 0.95), n - 1)])

    attempt_failures = db.execute(
        select(func.count(EventAttempt.id)).where(EventAttempt.status == "failed")
    ).scalar() or 0

    return MetricsOut(
        total_events=total,
        succeeded=succeeded,
        failed=failed,
        dead_lettered=dead_lettered,
        retrying=retrying,
        queued=queued,
        processing=processing,
        replay_requeued=replayed_count,
        replay_success_rate=round(replay_success_rate, 3),
        active_workers=active_workers,
        stale_workers=stale_workers,
        processed_per_sec=processed_per_sec,
        retry_queue_depth=retry_queue_depth,
        incoming_stream_depth=incoming_stream_depth,
        retry_stream_depth=retry_stream_depth,
        incoming_pending=incoming_pending,
        retry_pending=retry_pending,
        replay_latency_ms=replay_latency_ms,
        event_attempt_failures=attempt_failures,
        avg_attempt_duration_ms=round(avg_dur, 1) if avg_dur else None,
        p50_attempt_duration_ms=p50_dur,
        p95_attempt_duration_ms=p95_dur,
    )
