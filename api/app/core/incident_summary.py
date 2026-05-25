from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.models import Event, IncidentSummary

log = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _template_summarize(events: list[Event]) -> str:
    if not events:
        return "No events found for this workflow."
    wf_id = events[0].workflow_id
    n = len(events)
    fails = [e for e in events if e.status == "dead_lettered"]
    retried = [e for e in events if e.attempt_count > 1]
    if not fails:
        return (
            f"Workflow {wf_id}: {n} event(s), all completed successfully."
        )
    f = fails[0]
    extra = f" ({len(retried)} event(s) required retries.)" if retried else ""
    return (
        f"Workflow {wf_id}: {n} event(s), {len(fails)} dead-lettered. "
        f"First failure at '{f.event_type}' after {f.attempt_count} attempt(s). "
        f"Last error: {f.last_error or 'unknown'}.{extra}"
    )


def _claude_summarize(events: list[Event], api_key: str) -> tuple[str, str]:
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        event_summaries = [
            {
                "event_type": e.event_type,
                "status": e.status,
                "attempts": e.attempt_count,
                "last_error": e.last_error,
            }
            for e in events[:50]
        ]
        prompt = (
            f"Summarize this workflow failure in 2-3 sentences for an engineer. "
            f"Workflow ID: {events[0].workflow_id}\n"
            f"Events: {event_summaries}\n"
            "Be concise and actionable. Do not mention that you are an AI."
        )
        msg = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text, "claude-haiku-4-5"
    except Exception:
        log.exception("claude summarize failed, falling back to template")
        return _template_summarize(events), None


def summarize_workflow(db: Session, workflow_id: str) -> IncidentSummary:
    cached = (
        db.execute(
            select(IncidentSummary)
            .where(
                IncidentSummary.workflow_id == workflow_id,
                IncidentSummary.created_at > _now() - timedelta(seconds=60),
            )
            .order_by(IncidentSummary.created_at.desc())
        )
        .scalars()
        .first()
    )
    if cached:
        return cached

    events = db.execute(
        select(Event)
        .where(Event.workflow_id == workflow_id)
        .order_by(Event.created_at)
    ).scalars().all()

    api_key = settings.anthropic_api_key
    if api_key:
        text, model_name = _claude_summarize(events, api_key)
    else:
        text = _template_summarize(events)
        model_name = None

    summary = IncidentSummary(workflow_id=workflow_id, summary_text=text, model_name=model_name)
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return summary
