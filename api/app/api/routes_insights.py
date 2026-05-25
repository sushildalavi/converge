from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, case
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Event, EventAttempt

router = APIRouter(tags=["insights"])
DbDep = Annotated[Session, Depends(get_db)]


@router.get("/api/insights/services")
def services_breakdown(db: DbDep) -> list[dict[str, Any]]:
    """Per-service aggregate: total events, success rate, avg latency."""
    rows = db.execute(
        select(
            Event.service_name,
            func.count(Event.id).label("total"),
            func.sum(case((Event.status == "succeeded", 1), else_=0)).label("succeeded"),
            func.sum(case((Event.status == "dead_lettered", 1), else_=0)).label("failed"),
            func.sum(case((Event.status == "retrying", 1), else_=0)).label("retrying"),
        )
        .group_by(Event.service_name)
    ).all()

    out = []
    for r in rows:
        # Average duration from event_attempts joined to events of this service
        avg_dur = db.execute(
            select(func.avg(EventAttempt.duration_ms))
            .join(Event, Event.id == EventAttempt.event_id)
            .where(Event.service_name == r.service_name, EventAttempt.duration_ms.isnot(None))
        ).scalar()
        total = r.total or 0
        success = int(r.succeeded or 0)
        out.append({
            "service": r.service_name,
            "total": total,
            "succeeded": success,
            "failed": int(r.failed or 0),
            "retrying": int(r.retrying or 0),
            "success_rate": round(success / total, 3) if total else 0.0,
            "avg_duration_ms": round(float(avg_dur), 1) if avg_dur else None,
        })
    out.sort(key=lambda x: x["total"], reverse=True)
    return out


@router.get("/api/insights/errors")
def top_errors(db: DbDep, limit: int = 10) -> list[dict[str, Any]]:
    """Most common error messages with counts."""
    rows = db.execute(
        select(
            Event.last_error,
            Event.event_type,
            func.count(Event.id).label("count"),
        )
        .where(Event.last_error.isnot(None))
        .group_by(Event.last_error, Event.event_type)
        .order_by(func.count(Event.id).desc())
        .limit(limit)
    ).all()
    return [
        {"error": r.last_error, "event_type": r.event_type, "count": int(r.count)}
        for r in rows
    ]


@router.get("/api/insights/latency-histogram")
def latency_histogram(db: DbDep) -> dict[str, Any]:
    """Histogram of attempt durations grouped into bins (ms)."""
    durations = db.execute(
        select(EventAttempt.duration_ms).where(EventAttempt.duration_ms.isnot(None))
    ).scalars().all()

    bins = [0, 25, 50, 75, 100, 150, 200, 300, 500, 1000]
    labels = ["0-25", "25-50", "50-75", "75-100", "100-150", "150-200", "200-300", "300-500", "500-1k", "1k+"]
    counts = [0] * len(labels)
    for d in durations:
        for i, hi in enumerate(bins[1:]):
            if d < hi:
                counts[i] += 1
                break
        else:
            counts[-1] += 1
    return {
        "bins": labels,
        "counts": counts,
        "total": len(durations),
    }


@router.get("/api/insights/event-types")
def event_type_breakdown(db: DbDep) -> list[dict[str, Any]]:
    """Stats per event type (checkout.started, payment.authorized, etc)."""
    rows = db.execute(
        select(
            Event.event_type,
            func.count(Event.id).label("total"),
            func.sum(case((Event.status == "succeeded", 1), else_=0)).label("ok"),
            func.sum(case((Event.status == "dead_lettered", 1), else_=0)).label("dead"),
            func.sum(case((Event.status == "retrying", 1), else_=0)).label("retry"),
            func.avg(Event.attempt_count).label("avg_attempts"),
        )
        .group_by(Event.event_type)
        .order_by(func.count(Event.id).desc())
    ).all()
    return [
        {
            "event_type": r.event_type,
            "total": r.total,
            "succeeded": int(r.ok or 0),
            "dead_lettered": int(r.dead or 0),
            "retrying": int(r.retry or 0),
            "avg_attempts": round(float(r.avg_attempts or 0), 2),
        }
        for r in rows
    ]


@router.get("/api/insights/throughput")
def throughput_per_minute(db: DbDep, minutes: int = 30) -> list[dict[str, Any]]:
    """Events processed per minute over the last N minutes."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    bucket = func.date_trunc("minute", EventAttempt.finished_at).label("bucket")
    rows = db.execute(
        select(
            bucket,
            func.count(EventAttempt.id).label("count"),
            func.sum(case((EventAttempt.status == "succeeded", 1), else_=0)).label("ok"),
            func.sum(case((EventAttempt.status == "failed", 1), else_=0)).label("failed"),
        )
        .where(EventAttempt.finished_at >= cutoff)
        .group_by(bucket)
        .order_by(bucket)
    ).all()
    return [
        {
            "minute": r.bucket.replace(tzinfo=timezone.utc).isoformat() if r.bucket else None,
            "count": int(r.count or 0),
            "succeeded": int(r.ok or 0),
            "failed": int(r.failed or 0),
        }
        for r in rows
    ]
