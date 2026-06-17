from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

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

    # worker counts
    now = datetime.now(timezone.utc)
    workers = db.query(Worker).all()
    active_workers = sum(1 for w in workers if w.status in ("active", "busy"))
    stale_workers = sum(
        1 for w in workers
        if (now - (w.last_heartbeat_at.replace(tzinfo=timezone.utc) if w.last_heartbeat_at.tzinfo is None else w.last_heartbeat_at)).total_seconds() > 30
    )

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
        avg_attempt_duration_ms=round(avg_dur, 1) if avg_dur else None,
        p50_attempt_duration_ms=p50_dur,
        p95_attempt_duration_ms=p95_dur,
    )
