"""
End-to-end smoke test against a running compose stack.

Run with: pytest app/tests/test_smoke_e2e.py -v -m e2e
Requires: docker compose up -d (all services running)
"""
import time

import httpx
import pytest

BASE = "http://localhost:8000"


@pytest.mark.e2e
def test_health():
    r = httpx.get(f"{BASE}/health", timeout=5)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.e2e
def test_ingest_and_idempotency():
    payload = {
        "application_name": "smoke-test",
        "workflow_id": "smoke-wf-001",
        "event_type": "checkout.started",
        "service_name": "web",
        "idempotency_key": "smoke-wf-001_checkout.started",
        "payload": {},
    }
    r1 = httpx.post(f"{BASE}/api/events", json=payload, timeout=5)
    assert r1.status_code == 201
    assert r1.json()["duplicate"] is False

    r2 = httpx.post(f"{BASE}/api/events", json=payload, timeout=5)
    assert r2.status_code == 201
    assert r2.json()["duplicate"] is True
    assert r1.json()["id"] == r2.json()["id"]


@pytest.mark.e2e
def test_workload_and_metrics():
    r = httpx.post(f"{BASE}/api/demo/generate-workload", params={"count": 5}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["workflows"] == 5
    assert data["events_sent"] == 25
    assert data["errors"] == 0

    # allow some processing time
    time.sleep(5)

    m = httpx.get(f"{BASE}/api/metrics", timeout=5).json()
    assert m["total_events"] >= 25
    assert m["active_workers"] >= 0


@pytest.mark.e2e
def test_workflow_timeline():
    wf_id = "smoke-wf-001"
    r = httpx.get(f"{BASE}/api/workflows/{wf_id}/timeline", timeout=5)
    assert r.status_code == 200
    body = r.json()
    assert body["workflow_id"] == wf_id
    event_types = [e["event_type"] for e in body["events"]]
    assert "checkout.started" in event_types


@pytest.mark.e2e
def test_incident_summary_template():
    # uses template (no API key in test env)
    wf_id = "smoke-wf-001"
    r = httpx.post(f"{BASE}/api/incidents/{wf_id}/summarize", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert len(body["summary_text"]) > 10
    assert body["workflow_id"] == wf_id


@pytest.mark.e2e
def test_workers_endpoint():
    r = httpx.get(f"{BASE}/api/workers", timeout=5)
    assert r.status_code == 200
    workers = r.json()
    assert isinstance(workers, list)
