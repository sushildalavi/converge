from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Protocol, TypedDict

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.core.convergence import build_convergence_report
from app.models import Event, Worker

log = logging.getLogger(__name__)

RecoveryResult = Literal["converged", "degraded", "failed", "insufficient_evidence"]
RecoveryArtifactKind = Literal["benchmark", "chaos", "convergence", "workflow", "custom"]


class RecoveryTimelineEntry(BaseModel):
    event: str
    impact: str


class RecoveryArtifactInput(BaseModel):
    kind: str = "custom"
    source: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class RecoveryPostmortemRequest(BaseModel):
    workflow_id: str | None = None
    artifact_paths: list[str] = Field(default_factory=list)
    workflow_snapshot: dict[str, Any] | None = None
    convergence_snapshot: dict[str, Any] | None = None
    worker_snapshot: dict[str, Any] | None = None
    provider: str | None = None
    model: str | None = None
    include_live_snapshot: bool = True


class RecoveryEvidenceBundle(BaseModel):
    workflow_id: str | None = None
    workflow_summary: dict[str, Any] | None = None
    artifacts: list[RecoveryArtifactInput] = Field(default_factory=list)
    convergence: dict[str, Any] | None = None
    workers: dict[str, Any] | None = None
    timeline: list[RecoveryTimelineEntry] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    enough_evidence: bool = True
    thin_reason: str | None = None


class RecoveryPostmortemOut(BaseModel):
    incident_summary: str
    recovery_result: RecoveryResult
    timeline: list[RecoveryTimelineEntry]
    evidence: list[str]
    risks: list[str]
    recommended_actions: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    resume_safe_summary: str

    @field_validator("evidence", "risks", "recommended_actions")
    @classmethod
    def _dedupe_strings(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for item in value:
            if item and item not in seen:
                seen.add(item)
                deduped.append(item)
        return deduped


class RecoveryAssessment(BaseModel):
    recovery_result: RecoveryResult
    incident_summary: str
    risks: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    resume_safe_summary: str


class RecoveryState(TypedDict, total=False):
    bundle: dict[str, Any]
    assessment: dict[str, Any]
    draft: dict[str, Any]
    output: dict[str, Any]
    errors: list[str]
    provider_name: str
    provider_model: str | None


class RecoveryPostmortemProvider(Protocol):
    name: str
    model_name: str | None

    def generate(self, bundle: RecoveryEvidenceBundle, assessment: RecoveryAssessment) -> RecoveryPostmortemOut: ...


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _append_unique(items: list[str], item: str) -> None:
    if item and item not in items:
        items.append(item)


def _infer_artifact_kind(source: str | None, payload: dict[str, Any]) -> RecoveryArtifactKind:
    src = (source or "").lower()
    keys = set(payload.keys())
    if "kill_delay_seconds" in keys or "pending_before_recovery" in keys or "killed_worker_id" in keys:
        return "chaos"
    if "ingest_throughput_events_per_sec" in keys or "submitted" in keys or "events" in keys:
        return "benchmark"
    if "convergence_state" in keys or "converged" in keys:
        return "convergence"
    if "workflow_id" in keys or "events" in keys and "timeline" in keys:
        return "workflow"
    if "chaos" in src:
        return "chaos"
    if "benchmark" in src:
        return "benchmark"
    return "custom"


def _artifact_summary(kind: str, source: str | None, payload: dict[str, Any]) -> tuple[str, RecoveryTimelineEntry | None, str | None]:
    label = source or kind
    if kind == "benchmark":
        submitted = _safe_int(payload.get("submitted", payload.get("events", 0)))
        completed = _safe_int(payload.get("completed", payload.get("events_completed", 0)))
        failed = _safe_int(payload.get("failed", payload.get("events_failed", 0)))
        dlq = _safe_int(payload.get("dead_letters", 0))
        pending = _safe_int(payload.get("pending_entries", 0))
        converged = bool(payload.get("converged", False))
        recovery = payload.get("recovery_time_seconds")
        ingest = payload.get("ingest_throughput_events_per_sec")
        end_to_end = payload.get("end_to_end_throughput_events_per_sec")
        summary = (
            f"Benchmark {label}: submitted={submitted}, completed={completed}, failed={failed}, "
            f"dead_letters={dlq}, pending={pending}, converged={converged}, recovery={recovery}, "
            f"ingest={ingest}, end_to_end={end_to_end}"
        )
        return summary, RecoveryTimelineEntry(event="benchmark run", impact=summary), "benchmark"
    if kind == "chaos":
        submitted = _safe_int(payload.get("submitted", payload.get("events", 0)))
        completed = _safe_int(payload.get("completed", payload.get("events_completed", 0)))
        failed = _safe_int(payload.get("failed", payload.get("events_failed", 0)))
        dlq = _safe_int(payload.get("dead_letters", 0))
        before = _safe_int(payload.get("pending_before_recovery", 0))
        after = _safe_int(payload.get("pending_after_recovery", 0))
        killed = payload.get("killed_worker_id")
        recovery = payload.get("recovery_time_seconds")
        summary = (
            f"Chaos {label}: submitted={submitted}, completed={completed}, failed={failed}, "
            f"dead_letters={dlq}, pending_before={before}, pending_after={after}, "
            f"killed_worker={killed}, recovery={recovery}"
        )
        return summary, RecoveryTimelineEntry(event="chaos interruption", impact=summary), "chaos"
    if kind == "workflow":
        workflow_id = payload.get("workflow_id") or label
        total = _safe_int(payload.get("total_events", len(payload.get("events", []))))
        dead = _safe_int(payload.get("dead_lettered", payload.get("dead_letters", 0)))
        failed = _safe_int(payload.get("failed", 0))
        succeeded = _safe_int(payload.get("succeeded", 0))
        summary = (
            f"Workflow {workflow_id}: events={total}, succeeded={succeeded}, failed={failed}, dead_lettered={dead}"
        )
        return summary, RecoveryTimelineEntry(event="workflow evidence", impact=summary), "workflow"
    if kind == "convergence":
        converged = bool(payload.get("converged", False))
        state = payload.get("convergence_state", "unknown")
        pending = _safe_int(payload.get("pending_events", 0))
        backlog = _safe_int(payload.get("stream_backlog", 0))
        retries = _safe_int(payload.get("retrying_events", 0))
        dlq = _safe_int(payload.get("dlq_events", 0))
        stale = _safe_int(payload.get("stale_workers", 0))
        heartbeat_age = payload.get("worker_heartbeat_age_seconds")
        summary = (
            f"Convergence snapshot: state={state}, converged={converged}, pending={pending}, "
            f"backlog={backlog}, retries={retries}, dlq={dlq}, stale_workers={stale}, heartbeat_age={heartbeat_age}"
        )
        return summary, RecoveryTimelineEntry(event="convergence check", impact=summary), "convergence"

    summary = f"Artifact {label}: {json.dumps(payload, sort_keys=True)[:500]}"
    return summary, RecoveryTimelineEntry(event="artifact evidence", impact=summary), "custom"


def _build_workflow_bundle(db: Session | None, workflow_id: str | None) -> tuple[dict[str, Any] | None, list[RecoveryTimelineEntry], list[str]]:
    if not db or not workflow_id:
        return None, [], []

    events = db.execute(
        select(Event).options(selectinload(Event.attempts)).where(Event.workflow_id == workflow_id).order_by(Event.created_at)
    ).scalars().all()

    if not events:
        return {
            "workflow_id": workflow_id,
            "events": 0,
            "succeeded": 0,
            "failed": 0,
            "dead_lettered": 0,
            "retrying": 0,
        }, [RecoveryTimelineEntry(event=f"workflow {workflow_id}", impact="No events were found for this workflow.")], [
            f"Workflow {workflow_id} has no events in PostgreSQL."
        ]

    succeeded = sum(1 for e in events if e.status == "succeeded")
    failed = sum(1 for e in events if e.status == "failed")
    dead = sum(1 for e in events if e.status == "dead_lettered")
    retrying = sum(1 for e in events if e.status == "retrying")
    in_flight = sum(1 for e in events if e.status in {"received", "queued", "processing"})
    latest = max(events, key=lambda e: e.updated_at or e.created_at)
    summary = {
        "workflow_id": workflow_id,
        "events": len(events),
        "succeeded": succeeded,
        "failed": failed,
        "dead_lettered": dead,
        "retrying": retrying,
        "in_flight": in_flight,
        "last_error": latest.last_error,
    }
    evidence = [
        f"Workflow {workflow_id} contains {len(events)} event(s): {succeeded} succeeded, {failed} failed, {dead} dead-lettered, {retrying} retrying.",
    ]
    if latest.last_error:
        evidence.append(f"Latest workflow error: {latest.last_error}")

    timeline: list[RecoveryTimelineEntry] = []
    for event in events[:5]:
        last_attempt = event.attempts[-1] if event.attempts else None
        attempt_text = f"{event.attempt_count} attempt(s)"
        if last_attempt and last_attempt.error_message:
            attempt_text += f", last error: {last_attempt.error_message}"
        timeline.append(
            RecoveryTimelineEntry(
                event=f"{event.event_type} -> {event.status}",
                impact=f"service={event.service_name}, {attempt_text}",
            )
        )

    return summary, timeline, evidence


def _build_live_bundle(db: Session | None) -> tuple[dict[str, Any] | None, list[str], list[RecoveryTimelineEntry], list[str], dict[str, Any] | None]:
    if not db:
        return None, [], [], [], None

    report = build_convergence_report(db).to_dict()
    workers = db.execute(select(Worker).order_by(Worker.last_heartbeat_at.desc())).scalars().all()
    now = _utcnow()
    stale_workers = 0
    for worker in workers:
        hb = worker.last_heartbeat_at
        if hb.tzinfo is None:
            hb = hb.replace(tzinfo=timezone.utc)
        if (now - hb).total_seconds() > settings.worker_stale_threshold:
            stale_workers += 1
    worker_payload = {
        "active_workers": report["active_workers"],
        "stale_workers": report["stale_workers"],
        "worker_heartbeat_age_seconds": report["worker_heartbeat_age_seconds"],
        "workers_total": len(workers),
        "stale_workers_by_status": stale_workers,
    }
    evidence = [
        f"Live convergence: state={report['convergence_state']}, converged={report['converged']}, pending={report['pending_events']}, retries={report['retrying_events']}, dlq={report['dlq_events']}, backlog={report['stream_backlog']}.",
        f"Worker health: active={report['active_workers']}, stale={report['stale_workers']}, heartbeat_age={report['worker_heartbeat_age_seconds']}.",
    ]
    timeline = [
        RecoveryTimelineEntry(
            event="live convergence snapshot",
            impact=f"{report['convergence_state']} with {report['pending_events']} pending and {report['stream_backlog']} backlog items.",
        ),
        RecoveryTimelineEntry(
            event="worker health snapshot",
            impact=f"{report['active_workers']} active worker(s), {report['stale_workers']} stale worker(s), heartbeat age {report['worker_heartbeat_age_seconds']}.",
        ),
    ]
    categories = ["convergence", "workers"]
    return report, evidence, timeline, categories, worker_payload


def _load_artifact_paths(paths: list[str]) -> list[RecoveryArtifactInput]:
    artifacts: list[RecoveryArtifactInput] = []
    for raw_path in paths:
        path = Path(raw_path).expanduser()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            artifacts.append(
                RecoveryArtifactInput(
                    kind="custom",
                    source=str(path),
                    payload={"status": "unreadable", "error": str(exc)},
                )
            )
            continue
        artifacts.append(
            RecoveryArtifactInput(
                kind=str(_infer_artifact_kind(path.name, payload)),
                source=str(path),
                payload=payload,
            )
        )
    return artifacts


def build_recovery_bundle(db: Session | None, request: RecoveryPostmortemRequest) -> RecoveryEvidenceBundle:
    artifacts = _load_artifact_paths(request.artifact_paths)
    if request.workflow_snapshot is not None:
        workflow_summary = request.workflow_snapshot
        workflow_timeline = [
            RecoveryTimelineEntry(event=f"workflow {request.workflow_id or workflow_summary.get('workflow_id', 'unknown')}", impact=f"Snapshot supplied with {workflow_summary.get('events', 0)} event(s).")
        ]
        workflow_evidence = [
            f"Workflow snapshot: {workflow_summary.get('events', 0)} event(s), {workflow_summary.get('succeeded', 0)} succeeded, {workflow_summary.get('failed', 0)} failed, {workflow_summary.get('dead_lettered', 0)} dead-lettered."
        ]
    else:
        workflow_summary, workflow_timeline, workflow_evidence = _build_workflow_bundle(db, request.workflow_id)
    if request.include_live_snapshot and request.convergence_snapshot is not None:
        convergence = request.convergence_snapshot
        convergence_evidence = [
            f"Live convergence snapshot: state={convergence.get('convergence_state', 'unknown')}, converged={convergence.get('converged', False)}, pending={convergence.get('pending_events', 0)}, retries={convergence.get('retrying_events', 0)}, dlq={convergence.get('dlq_events', 0)}, backlog={convergence.get('stream_backlog', 0)}.",
            f"Worker health snapshot: active={convergence.get('active_workers', 0)}, stale={convergence.get('stale_workers', 0)}, heartbeat_age={convergence.get('worker_heartbeat_age_seconds')}.",
        ]
        convergence_timeline = [
            RecoveryTimelineEntry(
                event="live convergence snapshot",
                impact=f"{convergence.get('convergence_state', 'unknown')} with {convergence.get('pending_events', 0)} pending and {convergence.get('stream_backlog', 0)} backlog items.",
            ),
            RecoveryTimelineEntry(
                event="worker health snapshot",
                impact=f"{convergence.get('active_workers', 0)} active worker(s), {convergence.get('stale_workers', 0)} stale worker(s), heartbeat age {convergence.get('worker_heartbeat_age_seconds')}.",
            ),
        ]
        categories = ["convergence", "workers"]
        workers = request.worker_snapshot
    else:
        convergence, convergence_evidence, convergence_timeline, categories, workers = _build_live_bundle(db) if request.include_live_snapshot else (None, [], [], [], None)
        if request.worker_snapshot is not None:
            workers = request.worker_snapshot

    evidence: list[str] = []
    timeline: list[RecoveryTimelineEntry] = []
    all_categories = set(categories)

    if workflow_summary:
        all_categories.add("workflow")
    if artifacts:
        all_categories.add("artifact")

    if workflow_timeline:
        timeline.extend(workflow_timeline)
    if workflow_evidence:
        evidence.extend(workflow_evidence)

    if convergence_evidence:
        evidence.extend(convergence_evidence)
    if convergence_timeline:
        timeline.extend(convergence_timeline)

    for artifact in artifacts:
        kind = str(_infer_artifact_kind(artifact.source, artifact.payload))
        summary, entry, category = _artifact_summary(kind, artifact.source, artifact.payload)
        evidence.append(summary)
        if entry:
            timeline.append(entry)
        if category:
            all_categories.add(category)

    if workflow_summary is None and not artifacts and convergence is None:
        thin_reason = "No benchmark, chaos, workflow, or live convergence evidence was supplied."
        return RecoveryEvidenceBundle(
            workflow_id=request.workflow_id,
            workflow_summary=None,
            artifacts=artifacts,
            convergence=None,
            workers=None,
            timeline=[RecoveryTimelineEntry(event="insufficient evidence", impact=thin_reason)],
            evidence=[thin_reason],
            categories=[],
            enough_evidence=False,
            thin_reason=thin_reason,
        )

    if workflow_summary:
        summary_text = (
            f"Workflow {workflow_summary['workflow_id']} had {workflow_summary['events']} event(s): "
            f"{workflow_summary['succeeded']} succeeded, {workflow_summary['failed']} failed, "
            f"{workflow_summary['dead_lettered']} dead-lettered."
        )
        evidence.insert(0, summary_text)
        timeline.insert(0, RecoveryTimelineEntry(event=f"workflow {workflow_summary['workflow_id']}", impact=summary_text))

    if convergence:
        evidence.insert(0, f"Convergence state is {convergence['convergence_state']} with {convergence['pending_events']} pending event(s).")

    if workers:
        evidence.append(
            f"Worker snapshot: active={workers['active_workers']}, stale={workers['stale_workers']}, heartbeat_age={workers['worker_heartbeat_age_seconds']}."
        )

    deduped_evidence: list[str] = []
    for item in evidence:
        _append_unique(deduped_evidence, item)

    if not timeline:
        timeline = [RecoveryTimelineEntry(event="evidence collection", impact=deduped_evidence[0] if deduped_evidence else "No evidence.")]

    enough_evidence = bool(deduped_evidence and (workflow_summary or convergence or artifacts))
    thin_reason = None if enough_evidence else "Evidence is too thin to produce a grounded postmortem."

    return RecoveryEvidenceBundle(
        workflow_id=request.workflow_id,
        workflow_summary=workflow_summary,
        artifacts=artifacts,
        convergence=convergence,
        workers=workers,
        timeline=timeline[:8],
        evidence=deduped_evidence[:16],
        categories=sorted(all_categories),
        enough_evidence=enough_evidence,
        thin_reason=thin_reason,
    )


def _confidence_from_bundle(bundle: RecoveryEvidenceBundle, result: RecoveryResult) -> float:
    categories = set(bundle.categories)
    coverage = min(len(categories), 5) / 5.0
    base = 0.35 + coverage * 0.3
    if bundle.workflow_id:
        base += 0.05
    if bundle.artifacts:
        base += 0.1
    if result == "converged":
        base += 0.15
    elif result == "degraded":
        base += 0.05
    elif result == "failed":
        base -= 0.05
    return round(min(max(base, 0.05 if not bundle.enough_evidence else 0.15), 0.95), 2)


def _assessment_from_bundle(bundle: RecoveryEvidenceBundle) -> RecoveryAssessment:
    if not bundle.enough_evidence:
        summary = bundle.thin_reason or "Evidence is too thin to classify the recovery."
        return RecoveryAssessment(
            recovery_result="insufficient_evidence",
            incident_summary=summary,
            risks=[summary],
            recommended_actions=["Collect a benchmark or chaos artifact, then rerun the postmortem."],
            confidence=0.0,
            resume_safe_summary="Do not resume based on this report alone; the evidence is too thin.",
        )

    conv = bundle.convergence or {}
    workflow = bundle.workflow_summary or {}
    artifact_failed = 0
    artifact_dead = 0
    artifact_pending = 0
    artifact_retries = 0
    artifact_converged = False
    for artifact in bundle.artifacts:
        payload = artifact.payload
        artifact_failed_one = _safe_int(payload.get("failed", payload.get("events_failed", 0)))
        artifact_dead_one = _safe_int(payload.get("dead_letters", payload.get("dlq_events", 0)))
        artifact_pending_one = _safe_int(payload.get("pending_entries", payload.get("pending_before_recovery", 0)))
        artifact_pending_one += _safe_int(payload.get("pending_after_recovery", 0))
        artifact_retries_one = _safe_int(payload.get("retries", payload.get("retrying_events", 0)))
        artifact_converged_one = bool(payload.get("converged", False)) or payload.get("convergence_state") == "converged"
        artifact_converged_one = artifact_converged_one or payload.get("status") == "measured" and artifact_pending_one == 0 and artifact_failed_one == 0 and artifact_dead_one == 0
        artifact_failed += artifact_failed_one
        artifact_dead += artifact_dead_one
        artifact_pending += artifact_pending_one
        artifact_retries += artifact_retries_one
        artifact_converged = artifact_converged or artifact_converged_one
    pending = _safe_int(conv.get("pending_events", 0))
    retries = _safe_int(conv.get("retrying_events", 0))
    dlq = _safe_int(conv.get("dlq_events", 0))
    stale = _safe_int(conv.get("stale_workers", 0))
    orphaned = _safe_int(conv.get("orphaned_records", 0))
    duplicate = _safe_int(conv.get("duplicate_side_effects", 0))
    failed = _safe_int(workflow.get("failed", 0))
    dead = _safe_int(workflow.get("dead_lettered", 0))
    converged = bool(conv.get("converged", False))

    observed_converged = converged or artifact_converged
    observed_failed = failed + dead + artifact_failed + artifact_dead
    observed_pending = pending + retries + artifact_pending + artifact_retries

    if not observed_converged and observed_failed > 0:
        result: RecoveryResult = "failed"
    elif not observed_converged and (observed_pending > 0 or orphaned > 0 or duplicate > 0 or dlq > 0):
        result = "degraded"
    elif observed_converged and observed_failed > 0:
        result = "degraded"
    elif observed_converged:
        result = "converged"
    else:
        result = "degraded"

    incident_summary_parts = []
    if bundle.workflow_id:
        incident_summary_parts.append(f"Workflow {bundle.workflow_id}")
    if workflow:
        incident_summary_parts.append(
            f"{workflow.get('events', 0)} event(s), {workflow.get('succeeded', 0)} succeeded, {workflow.get('dead_lettered', 0)} dead-lettered"
        )
    if conv:
        incident_summary_parts.append(
            f"convergence state {conv.get('convergence_state', 'unknown')} with {pending} pending and {dlq} DLQ event(s)"
        )
    if bundle.artifacts:
        incident_summary_parts.append(
            f"{len(bundle.artifacts)} artifact(s) supplied with {artifact_failed} failed, {artifact_dead} dead-lettered, and {artifact_pending} pending signal(s)"
        )
    if not incident_summary_parts:
        incident_summary_parts.append("System-level recovery evidence")

    risks: list[str] = []
    if stale > 0:
        risks.append(f"{stale} stale worker(s) still need heartbeat attention.")
    if retries > 0 or artifact_retries > 0:
        risks.append(f"{retries + artifact_retries} event(s) are still waiting on retry.")
    if dlq > 0 or dead > 0 or artifact_dead > 0:
        risks.append(f"DLQ activity remains visible ({dlq + dead + artifact_dead} event(s)).")
    if orphaned > 0:
        risks.append(f"{orphaned} orphaned claim(s) were observed.")
    if duplicate > 0:
        risks.append(f"{duplicate} duplicate side effect(s) were detected.")
    if artifact_pending > 0:
        risks.append(f"{artifact_pending} artifact-pending signal(s) indicate the harness did not fully drain.")
    if not risks and result == "converged":
        risks.append("Recovery converged, but keep an eye on recent failures and stale worker age.")
    if not risks:
        risks.append("Evidence is incomplete and should be rechecked before promotion.")

    actions: list[str] = []
    if result == "converged":
        actions.append("Resume normal traffic, but keep worker heartbeat monitoring in place.")
    else:
        actions.append("Investigate the remaining retry, DLQ, or stale-worker signals before resuming.")
    if dlq > 0 or dead > 0 or artifact_dead > 0:
        actions.append("Replay dead letters only after validating the downstream dependency is healthy.")
    if stale > 0:
        actions.append("Restart or replace the stale worker(s) and confirm the heartbeat age falls.")
    if pending > 0 or retries > 0 or artifact_pending > 0 or artifact_retries > 0:
        actions.append("Rerun the benchmark or chaos harness once the queue drains.")

    resume_safe_summary = (
        "Safe to resume with monitoring."
        if result == "converged"
        else "Do not resume yet; recovery signals are still incomplete."
    )
    confidence = _confidence_from_bundle(bundle, result)

    return RecoveryAssessment(
        recovery_result=result,
        incident_summary=". ".join(incident_summary_parts),
        risks=risks,
        recommended_actions=actions,
        confidence=confidence,
        resume_safe_summary=resume_safe_summary,
    )


def _assemble_postmortem(bundle: RecoveryEvidenceBundle, assessment: RecoveryAssessment) -> RecoveryPostmortemOut:
    timeline = bundle.timeline[:8] or [RecoveryTimelineEntry(event="evidence collection", impact=assessment.incident_summary)]
    evidence = bundle.evidence[:16] if bundle.evidence else [assessment.incident_summary]
    return RecoveryPostmortemOut(
        incident_summary=assessment.incident_summary,
        recovery_result=assessment.recovery_result,
        timeline=timeline,
        evidence=evidence,
        risks=assessment.risks,
        recommended_actions=assessment.recommended_actions,
        confidence=assessment.confidence,
        resume_safe_summary=assessment.resume_safe_summary,
    )


class DisabledRecoveryPostmortemProvider:
    name = "disabled"
    model_name = None

    def generate(self, bundle: RecoveryEvidenceBundle, assessment: RecoveryAssessment) -> RecoveryPostmortemOut:
        return _assemble_postmortem(bundle, assessment)


class FakeRecoveryPostmortemProvider(DisabledRecoveryPostmortemProvider):
    name = "fake"


class OllamaRecoveryPostmortemProvider:
    def __init__(self, model_name: str | None = None, fallback_model_name: str | None = None, base_url: str | None = None, timeout_seconds: int | None = None):
        self.name = "ollama"
        self.model_name = model_name or settings.ai_model
        self.fallback_model_name = fallback_model_name or settings.ai_fallback_model
        self.base_url = base_url or settings.ollama_base_url
        self.timeout_seconds = timeout_seconds or settings.ai_timeout_seconds

    def _build_chain(self, model_name: str):
        from langchain_ollama import ChatOllama

        parser = PydanticOutputParser(pydantic_object=RecoveryPostmortemOut)
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are the Recovery Postmortem Generator for Converge. Produce an incident-style postmortem grounded only in the evidence. "
                    "Do not invent numbers. If the evidence is too thin, return recovery_result='insufficient_evidence'.",
                ),
                (
                    "human",
                    "Assessment:\n{assessment}\n\nEvidence bundle:\n{bundle}\n\n{format_instructions}",
                ),
            ]
        )
        model = ChatOllama(
            model=model_name,
            base_url=self.base_url,
            timeout=self.timeout_seconds,
            temperature=0,
        )
        return prompt | model | parser

    def generate(self, bundle: RecoveryEvidenceBundle, assessment: RecoveryAssessment) -> RecoveryPostmortemOut:
        last_error: Exception | None = None
        payload = {
            "assessment": json.dumps(assessment.model_dump(mode="json"), indent=2, sort_keys=True),
            "bundle": json.dumps(bundle.model_dump(mode="json"), indent=2, sort_keys=True),
            "format_instructions": PydanticOutputParser(pydantic_object=RecoveryPostmortemOut).get_format_instructions(),
        }
        for model_name in [self.model_name, self.fallback_model_name]:
            try:
                chain = self._build_chain(model_name)
                result = _call_with_timeout(lambda: chain.invoke(payload), self.timeout_seconds)
                if isinstance(result, RecoveryPostmortemOut):
                    return result
                return RecoveryPostmortemOut.model_validate(result)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                log.warning("ollama postmortem model %s failed: %s", model_name, exc)
                continue
        if last_error:
            raise last_error
        raise RuntimeError("ollama postmortem failed without a specific error")


def _call_with_timeout(fn, timeout_seconds: int):
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(fn)
        try:
            return future.result(timeout=timeout_seconds)
        except FuturesTimeoutError as exc:
            future.cancel()
            raise TimeoutError(f"postmortem generation timed out after {timeout_seconds}s") from exc


def _provider_for_name(provider_name: str | None, model_name: str | None = None) -> RecoveryPostmortemProvider:
    name = (provider_name or settings.ai_provider or "disabled").strip().lower()
    if name in {"", "disabled", "off", "none"}:
        return DisabledRecoveryPostmortemProvider()
    if name == "fake":
        return FakeRecoveryPostmortemProvider()
    if name == "ollama":
        return OllamaRecoveryPostmortemProvider(model_name=model_name or settings.ai_model)
    raise ValueError(f"unknown AI provider: {provider_name}")


def _build_graph(provider: RecoveryPostmortemProvider):
    graph = StateGraph(RecoveryState)

    def collect_recovery_evidence(state: RecoveryState) -> RecoveryState:
        bundle = RecoveryEvidenceBundle.model_validate(state["bundle"])
        return {"bundle": bundle.model_dump(mode="json"), "errors": state.get("errors", [])}

    def summarize_timeline(state: RecoveryState) -> RecoveryState:
        bundle = RecoveryEvidenceBundle.model_validate(state["bundle"])
        if not bundle.timeline and bundle.evidence:
            bundle.timeline = [
                RecoveryTimelineEntry(event="evidence collection", impact=bundle.evidence[0]),
            ]
        return {"bundle": bundle.model_dump(mode="json"), "errors": state.get("errors", [])}

    def assess_convergence(state: RecoveryState) -> RecoveryState:
        bundle = RecoveryEvidenceBundle.model_validate(state["bundle"])
        assessment = _assessment_from_bundle(bundle)
        return {"bundle": bundle.model_dump(mode="json"), "assessment": assessment.model_dump(mode="json"), "errors": state.get("errors", [])}

    def identify_risks(state: RecoveryState) -> RecoveryState:
        bundle = RecoveryEvidenceBundle.model_validate(state["bundle"])
        assessment = RecoveryAssessment.model_validate(state["assessment"])
        if bundle.convergence and bundle.convergence.get("worker_heartbeat_age_seconds") is not None:
            age = _safe_float(bundle.convergence.get("worker_heartbeat_age_seconds"))
            if age > 60 and "heartbeat" not in " ".join(assessment.risks).lower():
                assessment.risks.append(f"Worker heartbeat age is {age:.1f}s; stale worker recovery may be pending.")
        return {"bundle": bundle.model_dump(mode="json"), "assessment": assessment.model_dump(mode="json"), "errors": state.get("errors", [])}

    def generate_postmortem(state: RecoveryState) -> RecoveryState:
        bundle = RecoveryEvidenceBundle.model_validate(state["bundle"])
        assessment = RecoveryAssessment.model_validate(state["assessment"])
        try:
            draft = _call_with_timeout(lambda: provider.generate(bundle, assessment), settings.ai_timeout_seconds)
            if isinstance(draft, RecoveryPostmortemOut):
                draft_model = draft
            else:
                draft_model = RecoveryPostmortemOut.model_validate(draft)
            return {
                "bundle": bundle.model_dump(mode="json"),
                "assessment": assessment.model_dump(mode="json"),
                "draft": draft_model.model_dump(mode="json"),
                "provider_name": provider.name,
                "provider_model": getattr(provider, "model_name", None),
                "errors": state.get("errors", []),
            }
        except Exception as exc:  # noqa: BLE001
            fallback = _assemble_postmortem(bundle, assessment)
            errors = state.get("errors", []) + [str(exc)]
            return {
                "bundle": bundle.model_dump(mode="json"),
                "assessment": assessment.model_dump(mode="json"),
                "draft": fallback.model_dump(mode="json"),
                "provider_name": "fake",
                "provider_model": None,
                "errors": errors,
            }

    def validate_schema(state: RecoveryState) -> RecoveryState:
        bundle = RecoveryEvidenceBundle.model_validate(state["bundle"])
        assessment = RecoveryAssessment.model_validate(state["assessment"])
        try:
            output = RecoveryPostmortemOut.model_validate(state["draft"])
        except ValidationError:
            output = _assemble_postmortem(bundle, assessment)
        return {
            "bundle": bundle.model_dump(mode="json"),
            "assessment": assessment.model_dump(mode="json"),
            "output": output.model_dump(mode="json"),
            "provider_name": state.get("provider_name", provider.name),
            "provider_model": state.get("provider_model", getattr(provider, "model_name", None)),
            "errors": state.get("errors", []),
        }

    def verify_evidence_grounding(state: RecoveryState) -> RecoveryState:
        bundle = RecoveryEvidenceBundle.model_validate(state["bundle"])
        output = RecoveryPostmortemOut.model_validate(state["output"])
        grounded_evidence = [item for item in output.evidence if item in bundle.evidence]
        if not grounded_evidence:
            grounded_evidence = bundle.evidence[: len(output.evidence) or 1]
        if not grounded_evidence:
            grounded_evidence = [bundle.thin_reason or "No grounded evidence available."]

        if bundle.thin_reason:
            output = output.model_copy(update={
                "recovery_result": "insufficient_evidence",
                "incident_summary": bundle.thin_reason,
                "confidence": 0.0,
                "risks": [bundle.thin_reason],
                "recommended_actions": ["Collect benchmark or chaos evidence, then rerun the postmortem."],
                "resume_safe_summary": "Do not resume based on this report alone; the evidence is too thin.",
                "evidence": grounded_evidence,
                "timeline": bundle.timeline[:8] or [RecoveryTimelineEntry(event="insufficient evidence", impact=bundle.thin_reason)],
            })
        else:
            output = output.model_copy(update={
                "evidence": grounded_evidence,
                "timeline": bundle.timeline[:8] or output.timeline,
            })

        return {
            "bundle": bundle.model_dump(mode="json"),
            "output": output.model_dump(mode="json"),
            "provider_name": state.get("provider_name", provider.name),
            "provider_model": state.get("provider_model", getattr(provider, "model_name", None)),
            "errors": state.get("errors", []),
        }

    graph.add_node("collect_recovery_evidence", collect_recovery_evidence)
    graph.add_node("summarize_timeline", summarize_timeline)
    graph.add_node("assess_convergence", assess_convergence)
    graph.add_node("identify_risks", identify_risks)
    graph.add_node("generate_postmortem", generate_postmortem)
    graph.add_node("validate_schema", validate_schema)
    graph.add_node("verify_evidence_grounding", verify_evidence_grounding)
    graph.add_edge(START, "collect_recovery_evidence")
    graph.add_edge("collect_recovery_evidence", "summarize_timeline")
    graph.add_edge("summarize_timeline", "assess_convergence")
    graph.add_edge("assess_convergence", "identify_risks")
    graph.add_edge("identify_risks", "generate_postmortem")
    graph.add_edge("generate_postmortem", "validate_schema")
    graph.add_edge("validate_schema", "verify_evidence_grounding")
    graph.add_edge("verify_evidence_grounding", END)
    return graph.compile()


def generate_recovery_postmortem(
    db: Session | None,
    request: RecoveryPostmortemRequest | None = None,
) -> RecoveryPostmortemOut:
    req = request or RecoveryPostmortemRequest()
    bundle = build_recovery_bundle(db, req)
    provider = _provider_for_name(req.provider, req.model)
    graph = _build_graph(provider)
    state = graph.invoke({"bundle": bundle.model_dump(mode="json"), "errors": []})
    output = RecoveryPostmortemOut.model_validate(state["output"])
    if not output.evidence:
        output = output.model_copy(update={"evidence": bundle.evidence[:8]})
    if not output.timeline:
        output = output.model_copy(update={"timeline": bundle.timeline[:8]})
    return output
