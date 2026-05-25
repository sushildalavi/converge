from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.replay import replay_dead_letter
from app.core.security import require_api_key
from app.database import get_db
from app.models import DeadLetter, Event
from app.schemas import DeadLetterOut, EventOut

router = APIRouter(tags=["deadletters"])

DbDep = Annotated[Session, Depends(get_db)]


@router.get("/api/deadletters")
def list_deadletters(db: DbDep, limit: int = 50, offset: int = 0) -> list[DeadLetterOut]:
    rows = db.execute(
        select(DeadLetter)
        .options(joinedload(DeadLetter.event))
        .order_by(DeadLetter.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    result = []
    for dl in rows:
        out = DeadLetterOut(
            id=dl.id,
            event_id=dl.event_id,
            workflow_id=dl.event.workflow_id if dl.event else "",
            event_type=dl.event.event_type if dl.event else "",
            service_name=dl.event.service_name if dl.event else "",
            reason=dl.reason,
            last_error=dl.last_error,
            created_at=dl.created_at,
            replayed_at=dl.replayed_at,
            replay_status=dl.replay_status,
        )
        result.append(out)
    return result


@router.post("/api/deadletters/{deadletter_id}/replay", dependencies=[Depends(require_api_key)])
def replay_deadletter(deadletter_id: UUID, db: DbDep) -> EventOut:
    event = replay_dead_letter(db, deadletter_id)
    from sqlalchemy.orm import selectinload
    event = db.execute(
        select(Event).options(selectinload(Event.attempts)).where(Event.id == event.id)
    ).scalar_one()
    return EventOut.model_validate(event)
