"""AI-powered insight endpoints — anomaly detection, retry recommendation, root cause analysis."""
from __future__ import annotations

from typing import Annotated, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.ai_insights import (
    detect_anomalies,
    recommend_retry_policy,
    root_cause_analysis,
)
from app.core.recovery_postmortem import (
    RecoveryPostmortemOut,
    RecoveryPostmortemRequest,
    generate_recovery_postmortem,
)
from app.database import get_db

router = APIRouter(tags=["ai"])
DbDep = Annotated[Session, Depends(get_db)]


@router.get("/api/ai/anomalies")
def anomalies(db: DbDep, lookback_minutes: int = 30) -> dict[str, Any]:
    """Statistical anomaly detection across the last N minutes of activity."""
    return detect_anomalies(db, lookback_minutes=lookback_minutes)


@router.get("/api/ai/retry-recommendations")
def retry_recommendations(db: DbDep) -> list[dict[str, Any]]:
    """Per-event-type retry policy recommendations based on observed behaviour."""
    return recommend_retry_policy(db)


@router.get("/api/ai/root-cause/{workflow_id}")
def workflow_root_cause(workflow_id: str, db: DbDep) -> dict[str, Any]:
    """Identify probable root cause for a failing workflow + similar past patterns."""
    return root_cause_analysis(db, workflow_id)


@router.post("/api/ai/recovery-postmortem")
def recovery_postmortem(db: DbDep, request: RecoveryPostmortemRequest | None = None) -> RecoveryPostmortemOut:
    """Generate an evidence-grounded recovery postmortem from benchmark/chaos/live evidence."""
    return generate_recovery_postmortem(db, request)
