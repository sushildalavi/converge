from __future__ import annotations

import logging
from datetime import timezone
from typing import Any

import httpx

from app.config import settings
from app.core.redis_streams import STREAM_INCOMING, publish_incoming
from app.models import Event
from app.schemas import EventCreate

log = logging.getLogger(__name__)


def _timestamp(iso_value) -> str | None:
    if iso_value is None:
        return None
    if getattr(iso_value, "tzinfo", None) is None:
        return iso_value.replace(tzinfo=timezone.utc).isoformat()
    return iso_value.isoformat()


def _forgelog_payload(event: Event, payload: EventCreate) -> dict[str, Any]:
    return {
        "event_id": str(event.id),
        "application_name": payload.application_name,
        "workflow_id": event.workflow_id,
        "event_type": event.event_type,
        "service_name": event.service_name,
        "idempotency_key": event.idempotency_key,
        "status": event.status,
        "payload": event.payload_json,
        "metadata": event.metadata_json,
        "attempt_count": event.attempt_count,
        "max_attempts": event.max_attempts,
        "created_at": _timestamp(event.created_at),
        "updated_at": _timestamp(event.updated_at),
        "source": "replayforge-api",
        "backend": "forgelog",
    }


def append_event_to_backend(event: Event, payload: EventCreate) -> dict[str, Any]:
    backend = settings.normalized_event_backend
    if backend == "forgelog":
        url = settings.forgelog_url.rstrip("/")
        body = _forgelog_payload(event, payload)
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.post(f"{url}/append", json=body)
                response.raise_for_status()
                return response.json()
        except Exception:
            log.exception("failed to append event %s to ForgeLog", event.id)
            raise

    publish_incoming(str(event.id))
    return {"backend": "redis", "stream": STREAM_INCOMING, "event_id": str(event.id)}


def backend_health() -> dict[str, Any]:
    backend = settings.normalized_event_backend
    if backend == "forgelog":
        url = settings.forgelog_url.rstrip("/")
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.get(f"{url}/health")
                response.raise_for_status()
                return response.json()
        except Exception as exc:
            log.exception("ForgeLog health check failed")
            return {"status": "down", "backend": "forgelog", "error": str(exc)}

    return {"status": "ok", "backend": "redis"}


def backend_stats() -> dict[str, Any]:
    backend = settings.normalized_event_backend
    if backend == "forgelog":
        url = settings.forgelog_url.rstrip("/")
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.get(f"{url}/stats")
                response.raise_for_status()
                return response.json()
        except Exception as exc:
            log.exception("ForgeLog stats request failed")
            return {"status": "down", "backend": "forgelog", "error": str(exc)}

    return {"status": "ok", "backend": "redis", "stream": STREAM_INCOMING}
