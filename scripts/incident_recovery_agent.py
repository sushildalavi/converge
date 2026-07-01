from __future__ import annotations

import argparse
import json
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class TraceStep:
    step_name: str
    input_summary: str
    tool_name: str | None
    tool_args_summary: str | None
    output_summary: str
    latency_ms: float | None
    status: str
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _record_step(
    trace: list[TraceStep],
    step_name: str,
    input_summary: str,
    output_summary: str,
    *,
    tool_name: str | None = None,
    tool_args_summary: str | None = None,
    status: str = "ok",
    error: str | None = None,
    latency_ms: float | None = None,
) -> None:
    trace.append(
        TraceStep(
            step_name=step_name,
            input_summary=input_summary,
            tool_name=tool_name,
            tool_args_summary=tool_args_summary,
            output_summary=output_summary,
            latency_ms=latency_ms,
            status=status,
            error=error,
        )
    )


def load_artifact(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def summarize_incident(artifact: dict[str, Any]) -> str:
    if artifact.get("status") != "measured":
        return "Benchmark run is pending; no live incident was measured."
    dead_letters = int(artifact.get("dead_letters") or 0)
    failed = int(artifact.get("events_failed") or 0)
    lag = int(artifact.get("redis_lag") or 0)
    if dead_letters > 0:
        return f"Measured run completed with {dead_letters} dead letter(s) and {failed} failed event(s)."
    if failed > 0:
        return f"Measured run completed with {failed} failed event(s) and redis lag of {lag}."
    if lag > 0:
        return f"Measured run completed with backlog remaining: redis lag {lag}."
    return "Measured run completed without dead letters or failures."


def analyze_stream_lag(artifact: dict[str, Any]) -> str:
    lag = int(artifact.get("redis_lag") or 0)
    pending = int(artifact.get("pending_entries") or 0)
    if lag > 0 or pending > 0:
        return f"stream backlog detected (redis_lag={lag}, pending_entries={pending})"
    return "no meaningful stream backlog detected"


def inspect_dead_letters(artifact: dict[str, Any]) -> str:
    dead_letters = int(artifact.get("dead_letters") or 0)
    failed = int(artifact.get("events_failed") or 0)
    if dead_letters > 0:
        return f"dead_letter_count={dead_letters}"
    if failed > 0:
        return f"failed_events={failed}"
    return "no dead letters detected"


def recommend_recovery_action(artifact: dict[str, Any], *, base_url: str | None = None) -> tuple[str, str]:
    status = artifact.get("status")
    dead_letters = int(artifact.get("dead_letters") or 0)
    failed = int(artifact.get("events_failed") or 0)
    lag = int(artifact.get("redis_lag") or 0)
    if status != "measured":
        if base_url:
            return f"Pending artifact: run the benchmark against the reachable API at {base_url} to produce a measured artifact.", "pending artifact"
        return "Pending artifact: run the benchmark locally against a reachable API to produce a measured artifact.", "pending artifact"
    if dead_letters > 0:
        return "Inspect the failing workflow, replay one dead letter, and confirm the queue drains.", "dead letters present"
    if failed > 0:
        return "Check worker health and retry logic, then rerun the benchmark after recovery.", "failed events present"
    if lag > 0:
        return "Scale workers or inspect the stream consumer group until backlog clears.", "redis lag present"
    return "No recovery action required beyond routine validation.", "no incident evidence"


def verify_recovery(artifact: dict[str, Any]) -> str:
    if artifact.get("status") != "measured":
        return "pending"
    if int(artifact.get("dead_letters") or 0) == 0 and int(artifact.get("events_failed") or 0) == 0:
        return "verified"
    return "needs_follow_up"


def analyze_incident(artifact: dict[str, Any], *, base_url: str | None = None) -> dict[str, Any]:
    run_id = uuid.uuid4().hex
    trace: list[TraceStep] = []

    t0 = time.perf_counter()
    incident_summary = summarize_incident(artifact)
    _record_step(
        trace,
        "Incident Summarizer Agent",
        input_summary=f"status={artifact.get('status')}",
        output_summary=incident_summary,
        tool_name="summarize_incident",
        tool_args_summary=f"run_id={run_id}",
        latency_ms=round((time.perf_counter() - t0) * 1000, 2),
    )

    t1 = time.perf_counter()
    stream_lag = analyze_stream_lag(artifact)
    _record_step(
        trace,
        "Stream Lag Analyzer",
        input_summary=f"redis_lag={artifact.get('redis_lag')}",
        output_summary=stream_lag,
        tool_name="analyze_stream_lag",
        tool_args_summary=None,
        latency_ms=round((time.perf_counter() - t1) * 1000, 2),
    )

    t2 = time.perf_counter()
    dead_letter_view = inspect_dead_letters(artifact)
    _record_step(
        trace,
        "Dead Letter Inspector",
        input_summary=f"dead_letters={artifact.get('dead_letters')}",
        output_summary=dead_letter_view,
        tool_name="inspect_dead_letters",
        tool_args_summary=None,
        latency_ms=round((time.perf_counter() - t2) * 1000, 2),
    )

    t3 = time.perf_counter()
    recovery_action, evidence = recommend_recovery_action(artifact, base_url=base_url)
    _record_step(
        trace,
        "Runbook Recommendation Agent",
        input_summary=evidence,
        output_summary=recovery_action,
        tool_name="recommend_recovery_action",
        tool_args_summary=f"base_url={base_url or 'none'}",
        latency_ms=round((time.perf_counter() - t3) * 1000, 2),
    )

    t4 = time.perf_counter()
    verification_status = verify_recovery(artifact)
    _record_step(
        trace,
        "Recovery Verification Agent",
        input_summary=f"status={artifact.get('status')}",
        output_summary=verification_status,
        tool_name="verify_recovery",
        tool_args_summary=None,
        latency_ms=round((time.perf_counter() - t4) * 1000, 2),
    )

    return {
        "run_id": run_id,
        "incident_summary": incident_summary,
        "suspected_cause": evidence,
        "evidence": {
            "status": artifact.get("status"),
            "events_submitted": artifact.get("events_submitted"),
            "events_completed": artifact.get("events_completed"),
            "events_failed": artifact.get("events_failed"),
            "dead_letters": artifact.get("dead_letters"),
            "redis_lag": artifact.get("redis_lag"),
            "pending_entries": artifact.get("pending_entries"),
            "throughput_events_per_sec": artifact.get("throughput_events_per_sec"),
            "base_url": base_url,
        },
        "recommended_recovery_action": recovery_action,
        "verification_status": verification_status,
        "trace": [step.to_dict() for step in trace],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Converge incident recovery agent.")
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--base-url", default="")
    parser.add_argument("--json", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    review = analyze_incident(load_artifact(Path(args.artifact)), base_url=args.base_url or None)
    if args.json:
        print(json.dumps(review, indent=2, sort_keys=True))
    else:
        print(review["recommended_recovery_action"])


if __name__ == "__main__":
    main()
