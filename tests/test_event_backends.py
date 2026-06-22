from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace

from app.core import event_backends


@dataclass
class DummyEvent:
    id: str = "event-1"
    workflow_id: str = "wf-1"
    event_type: str = "checkout.started"
    service_name: str = "web"
    idempotency_key: str = "wf-1_checkout.started"
    status: str = "queued"
    payload_json: dict = None
    metadata_json: dict = None
    attempt_count: int = 0
    max_attempts: int = 4
    created_at: object = None
    updated_at: object = None

    def __post_init__(self):
        if self.payload_json is None:
            self.payload_json = {"order_id": "o-1"}
        if self.metadata_json is None:
            self.metadata_json = {"source": "test"}


def test_redis_backend_path(monkeypatch):
    monkeypatch.setattr(event_backends.settings, "event_backend", "redis")

    called = []

    def fake_publish(event_id: str) -> None:
        called.append(event_id)

    monkeypatch.setattr(event_backends, "publish_incoming", fake_publish)
    result = event_backends.append_event_to_backend(DummyEvent(), SimpleNamespace(application_name="demo"))

    assert result["backend"] == "redis"
    assert called == ["event-1"]

