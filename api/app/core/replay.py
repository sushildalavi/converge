from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.redis_streams import publish_incoming
from app.models import DeadLetter, Event, EventAttempt

log = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def replay_dead_letter(db: Session, dead_letter_id: UUID) -> Event:
    dl = db.get(DeadLetter, dead_letter_id)
    if not dl:
        raise HTTPException(status_code=404, detail="dead letter not found")
    if dl.replayed_at is not None:
        raise HTTPException(status_code=409, detail="already replayed")

    event = db.get(Event, dl.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="original event not found")

    # create linked replay attempt
    attempt = EventAttempt(
        event_id=event.id,
        attempt_number=event.attempt_count + 1,
        status="pending",
        metadata_json={"replay_of_dead_letter_id": str(dl.id)},
        started_at=_now(),
    )
    db.add(attempt)

    # reset event to queued (do NOT reset attempt_count or idempotency_key)
    event.status = "queued"
    event.next_retry_at = None
    event.updated_at = _now()

    dl.replayed_at = _now()
    dl.replay_status = "requeued"

    db.commit()
    db.refresh(event)

    try:
        publish_incoming(str(event.id))
    except Exception:
        log.exception("failed to publish replay for event %s", event.id)

    log.info("replayed dead letter %s → event %s", dl.id, event.id)
    return event
