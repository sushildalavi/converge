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

    def mock_publish(event_id: str) -> None:
        published_ids.append(event_id)

    with patch("app.api.events.publish_incoming", side_effect=mock_publish):
        client = _make_client(db)
        resp = client.post("/api/events", json=_EVENT_PAYLOAD)

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "queued"
    assert body["duplicate"] is False
    assert len(published_ids) == 1
    assert published_ids[0] == body["id"]


def test_duplicate_event_returns_200_and_duplicate_flag(db):
    with patch("app.api.events.publish_incoming"):
        client = _make_client(db)
        r1 = client.post("/api/events", json=_EVENT_PAYLOAD)
        r2 = client.post("/api/events", json=_EVENT_PAYLOAD)

    assert r1.status_code == 201
    assert r2.status_code == 201
    b1, b2 = r1.json(), r2.json()
    assert b2["duplicate"] is True
    assert b1["id"] == b2["id"]
