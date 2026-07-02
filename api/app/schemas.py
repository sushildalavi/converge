from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class EventCreate(BaseModel):
    application_name: str
    workflow_id: str
    event_type: str
    service_name: str
    idempotency_key: str
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    max_attempts: int = 4


class EventAttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    attempt_number: int
    worker_name: str | None = None
    status: str
    error_message: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime
    finished_at: datetime | None = None
    duration_ms: int | None = None


class EventStatusOut(BaseModel):
    id: uuid.UUID
    status: str
    updated_at: datetime | None = None
    attempt_count: int = 0


class EventStatusBatchRequest(BaseModel):
    event_ids: list[uuid.UUID] = Field(default_factory=list)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    workflow_id: str
    event_type: str
    service_name: str
    idempotency_key: str
    status: str
    payload_json: dict[str, Any] = Field(default_factory=dict)
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    attempt_count: int
    max_attempts: int
    next_retry_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime
    duplicate: bool = False
    attempts: list[EventAttemptOut] = Field(default_factory=list)


class WorkflowSummaryOut(BaseModel):
    workflow_id: str
    total_events: int
    succeeded: int
    failed: int
    dead_lettered: int
    in_flight: int
    has_failures: bool
    last_updated_at: datetime | None = None


class WorkflowTimelineEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_type: str
    service_name: str
    status: str
    attempt_count: int
    max_attempts: int
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime
    attempts: list[EventAttemptOut] = Field(default_factory=list)


class WorkflowTimelineOut(BaseModel):
    workflow_id: str
    events: list[WorkflowTimelineEventOut]


class DeadLetterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    workflow_id: str
    event_type: str
    service_name: str
    reason: str
    last_error: str | None = None
    created_at: datetime
    replayed_at: datetime | None = None
    replay_status: str | None = None


class WorkerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    worker_name: str
    status: str
    last_heartbeat_at: datetime
    current_event_id: uuid.UUID | None = None
    is_stale: bool = False


class MetricsOut(BaseModel):
    total_events: int
    succeeded: int
    failed: int
    dead_lettered: int
    retrying: int
    queued: int
    processing: int
    replay_requeued: int
    replay_success_rate: float
    active_workers: int
    stale_workers: int
    acknowledged_events: int = 0
    pending_events: int = 0
    stream_backlog: int = 0
    retrying_events: int = 0
    dlq_events: int = 0
    orphaned_records: int = 0
    duplicate_deliveries: int = 0
    duplicate_side_effects: int = 0
    recent_failures: int = 0
    convergence_state: str = "unknown"
    converged: bool = False
    worker_heartbeat_age_seconds: float | None = None
    processed_per_sec: float | None = None
    retry_queue_depth: int = 0
    incoming_stream_depth: int = 0
    retry_stream_depth: int = 0
    incoming_pending: int = 0
    retry_pending: int = 0
    replay_latency_ms: float | None = None
    event_attempt_failures: int = 0
    avg_attempt_duration_ms: float | None = None
    p50_attempt_duration_ms: float | None = None
    p95_attempt_duration_ms: float | None = None


class ConvergenceOut(BaseModel):
    total_events: int
    processed_events: int
    acknowledged_events: int
    received_events: int
    queued_events: int
    processing_events: int
    retrying_events: int
    dead_lettered_events: int
    pending_events: int
    retry_queue_depth: int
    retry_stream_depth: int
    incoming_stream_depth: int
    stream_backlog: int
    dlq_events: int
    orphaned_records: int
    duplicate_deliveries: int
    duplicate_side_effects: int
    recent_failures: int
    active_workers: int
    stale_workers: int
    worker_heartbeat_age_seconds: float | None = None
    convergence_state: str
    converged: bool
    convergence_issues: list[str] = Field(default_factory=list)
    verified_at: datetime


class IncidentSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: uuid.UUID
    workflow_id: str
    summary_text: str
    model_name: str | None = None
    created_at: datetime
