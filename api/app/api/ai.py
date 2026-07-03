"""AI operations endpoints — anomaly detection, trace inspection, evals, and postmortems."""
from __future__ import annotations

from typing import Annotated, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from app.core.ai_ops import select_judge_provider
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
from app.models import AgentRun, EvalResult, TraceComparison
from app.schemas import AgentRunOut, EvalResultOut, TraceComparisonOut

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


@router.get("/api/ai/agent-runs")
def list_agent_runs(db: DbDep, limit: int = 50) -> list[AgentRunOut]:
    rows = db.execute(
        select(AgentRun)
        .options(selectinload(AgentRun.steps), selectinload(AgentRun.eval_results), selectinload(AgentRun.trace_comparisons))
        .order_by(desc(AgentRun.created_at))
        .limit(limit)
    ).scalars().all()
    return [AgentRunOut.model_validate(row) for row in rows]


@router.get("/api/ai/agent-runs/{agent_run_id}")
def get_agent_run(agent_run_id: str, db: DbDep) -> AgentRunOut:
    row = db.execute(
        select(AgentRun)
        .options(selectinload(AgentRun.steps), selectinload(AgentRun.eval_results), selectinload(AgentRun.trace_comparisons))
        .where(AgentRun.agent_run_id == agent_run_id)
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="agent run not found")
    return AgentRunOut.model_validate(row)


@router.get("/api/ai/evals")
def list_eval_results(db: DbDep, agent_run_id: str | None = None, limit: int = 100) -> list[EvalResultOut]:
    stmt = select(EvalResult).order_by(desc(EvalResult.created_at)).limit(limit)
    if agent_run_id:
        stmt = stmt.join(AgentRun).where(AgentRun.agent_run_id == agent_run_id)
    rows = db.execute(stmt).scalars().all()
    return [EvalResultOut.model_validate(row) for row in rows]


@router.get("/api/ai/traces/compare/{agent_run_id}")
def get_trace_comparison(agent_run_id: str, db: DbDep) -> TraceComparisonOut:
    row = db.execute(select(TraceComparison).join(AgentRun).where(AgentRun.agent_run_id == agent_run_id)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="trace comparison not found")
    return TraceComparisonOut.model_validate(row)


@router.get("/api/ai/providers/status")
def provider_status() -> dict[str, Any]:
    provider = select_judge_provider()
    return {
        "provider": provider.name,
        "model": getattr(provider, "model_name", None),
        "mode": "deterministic" if provider.name == "fake" else "external",
        "source": "environment" if provider.name != "fake" else "local",
    }
