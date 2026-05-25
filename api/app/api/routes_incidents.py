from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.incident_summary import summarize_workflow
from app.database import get_db
from app.schemas import IncidentSummaryOut

router = APIRouter(tags=["incidents"])

DbDep = Annotated[Session, Depends(get_db)]


@router.post("/api/incidents/{workflow_id}/summarize")
def summarize_incident(workflow_id: str, db: DbDep) -> IncidentSummaryOut:
    summary = summarize_workflow(db, workflow_id)
    return IncidentSummaryOut.model_validate(summary)
