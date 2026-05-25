from __future__ import annotations

import logging
import uuid

import httpx

from app.demo.checkout_simulator import simulate_checkout_events

log = logging.getLogger(__name__)


def generate_workload(n: int, base_url: str = "http://localhost:8000") -> dict:
    results = {"workflows": n, "events_sent": 0, "errors": 0}
    with httpx.Client(base_url=base_url, timeout=10.0) as client:
        for _ in range(n):
            wf_id = f"checkout_{uuid.uuid4().hex[:8]}"
            events = simulate_checkout_events(wf_id)
            for ev in events:
                try:
                    resp = client.post("/api/events", json=ev.model_dump())
                    if resp.status_code in (200, 201):
                        results["events_sent"] += 1
                    else:
                        log.warning("unexpected status %d for %s", resp.status_code, ev.idempotency_key)
                        results["errors"] += 1
                except Exception:
                    log.exception("failed to send event %s", ev.idempotency_key)
                    results["errors"] += 1
    return results
