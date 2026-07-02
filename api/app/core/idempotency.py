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
        agent_run_id=payload.agent_run_id,
        step_id=payload.step_id,
        parent_step_id=payload.parent_step_id,
        tool_name=payload.tool_name,
        model_name=payload.model_name,
        provider_name=payload.provider_name,
        prompt_hash=payload.prompt_hash,
        system_prompt_hash=payload.system_prompt_hash,
        input_tokens=payload.input_tokens,
        output_tokens=payload.output_tokens,
        retry_reason=payload.retry_reason,
        trace_status=payload.trace_status,
        evaluation_status=payload.evaluation_status,
        replay_confidence=payload.replay_confidence,
        original_output_hash=payload.original_output_hash,
        replayed_output_hash=payload.replayed_output_hash,
        tool_call_args_hash=payload.tool_call_args_hash,
        tool_call_result_hash=payload.tool_call_result_hash,
        structured_output_valid=payload.structured_output_valid,
        failure_category=payload.failure_category,
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
    return event, False
