from app.core.idempotency import get_or_create_event
from app.schemas import EventCreate


def _make_payload(key: str = "k-1") -> EventCreate:
    return EventCreate(
        application_name="demo",
        workflow_id="wf-1",
        event_type="checkout.started",
        service_name="web",
        idempotency_key=key,
        payload={"order_id": "o-1"},
    )


def test_duplicate_idempotency_key_returns_existing_event(db):
    payload = _make_payload()

    event1, dup1 = get_or_create_event(db, payload)
    event2, dup2 = get_or_create_event(db, payload)

    assert dup1 is False
    assert dup2 is True
    assert event1.id == event2.id
    assert event1.application_id == event2.application_id


def test_different_idempotency_keys_create_distinct_events(db):
    e1, _ = get_or_create_event(db, _make_payload("k-a"))
    e2, _ = get_or_create_event(db, _make_payload("k-b"))
    assert e1.id != e2.id
