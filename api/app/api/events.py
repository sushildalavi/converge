from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.event_backends import append_event_to_backend
from app.core.idempotency import get_or_create_event
from app.core.security import require_api_key
from app.database import get_db
from app.models import Event
from app.schemas import EventCreate, EventOut, EventStatusBatchRequest, EventStatusOut

router = APIRouter(tags=["events"])
demo_router = APIRouter(tags=["demo"])
log = logging.getLogger(__name__)

DbDep = Annotated[Session, Depends(get_db)]
RequireKey = Annotated[None, Depends(require_api_key)]


@router.post("/api/events", status_code=201)
def ingest_event(payload: EventCreate, db: DbDep, _auth: RequireKey = None) -> EventOut:
    event, duplicate = get_or_create_event(db, payload)
    should_publish = not duplicate
    if duplicate and event.status in {"received", "queued", "retrying"}:
        should_publish = True

    if should_publish:
        event.status = "queued"
    elif event.status == "received":
        event.status = "queued"
    db.add(event)
    db.commit()
    if should_publish:
        try:
            append_event_to_backend(event, payload)
        except Exception:
            log.exception("failed to publish event %s to backend", event.id)
    result = EventOut.model_validate(event)
    result.duplicate = duplicate
    return result


@router.get("/api/events/recent")
def recent_events(db: DbDep, limit: int = Query(default=30, le=100)) -> list[dict[str, Any]]:
    """Recent activity feed — latest updated events across all statuses."""
    rows = db.execute(
        select(Event)
        .order_by(Event.updated_at.desc())
        .limit(limit)
    ).scalars().all()
    return [
        {
            "id": str(r.id),
            "workflow_id": r.workflow_id,
            "event_type": r.event_type,
            "service_name": r.service_name,
            "status": r.status,
            "attempt_count": r.attempt_count,
            "last_error": r.last_error,
            "updated_at": r.updated_at.replace(tzinfo=timezone.utc).isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.get("/api/events/{event_id}")
def get_event(event_id: UUID, db: DbDep) -> EventOut:
    event = db.execute(
        select(Event).options(selectinload(Event.attempts)).where(Event.id == event_id)
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="event not found")
    return EventOut.model_validate(event)


@router.post("/api/events/status", response_model=list[EventStatusOut])
def get_event_statuses(payload: EventStatusBatchRequest, db: DbDep) -> list[EventStatusOut]:
    if not payload.event_ids:
        return []

    rows = db.execute(
        select(Event.id, Event.status, Event.updated_at, Event.attempt_count).where(Event.id.in_(payload.event_ids))
    ).all()
    by_id = {
        row[0]: EventStatusOut(
            id=row[0],
            status=row[1],
            updated_at=row[2],
            attempt_count=int(row[3] or 0),
        )
        for row in rows
    }
    return [by_id[event_id] for event_id in payload.event_ids if event_id in by_id]


@demo_router.post("/api/demo/generate-workload")
def generate_workload(
    count: int = Query(default=10, ge=1, le=500),
    _auth: RequireKey = None,
) -> dict:
    from app.demo.workload_generator import generate_workload as _gen
    result = _gen(n=count, base_url="http://localhost:8000")
    return result
