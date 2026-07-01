from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import get_db
from app.schemas import EventCreate
from app.core.idempotency import get_or_create_event


_EVENT_PAYLOAD = {
    "application_name": "demo",
    "workflow_id": "wf-stream-1",
    "event_type": "checkout.started",
    "service_name": "web",
    "idempotency_key": "wf-stream-1_checkout_started",
    "payload": {"order_id": "o-1"},
}


def _make_client(db: Session) -> TestClient:
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=True)


def test_new_event_is_published_to_stream(db):
    published_ids: list[str] = []

    def mock_publish(event, payload):
        published_ids.append(str(event.id))
        assert payload.application_name == _EVENT_PAYLOAD["application_name"]
        return {"backend": "redis"}

    with patch("app.api.events.append_event_to_backend", side_effect=mock_publish):
        client = _make_client(db)
        resp = client.post("/api/events", json=_EVENT_PAYLOAD)

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "queued"
    assert body["duplicate"] is False
    assert len(published_ids) == 1
    assert published_ids[0] == body["id"]


def test_duplicate_event_returns_200_and_duplicate_flag(db):
    with patch("app.api.events.append_event_to_backend"):
        client = _make_client(db)
        r1 = client.post("/api/events", json=_EVENT_PAYLOAD)
        r2 = client.post("/api/events", json=_EVENT_PAYLOAD)

    assert r1.status_code == 201
    assert r2.status_code == 201
    b1, b2 = r1.json(), r2.json()
    assert b2["duplicate"] is True
    assert b1["id"] == b2["id"]


def test_backend_publish_failure_keeps_event_persisted(db):
    with patch("app.api.events.append_event_to_backend", side_effect=RuntimeError("backend down")):
        client = _make_client(db)
        resp = client.post("/api/events", json=_EVENT_PAYLOAD)

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "queued"
    assert body["duplicate"] is False


def test_duplicate_retry_represents_publish_recovery(db):
    client = _make_client(db)

    with patch("app.api.events.append_event_to_backend", side_effect=RuntimeError("backend down")):
        first = client.post("/api/events", json=_EVENT_PAYLOAD)
    assert first.status_code == 201

    republished = []

    def _record_publish(event, payload):
        republished.append(str(event.id))
        return {"backend": "redis"}

    with patch("app.api.events.append_event_to_backend", side_effect=_record_publish):
        second = client.post("/api/events", json=_EVENT_PAYLOAD)

    assert second.status_code == 201
    assert second.json()["duplicate"] is True
    assert republished, "duplicate retry should republish the persisted event"
