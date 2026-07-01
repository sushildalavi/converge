"""
Health probes for orchestrators (Kubernetes/Cloud Run/ECS).

  /health/live    — process up, no dependency checks (fast)
  /health/ready   — checks DB + Redis (used by load balancer)
  /health         — same as /health/live (legacy)
"""
from __future__ import annotations

import logging
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.core.event_backends import backend_health, backend_stats
from app.core.redis_streams import get_redis
from app.database import get_db

router = APIRouter(tags=["health"])
log = logging.getLogger(__name__)

DbDep = Annotated[Session, Depends(get_db)]


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


@router.get("/health/backend")
def backend_status() -> dict[str, Any]:
    return backend_health()


@router.get("/health/backend/stats")
def backend_status_stats() -> dict[str, Any]:
    return backend_stats()


@router.get("/health/live")
def liveness() -> dict[str, Any]:
    """Process is alive. Used by orchestrator to decide whether to restart."""
    return {"status": "ok", "service": "converge-backend", "env": settings.environment}


@router.get("/health/ready")
def readiness(db: DbDep, response: Response) -> dict[str, Any]:
    """All dependencies reachable. Used by load balancer to route traffic."""
    deps: dict[str, Any] = {}

    # Postgres
    t0 = time.perf_counter()
    try:
        db.execute(text("SELECT 1")).scalar()
        deps["postgres"] = {"status": "ok", "latency_ms": round((time.perf_counter() - t0) * 1000, 1)}
    except Exception as exc:
        deps["postgres"] = {"status": "down", "error": str(exc)[:120]}

    # Redis
    t0 = time.perf_counter()
    try:
        get_redis().ping()
        deps["redis"] = {"status": "ok", "latency_ms": round((time.perf_counter() - t0) * 1000, 1)}
    except Exception as exc:
        deps["redis"] = {"status": "down", "error": str(exc)[:120]}

    all_ok = all(d.get("status") == "ok" for d in deps.values())
    if not all_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ok" if all_ok else "degraded",
        "checks": deps,
        "env": settings.environment,
    }
