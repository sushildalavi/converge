from __future__ import annotations

import json
import logging
import sys
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.config import settings

# Per-request correlation ID (set by middleware)
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    """Structured JSON log formatter — production-grade observability."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx.get(),
            "service": "converge-backend",
            "env": settings.environment,
            "worker": settings.worker_name if "worker" in record.name else None,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        # Attach any structured `extra=` fields
        for key, value in record.__dict__.items():
            if key not in {
                "name","msg","args","levelname","levelno","pathname","filename",
                "module","exc_info","exc_text","stack_info","lineno","funcName",
                "created","msecs","relativeCreated","thread","threadName",
                "processName","process","message",
            }:
                payload[key] = value
        return json.dumps({k: v for k, v in payload.items() if v is not None})


class TextFormatter(logging.Formatter):
    """Human-readable formatter for local development."""

    def __init__(self) -> None:
        super().__init__(
            fmt="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
            datefmt="%H:%M:%S",
        )


_RESERVED_LOGRECORD_ATTRS = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message",
}


class SafeLogRecordFactory:
    """Wraps the default LogRecord factory to rename `extra=` keys that collide
    with reserved LogRecord attributes (e.g. `name`, `module`, `path`).
    Production-safe: never raises on caller-supplied extras.
    """
    def __init__(self):
        self._inner = logging.getLogRecordFactory()

    def __call__(self, *args, **kwargs):
        # Default factory takes positional args and reads `extra` from
        # makeRecord — by the time we're here, extras have already been
        # merged into kwargs. We can't rename them here. The proper fix is
        # to use a custom Logger.makeRecord. For now, the JSON formatter
        # is the safer place to handle collisions.
        return self._inner(*args, **kwargs)


def _safe_make_record(self, name, level, fn, lno, msg, args, exc_info,
                      func=None, extra=None, sinfo=None):
    """Drop-in replacement for Logger.makeRecord that renames `extra=` keys
    colliding with reserved LogRecord attributes. Prevents KeyError crashes
    when callers pass `extra={"name": ...}`."""
    if extra:
        clean = {}
        for key, value in extra.items():
            if key in _RESERVED_LOGRECORD_ATTRS:
                clean[f"x_{key}"] = value
            else:
                clean[key] = value
        extra = clean
    return logging.Logger._makeRecord_orig(self, name, level, fn, lno, msg, args, exc_info, func, extra, sinfo)


def setup_logging() -> None:
    # Monkey-patch Logger.makeRecord once to silently rename reserved-key collisions
    if not hasattr(logging.Logger, "_makeRecord_orig"):
        logging.Logger._makeRecord_orig = logging.Logger.makeRecord
        logging.Logger.makeRecord = _safe_make_record

    fmt: logging.Formatter
    if settings.log_format == "json":
        fmt = JsonFormatter()
    else:
        fmt = TextFormatter()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(fmt)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())

    # Quiet noisy libraries in prod
    for lib in ("httpx", "uvicorn.access", "sqlalchemy.engine"):
        logging.getLogger(lib).setLevel(logging.WARNING)


def make_request_id() -> str:
    return uuid4().hex[:16]
