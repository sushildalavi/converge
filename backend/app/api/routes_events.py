from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.idempotency import get_or_create_event
from app.core.redis_streams import publish_incoming
from app.database import get_db
from app.models import Event
from app.schemas import EventCreate, EventOut

router = APIRouter(tags=["events"])
demo_router = APIRouter(tags=["demo"])
log = logging.getLogger(__name__)

DbDep = Annotated[Session, Depends(get_db)]


@router.post("/api/events", status_code=201)
def ingest_event(payload: EventCreate, db: DbDep) -> EventOut:
    event, duplicate = get_or_create_event(db, payload)

    if not duplicate:
        event.status = "queued"
        db.add(event)
        db.commit()
        db.refresh(event)
        try:
            publish_incoming(str(event.id))
        except Exception:
            log.exception("failed to publish event %s to stream", event.id)

    result = EventOut.model_validate(event)
    result.duplicate = duplicate
    return result


@router.get("/api/events/{event_id}")
def get_event(event_id: UUID, db: DbDep) -> EventOut:
    event = db.execute(
        select(Event).options(selectinload(Event.attempts)).where(Event.id == event_id)
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="event not found")
    return EventOut.model_validate(event)


@demo_router.post("/api/demo/generate-workload")
def generate_workload(count: int = Query(default=10, ge=1, le=500)) -> dict:
    from app.demo.workload_generator import generate_workload as _gen
    result = _gen(n=count, base_url="http://localhost:8000")
    return result
