from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.core.logging import setup_logging, request_id_ctx, make_request_id

# Initialize logging FIRST so import-time logs are formatted
setup_logging()
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    log.info("backend starting", extra={"env": settings.environment, "version": app.version})
    try:
        from app.core.redis_streams import (
            STREAM_INCOMING, STREAM_RETRY, ensure_consumer_group,
        )
        ensure_consumer_group(STREAM_INCOMING)
        ensure_consumer_group(STREAM_RETRY)
        log.info("redis consumer groups initialized")
    except Exception:
        log.warning("redis not ready on startup — will retry lazily")
    yield
    log.info("backend shutting down")


app = FastAPI(
    title="ReplayForge",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,  # disable docs in prod
    redoc_url="/redoc" if not settings.is_production else None,
)


# ── middleware (order matters: outermost listed last) ─────
from app.core.security import (  # noqa: E402
    SecurityHeadersMiddleware, RateLimitMiddleware, MaxBodySizeMiddleware,
)

app.add_middleware(SecurityHeadersMiddleware)              # Layer 3: security headers
app.add_middleware(
    RateLimitMiddleware,                                    # Layer 2: per-IP rate limit
    write_limit=settings.rate_limit_write_per_min,
    read_limit=settings.rate_limit_read_per_min,
)
app.add_middleware(MaxBodySizeMiddleware, max_body_bytes=settings.max_request_body_bytes)  # Layer 3: payload cap
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-API-Key", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-Response-Time-Ms", "X-RateLimit-Remaining"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Attach a request_id, log the request, set X-Request-ID header."""
    rid = request.headers.get("x-request-id") or make_request_id()
    request_id_ctx.set(rid)
    request.state.request_id = rid

    t0 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled exception", extra={
            "method": request.method, "path": request.url.path,
        })
        response = JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "internal server error", "request_id": rid},
        )

    duration_ms = round((time.perf_counter() - t0) * 1000, 1)
    response.headers["X-Request-ID"] = rid
    response.headers["X-Response-Time-Ms"] = str(duration_ms)
    log.info("http request", extra={
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": duration_ms,
    })
    return response


# ── error handlers ─────────────────────────────────────────
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "validation_error",
            "details": exc.errors(),
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "request_id": getattr(request.state, "request_id", None),
        },
    )


# ── routers ────────────────────────────────────────────────
from app.api import (  # noqa: E402
    routes_events, routes_workflows, routes_workers,
    routes_metrics, routes_deadletters, routes_incidents,
    routes_insights, routes_health, routes_ai,
)
app.include_router(routes_health.router)
app.include_router(routes_events.router)
app.include_router(routes_events.demo_router)
app.include_router(routes_workflows.router)
app.include_router(routes_workers.router)
app.include_router(routes_metrics.router)
app.include_router(routes_deadletters.router)
app.include_router(routes_incidents.router)
app.include_router(routes_insights.router)
app.include_router(routes_ai.router)
