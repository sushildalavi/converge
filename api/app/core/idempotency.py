from __future__ import annotations

import threading
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Application, Event
from app.schemas import EventCreate


_application_id_cache: dict[str, UUID] = {}
_application_id_lock = threading.Lock()


def _get_or_create_application_id(db: Session, name: str) -> UUID:
    cached = _application_id_cache.get(name)
    if cached is not None:
        existing_cached = db.execute(
            select(Application.id).where(Application.id == cached)
        ).scalar_one_or_none()
        if existing_cached is not None:
            return cached
        _application_id_cache.pop(name, None)

    with _application_id_lock:
        cached = _application_id_cache.get(name)
        if cached is not None:
            existing_cached = db.execute(
                select(Application.id).where(Application.id == cached)
            ).scalar_one_or_none()
            if existing_cached is not None:
                return cached
            _application_id_cache.pop(name, None)

        app_id = db.execute(select(Application.id).where(Application.name == name)).scalar_one_or_none()
        if app_id is None:
            app = Application(name=name)
            db.add(app)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                app_id = db.execute(select(Application.id).where(Application.name == name)).scalar_one()
            else:
                app_id = app.id

        _application_id_cache[name] = app_id
        return app_id


def get_or_create_event(db: Session, payload: EventCreate) -> tuple[Event, bool]:
    app_id = _get_or_create_application_id(db, payload.application_name)

    existing = db.execute(
        select(Event).where(
            Event.application_id == app_id,
            Event.idempotency_key == payload.idempotency_key,
        )
    ).scalar_one_or_none()
    if existing:
        return existing, True

    event = Event(
        application_id=app_id,
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
                Event.application_id == app_id,
                Event.idempotency_key == payload.idempotency_key,
            )
        ).scalar_one()
        return existing, True
    return event, False
