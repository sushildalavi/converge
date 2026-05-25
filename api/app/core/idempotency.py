from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Application, Event
from app.schemas import EventCreate


def _get_or_create_application(db: Session, name: str) -> Application:
    app = db.execute(select(Application).where(Application.name == name)).scalar_one_or_none()
    if app:
        return app
    app = Application(name=name)
    db.add(app)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        app = db.execute(select(Application).where(Application.name == name)).scalar_one()
    return app


def get_or_create_event(db: Session, payload: EventCreate) -> tuple[Event, bool]:
    app = _get_or_create_application(db, payload.application_name)

    existing = db.execute(
        select(Event).where(
            Event.application_id == app.id,
            Event.idempotency_key == payload.idempotency_key,
        )
    ).scalar_one_or_none()
    if existing:
        return existing, True

    event = Event(
        application_id=app.id,
        workflow_id=payload.workflow_id,
        event_type=payload.event_type,
        service_name=payload.service_name,
        idempotency_key=payload.idempotency_key,
        status="received",
        payload_json=payload.payload,
        metadata_json=payload.metadata,
        max_attempts=payload.max_attempts,
    )
    db.add(event)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.execute(
            select(Event).where(
                Event.application_id == app.id,
                Event.idempotency_key == payload.idempotency_key,
            )
        ).scalar_one()
        return existing, True
    db.commit()
    db.refresh(event)
    return event, False
