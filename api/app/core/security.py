"""
Production security layers for ReplayForge.

Layer 1 — API key authentication (writes require X-API-Key header)
Layer 2 — Per-IP rate limiting (Redis-backed, sliding window)
Layer 3 — Input validation, payload size limits, security headers
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from starlette.types import ASGIApp

from app.config import settings
from app.core.redis_streams import get_redis

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# LAYER 1 — API key authentication
# ─────────────────────────────────────────────────────────────
def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


# Read-only endpoints (GET) are allowed unauthenticated for the demo dashboard.
# Mutating endpoints (POST/DELETE) require API key in non-development envs.
PUBLIC_PATHS = {
    "/health", "/health/live", "/health/ready",
    "/docs", "/redoc", "/openapi.json",
}


async def require_api_key(
    request: Request,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> None:
    """Dependency for write endpoints that need authentication."""
    # In development, no key required (local dev convenience)
    if not settings.is_production:
        return

    if not settings.api_keys_set:
        log.warning("api keys disabled — set REPLAYFORGE_API_KEYS in production")
        return

    if not x_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing X-API-Key header")

    provided_hash = _hash_key(x_api_key)
    valid = any(hmac.compare_digest(provided_hash, _hash_key(k)) for k in settings.api_keys_list)
    if not valid:
        log.warning("invalid api key attempt", extra={"path": request.url.path, "ip": _client_ip(request)})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid api key")


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ─────────────────────────────────────────────────────────────
# LAYER 2 — Per-IP rate limiting (Redis sliding window)
# ─────────────────────────────────────────────────────────────
class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter using Redis sorted sets.

    - Key per (IP, path-class)
    - 60 requests per minute per IP for write endpoints
    - 600 requests per minute per IP for read endpoints
    - Health/docs paths exempt
    """

    def __init__(
        self,
        app: ASGIApp,
        write_limit: int = 60,
        read_limit: int = 600,
        window_seconds: int = 60,
    ):
        super().__init__(app)
        self.write_limit = write_limit
        self.read_limit = read_limit
        self.window = window_seconds

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in PUBLIC_PATHS or path.startswith("/health"):
            return await call_next(request)

        ip = _client_ip(request)
        is_write = request.method in {"POST", "PUT", "DELETE", "PATCH"}
        limit = self.write_limit if is_write else self.read_limit
        bucket = "w" if is_write else "r"
        key = f"rl:{bucket}:{ip}"

        now = time.time()
        try:
            r = get_redis()
            pipe = r.pipeline()
            pipe.zremrangebyscore(key, 0, now - self.window)
            pipe.zadd(key, {str(now): now})
            pipe.zcard(key)
            pipe.expire(key, self.window + 1)
            _, _, count, _ = pipe.execute()
        except Exception:
            log.exception("rate-limit redis error — failing open")
            return await call_next(request)

        remaining = max(0, limit - int(count))
        reset_at = int(now + self.window)

        if int(count) > limit:
            log.warning("rate limit exceeded", extra={"ip": ip, "path": path, "count": count})
            return Response(
                content='{"error":"rate limit exceeded","retry_after":60}',
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={
                    "Content-Type": "application/json",
                    "Retry-After": "60",
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_at),
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_at)
        return response


# ─────────────────────────────────────────────────────────────
# LAYER 3 — Security headers + payload size cap
# ─────────────────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Sets OWASP-recommended security headers on every response."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(),microphone=(),camera=()")
        if settings.is_production:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Reject request bodies larger than `max_body_bytes` (default 256KB)."""

    def __init__(self, app: ASGIApp, max_body_bytes: int = 256 * 1024):
        super().__init__(app)
        self.max = max_body_bytes

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > self.max:
            log.warning("request body too large", extra={"size": cl, "path": request.url.path})
            return Response(
                content='{"error":"payload too large","max_bytes":' + str(self.max) + '}',
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                headers={"Content-Type": "application/json"},
            )
        return await call_next(request)
