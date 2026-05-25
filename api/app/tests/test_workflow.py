from __future__ import annotations

import time
from uuid import uuid4

from app.models import Application, Event


def _create_workflow_events(db, workflow_id: str) -> list[Event]:
    app = Application(name=f"app-{uuid4().hex[:6]}")
    db.add(app)
    db.flush()

    steps = ["checkout.started", "payment.authorized", "inventory.reserved"]
    events = []
    for step in steps:
        ev = Event(
            application_id=app.id,
            workflow_id=workflow_id,
            event_type=step,
            service_name="svc",
            idempotency_key=f"{workflow_id}_{step}",
            status="succeeded",
        )
        db.add(ev)
        time.sleep(0.01)  # ensure distinct created_at
    db.commit()
    return events


def test_workflow_timeline_ordering(db):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database import get_db

    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)

    wf_id = f"wf-{uuid4().hex[:8]}"
    _create_workflow_events(db, wf_id)

    resp = client.get(f"/api/workflows/{wf_id}/timeline")
    assert resp.status_code == 200
    body = resp.json()
    assert body["workflow_id"] == wf_id
    event_types = [e["event_type"] for e in body["events"]]
    assert event_types == ["checkout.started", "payment.authorized", "inventory.reserved"]
