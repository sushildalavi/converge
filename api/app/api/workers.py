from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Worker
from app.schemas import WorkerOut
from app.workers.heartbeat import mark_stale_workers

router = APIRouter(tags=["workers"])

DbDep = Annotated[Session, Depends(get_db)]

STALE_THRESHOLD = 30


@router.get("/api/workers")
def list_workers(db: DbDep) -> list[WorkerOut]:
    mark_stale_workers(db, threshold_seconds=STALE_THRESHOLD)
    workers = db.query(Worker).order_by(Worker.last_heartbeat_at.desc()).all()
    now = datetime.now(timezone.utc)
    result = []
    for w in workers:
        hb = w.last_heartbeat_at
        if hb.tzinfo is None:
            hb = hb.replace(tzinfo=timezone.utc)
        is_stale = (now - hb).total_seconds() > STALE_THRESHOLD
        out = WorkerOut.model_validate(w)
        out.is_stale = is_stale
        result.append(out)
    return result
