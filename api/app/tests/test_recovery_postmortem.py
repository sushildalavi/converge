from __future__ import annotations

import json
import time
from argparse import Namespace
from pathlib import Path
import sys
from unittest.mock import patch

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.recovery_postmortem import (
    RecoveryPostmortemRequest,
    generate_recovery_postmortem,
)
from app.database import get_db
from app.main import app
from scripts.evaluate_postmortem import build_evaluation_summary
from scripts.generate_postmortem import run_postmortem


def _client(db):
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=True)


def _write_artifact(tmp_path: Path, name: str, payload: dict) -> str:
    path = tmp_path / name
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return str(path)


def test_fake_provider_success_from_evidence(tmp_path):
    benchmark = _write_artifact(
        tmp_path,
        "benchmark_replay.json",
        {
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
    )
    chaos = _write_artifact(
        tmp_path,
        "chaos_replay.json",
        {
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
    )
    report = generate_recovery_postmortem(
        None,
        RecoveryPostmortemRequest(
            workflow_id="wf-1",
            workflow_snapshot={
                "workflow_id": "wf-1",
                "events": 4,
                "succeeded": 4,
                "failed": 0,
                "dead_lettered": 0,
                "retrying": 0,
            },
            convergence_snapshot={
                "convergence_state": "converged",
                "converged": True,
                "pending_events": 0,
                "retrying_events": 0,
                "dlq_events": 0,
                "stream_backlog": 0,
                "stale_workers": 0,
                "worker_heartbeat_age_seconds": 4.0,
            },
            artifact_paths=[benchmark, chaos],
            provider="fake",
            include_live_snapshot=False,
        ),
    )

    assert report.recovery_result == "converged"
    assert report.confidence > 0.7
    assert report.timeline
    assert any("benchmark" in item.event.lower() for item in report.timeline)
    assert "workflow" in report.incident_summary.lower()


def test_insufficient_evidence_returns_insufficient_result():
    report = generate_recovery_postmortem(
        None,
        RecoveryPostmortemRequest(provider="fake", include_live_snapshot=False),
    )

    assert report.recovery_result == "insufficient_evidence"
    assert report.confidence == 0.0
    assert "too thin" in report.resume_safe_summary.lower()


def test_invalid_model_json_falls_back_to_fake(tmp_path):
    benchmark = _write_artifact(
        tmp_path,
        "benchmark.json",
        {
            "status": "measured",
            "events": 100,
            "submitted": 100,
            "completed": 95,
            "failed": 0,
            "dead_letters": 0,
            "pending_entries": 0,
            "converged": True,
            "recovery_time_seconds": 5.1,
        },
    )

    with patch("app.core.recovery_postmortem.FakeRecoveryPostmortemProvider.generate", side_effect=ValueError("invalid JSON")):
        report = generate_recovery_postmortem(
            None,
            RecoveryPostmortemRequest(
                artifact_paths=[benchmark],
                provider="fake",
                include_live_snapshot=False,
            ),
        )

    assert report.recovery_result == "converged"
    assert report.evidence


def test_timeout_fallback(tmp_path, monkeypatch):
    benchmark = _write_artifact(
        tmp_path,
        "benchmark.json",
        {
            "status": "measured",
            "events": 100,
            "submitted": 100,
            "completed": 100,
            "failed": 0,
            "dead_letters": 0,
            "pending_entries": 0,
            "converged": True,
            "recovery_time_seconds": 5.1,
        },
    )

    def _slow(*_args, **_kwargs):
        time.sleep(0.2)
        return None

    monkeypatch.setattr("app.core.recovery_postmortem.settings.ai_timeout_seconds", 0.01)
    with patch("app.core.recovery_postmortem.FakeRecoveryPostmortemProvider.generate", side_effect=_slow):
        report = generate_recovery_postmortem(
            None,
            RecoveryPostmortemRequest(
                artifact_paths=[benchmark],
                provider="fake",
                include_live_snapshot=False,
            ),
        )

    assert report.recovery_result == "converged"
    assert report.confidence > 0


def test_degraded_and_failed_postmortems_from_artifacts(tmp_path):
    degraded_artifact = _write_artifact(
        tmp_path,
        "benchmark_degraded.json",
        {
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
    )
    failed_artifact = _write_artifact(
        tmp_path,
        "chaos_failed.json",
        {
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
    )

    degraded = generate_recovery_postmortem(
        None,
        RecoveryPostmortemRequest(artifact_paths=[degraded_artifact], provider="fake", include_live_snapshot=False),
    )
    failed = generate_recovery_postmortem(
        None,
        RecoveryPostmortemRequest(artifact_paths=[failed_artifact], provider="fake", include_live_snapshot=False),
    )

    assert degraded.recovery_result == "degraded"
    assert failed.recovery_result == "failed"
    assert degraded.risks
    assert failed.risks


def test_endpoint_behavior(db, tmp_path):
    benchmark = _write_artifact(
        tmp_path,
        "benchmark_endpoint.json",
        {
            "status": "measured",
            "events": 50,
            "submitted": 50,
            "completed": 50,
            "failed": 0,
            "dead_letters": 0,
            "pending_entries": 0,
            "converged": True,
            "recovery_time_seconds": 4.2,
        },
    )
    client = _client(db)
    try:
        response = client.post(
            "/api/ai/recovery-postmortem",
            json={
                "artifact_paths": [benchmark],
                "provider": "fake",
                "include_live_snapshot": False,
            },
        )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 200
    body = response.json()
    assert body["recovery_result"] == "converged"
    assert body["timeline"]


def test_cli_behavior(tmp_path):
    benchmark = _write_artifact(
        tmp_path,
        "benchmark_cli.json",
        {
            "status": "measured",
            "events": 25,
            "submitted": 25,
            "completed": 25,
            "failed": 0,
            "dead_letters": 0,
            "pending_entries": 0,
            "converged": True,
            "recovery_time_seconds": 1.2,
        },
    )
    report = run_postmortem(
        Namespace(
            artifact=[benchmark],
            workflow_id="",
            provider="fake",
            model="",
            base_url="",
            output_dir=str(tmp_path),
            artifact_name="",
            no_live_snapshot=True,
        )
    )

    assert report.recovery_result == "converged"
    assert report.timeline


def test_evaluation_harness_summary():
    summary = build_evaluation_summary()

    assert summary["status"] == "ok"
    assert summary["schema_valid_output_rate"] == 1.0
    assert summary["insufficient_evidence_behavior"] is True
    assert summary["correct_recovery_classification_rate"] >= 0.75
