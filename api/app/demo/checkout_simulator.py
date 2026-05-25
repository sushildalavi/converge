from __future__ import annotations

import random
import time
import uuid

from app.schemas import EventCreate

CHECKOUT_STEPS = [
    ("checkout.started", "checkout-service"),
    ("payment.authorized", "payment-service"),
    ("inventory.reserved", "inventory-service"),
    ("email.receipt_sent", "notification-service"),
    ("shipment.created", "fulfillment-service"),
]

FAIL_RATES: dict[str, float] = {
    "payment.authorized": 0.15,
    "inventory.reserved": 0.10,
    "email.receipt_sent": 0.25,
}

CRASH_RATE = 0.01  # lowered for stable demo; raise to 0.05 to simulate crashes


def simulate_checkout_events(workflow_id: str | None = None) -> list[EventCreate]:
    if workflow_id is None:
        workflow_id = f"checkout_{uuid.uuid4().hex[:8]}"
    events = []
    for event_type, service_name in CHECKOUT_STEPS:
        events.append(
            EventCreate(
                application_name="demo-checkout",
                workflow_id=workflow_id,
                event_type=event_type,
                service_name=service_name,
                idempotency_key=f"{workflow_id}_{event_type}",
                payload={"workflow_id": workflow_id, "step": event_type},
                metadata={"source": "checkout-simulator"},
            )
        )
    return events


def should_fail_event(event_id: str, event_type: str, attempt_count: int) -> bool:
    rng = random.Random(f"{event_id}:{attempt_count}")
    rate = FAIL_RATES.get(event_type, 0.0)
    return rng.random() < rate


def should_crash(event_id: str, attempt_count: int) -> bool:
    rng = random.Random(f"crash:{event_id}:{attempt_count}")
    return rng.random() < CRASH_RATE
