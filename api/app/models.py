from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())

    events: Mapped[list[Event]] = relationship(back_populates="application")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False
    )
    workflow_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    service_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="received")
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    agent_run_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    step_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    parent_step_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    tool_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    system_prompt_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retry_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    trace_status: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    evaluation_status: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    replay_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    original_output_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    replayed_output_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    tool_call_args_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    tool_call_result_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    structured_output_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    failure_category: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now(), onupdate=_now
    )

    application: Mapped[Application] = relationship(back_populates="events")
    attempts: Mapped[list[EventAttempt]] = relationship(back_populates="event", cascade="all, delete-orphan")
    dead_letters: Mapped[list[DeadLetter]] = relationship(back_populates="event", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("application_id", "idempotency_key", name="uq_events_app_idempotency"),
    )


class EventAttempt(Base):
    __tablename__ = "event_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    worker_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workers.id", ondelete="SET NULL"), nullable=True
    )
    worker_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    event: Mapped[Event] = relationship(back_populates="attempts")


class DeadLetter(Base):
    __tablename__ = "dead_letters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())
    replayed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replay_status: Mapped[str | None] = mapped_column(String(32), nullable=True)

    event: Mapped[Event] = relationship(back_populates="dead_letters")


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    worker_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    last_heartbeat_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now(), index=True
    )
    current_event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now(), onupdate=_now
    )


class IncidentSummary(Base):
    __tablename__ = "incident_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    workflow_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    agent_run_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    workflow_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    run_kind: Mapped[str] = mapped_column(String(64), nullable=False, default="ai-agent")
    provider_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    prompt_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    system_prompt_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    trace_status: Mapped[str] = mapped_column(String(32), nullable=False, default="recorded")
    evaluation_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    replay_confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    failure_category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    original_output_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    replayed_output_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now(), onupdate=_now
    )

    steps: Mapped[list[AgentStep]] = relationship(back_populates="agent_run", cascade="all, delete-orphan")
    eval_results: Mapped[list[EvalResult]] = relationship(back_populates="agent_run", cascade="all, delete-orphan")
    trace_comparisons: Mapped[list[TraceComparison]] = relationship(back_populates="agent_run", cascade="all, delete-orphan")


class AgentStep(Base):
    __tablename__ = "agent_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    agent_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    parent_step_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    tool_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    system_prompt_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retry_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    trace_status: Mapped[str] = mapped_column(String(32), nullable=False, default="recorded")
    evaluation_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    replay_confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    original_output_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    replayed_output_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tool_call_args_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tool_call_result_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    structured_output_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failure_category: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())

    agent_run: Mapped[AgentRun] = relationship(back_populates="steps")


class EvalResult(Base):
    __tablename__ = "eval_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    agent_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    evaluator_name: Mapped[str] = mapped_column(String(128), nullable=False)
    evaluator_kind: Mapped[str] = mapped_column(String(64), nullable=False)
    verdict: Mapped[str] = mapped_column(String(32), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    details_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    compared_against: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())

    agent_run: Mapped[AgentRun] = relationship(back_populates="eval_results")


class TraceComparison(Base):
    __tablename__ = "trace_comparisons"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    agent_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_run_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    replayed_run_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    tool_sequence_diff_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    output_hash_diff_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    evaluator_verdict_diff_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    replay_confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    failure_category_summary_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())

    agent_run: Mapped[AgentRun] = relationship(back_populates="trace_comparisons")


class EventOutbox(Base):
    __tablename__ = "event_outbox"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    destination: Mapped[str] = mapped_column(String(64), nullable=False, default="redis")
    stream_name: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    event: Mapped[Event] = relationship()


Index("ix_events_status_created_at", Event.status, Event.created_at)
