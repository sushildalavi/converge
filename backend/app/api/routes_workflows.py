from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Event
from app.schemas import WorkflowSummaryOut, WorkflowTimelineEventOut, WorkflowTimelineOut

router = APIRouter(tags=["workflows"])
log = logging.getLogger(__name__)

DbDep = Annotated[Session, Depends(get_db)]

_SUCCEEDED = case((Event.status == "succeeded", 1), else_=0)
_DEAD_LETTERED = case((Event.status == "dead_lettered", 1), else_=0)
_FAILED = case((Event.status.in_(["failed", "dead_lettered"]), 1), else_=0)
_IN_FLIGHT = case((Event.status.in_(["queued", "processing", "retrying", "received"]), 1), else_=0)


@router.get("/api/workflows")
def list_workflows(db: DbDep, limit: int = 50, offset: int = 0) -> list[WorkflowSummaryOut]:
    rows = db.execute(
        select(
            Event.workflow_id,
            func.count(Event.id).label("total_events"),
            func.sum(_SUCCEEDED).label("succeeded"),
            func.sum(_FAILED).label("failed"),
            func.sum(_DEAD_LETTERED).label("dead_lettered"),
            func.sum(_IN_FLIGHT).label("in_flight"),
            func.max(Event.updated_at).label("last_updated_at"),
        )
        .group_by(Event.workflow_id)
        .order_by(func.max(Event.updated_at).desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return [
        WorkflowSummaryOut(
            workflow_id=r.workflow_id,
            total_events=r.total_events,
            succeeded=int(r.succeeded or 0),
            failed=int(r.failed or 0),
            dead_lettered=int(r.dead_lettered or 0),
            in_flight=int(r.in_flight or 0),
            has_failures=int(r.dead_lettered or 0) > 0 or int(r.failed or 0) > 0,
            last_updated_at=r.last_updated_at,
        )
        for r in rows
    ]


@router.get("/api/workflows/{workflow_id}/timeline")
def get_workflow_timeline(workflow_id: str, db: DbDep) -> WorkflowTimelineOut:
    events = db.execute(
        select(Event)
        .options(selectinload(Event.attempts))
        .where(Event.workflow_id == workflow_id)
        .order_by(Event.created_at)
    ).scalars().all()

    if not events:
        raise HTTPException(status_code=404, detail="workflow not found")

    event_outs = []
    for ev in events:
        sorted_attempts = sorted(ev.attempts, key=lambda a: a.attempt_number)
        event_outs.append(WorkflowTimelineEventOut.model_validate({**ev.__dict__, "attempts": sorted_attempts}))

    return WorkflowTimelineOut(workflow_id=workflow_id, events=event_outs)


@router.get("/api/workflows/{workflow_id}")
def get_workflow(workflow_id: str, db: DbDep) -> WorkflowSummaryOut:
    row = db.execute(
        select(
            Event.workflow_id,
            func.count(Event.id).label("total_events"),
            func.sum(_SUCCEEDED).label("succeeded"),
            func.sum(_FAILED).label("failed"),
            func.sum(_DEAD_LETTERED).label("dead_lettered"),
            func.sum(_IN_FLIGHT).label("in_flight"),
            func.max(Event.updated_at).label("last_updated_at"),
        )
        .where(Event.workflow_id == workflow_id)
        .group_by(Event.workflow_id)
    ).one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="workflow not found")

    return WorkflowSummaryOut(
        workflow_id=row.workflow_id,
        total_events=row.total_events,
        succeeded=int(row.succeeded or 0),
        failed=int(row.failed or 0),
        dead_lettered=int(row.dead_lettered or 0),
        in_flight=int(row.in_flight or 0),
        has_failures=int(row.dead_lettered or 0) > 0 or int(row.failed or 0) > 0,
        last_updated_at=row.last_updated_at,
    )
