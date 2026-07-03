from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from app.core.recovery_postmortem import (
    RecoveryPostmortemOut,
    RecoveryPostmortemRequest,
    generate_recovery_postmortem,
)


@dataclass(frozen=True)
class EvaluationCase:
    name: str
    expected: str
    artifacts: list[dict[str, Any]]
    workflow_snapshot: dict[str, Any] | None = None
    convergence_snapshot: dict[str, Any] | None = None
    worker_snapshot: dict[str, Any] | None = None
    include_live_snapshot: bool = False
    target_evidence: int = 3


CASES = [
    EvaluationCase(
        name="converged",
        expected="converged",
        artifacts=[
            {
                "kind": "benchmark",
                "source": "benchmark_replay_1k.json",
                "payload": {
                    "status": "measured",
                    "events": 1000,
                    "submitted": 1000,
                    "completed": 1000,
                    "failed": 0,
                    "dead_letters": 0,
                    "pending_entries": 0,
                    "converged": True,
                    "recovery_time_seconds": 12.4,
                    "ingest_throughput_events_per_sec": 104.2,
                    "end_to_end_throughput_events_per_sec": 66.8,
                },
            },
            {
                "kind": "chaos",
                "source": "chaos_replay_1k.json",
                "payload": {
                    "status": "measured",
                    "events": 1000,
                    "submitted": 1000,
                    "completed": 1000,
                    "failed": 0,
                    "dead_letters": 0,
                    "pending_before_recovery": 0,
                    "pending_after_recovery": 0,
                    "converged": True,
                    "recovery_time_seconds": 18.1,
                },
            },
        ],
    ),
    EvaluationCase(
        name="degraded",
        expected="degraded",
        artifacts=[
            {
                "kind": "benchmark",
                "source": "benchmark_replay_degraded.json",
                "payload": {
                    "status": "measured",
                    "events": 1000,
                    "submitted": 1000,
                    "completed": 700,
                    "failed": 0,
                    "dead_letters": 0,
                    "pending_entries": 18,
                    "retries": 24,
                    "converged": False,
                    "recovery_time_seconds": 95.2,
                },
            }
        ],
        convergence_snapshot={
            "convergence_state": "recovering",
            "converged": False,
            "pending_events": 18,
            "retrying_events": 24,
            "dlq_events": 0,
            "stream_backlog": 32,
            "stale_workers": 1,
            "worker_heartbeat_age_seconds": 88.0,
        },
        include_live_snapshot=True,
    ),
    EvaluationCase(
        name="failed",
        expected="failed",
        artifacts=[
            {
                "kind": "chaos",
                "source": "chaos_replay_failed.json",
                "payload": {
                    "status": "measured",
                    "events": 1000,
                    "submitted": 1000,
                    "completed": 820,
                    "failed": 12,
                    "dead_letters": 8,
                    "pending_before_recovery": 44,
                    "pending_after_recovery": 22,
                    "converged": False,
                    "recovery_time_seconds": None,
                },
            }
        ],
    ),
    EvaluationCase(
        name="insufficient_evidence",
        expected="insufficient_evidence",
        artifacts=[],
        include_live_snapshot=False,
        target_evidence=1,
    ),
]


def _write_artifacts(tmpdir: Path, artifacts: list[dict[str, Any]]) -> list[str]:
    paths: list[str] = []
    for idx, artifact in enumerate(artifacts):
        path = tmpdir / f"{artifact['source'] or f'artifact-{idx}.json'}"
        path.write_text(json.dumps(artifact["payload"], indent=2, sort_keys=True) + "\n", encoding="utf-8")
        paths.append(str(path))
    return paths


def _build_case(case: EvaluationCase, tmpdir: Path) -> dict[str, Any]:
    artifact_paths = _write_artifacts(tmpdir, case.artifacts)
    request = RecoveryPostmortemRequest(
        artifact_paths=artifact_paths,
        workflow_snapshot=case.workflow_snapshot,
        convergence_snapshot=case.convergence_snapshot,
        worker_snapshot=case.worker_snapshot,
        provider="fake",
        include_live_snapshot=case.include_live_snapshot,
    )
    started = time.perf_counter()
    report = generate_recovery_postmortem(None, request)
    elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
    schema_ok = RecoveryPostmortemOut.model_validate(report.model_dump())
    evidence_coverage = round(min(len(report.evidence) / max(case.target_evidence, 1), 1.0), 2)
    return {
        "case": case.name,
        "expected": case.expected,
        "actual": report.recovery_result,
        "schema_valid": bool(schema_ok),
        "classification_ok": report.recovery_result == case.expected,
        "evidence_coverage": evidence_coverage,
        "latency_ms": elapsed_ms,
        "insufficient_evidence": report.recovery_result == "insufficient_evidence",
        "confidence": report.confidence,
    }


def build_evaluation_summary() -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        results = [_build_case(case, tmpdir) for case in CASES]
    schema_valid_rate = round(sum(1 for r in results if r["schema_valid"]) / len(results), 2)
    classification_rate = round(sum(1 for r in results if r["classification_ok"]) / len(results), 2)
    avg_latency_ms = round(sum(r["latency_ms"] for r in results) / len(results), 2)
    avg_coverage = round(sum(r["evidence_coverage"] for r in results) / len(results), 2)
    insufficient_ok = any(r["case"] == "insufficient_evidence" and r["insufficient_evidence"] for r in results)
    return {
        "status": "ok",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "schema_valid_output_rate": schema_valid_rate,
        "correct_recovery_classification_rate": classification_rate,
        "evidence_coverage": avg_coverage,
        "average_latency_ms": avg_latency_ms,
        "insufficient_evidence_behavior": insufficient_ok,
        "cases": results,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate the recovery postmortem generator.")
    parser.add_argument("--output-dir", default="postmortem-evaluations")
    parser.add_argument("--artifact-name", default="")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    artifact_name = args.artifact_name or f"postmortem_eval_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    json_path = output_dir / f"{artifact_name}.json"

    summary = build_evaluation_summary()
    json_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json_path)


if __name__ == "__main__":
    main()
