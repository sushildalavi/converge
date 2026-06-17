from __future__ import annotations

from argparse import Namespace
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.run_chaos_benchmark import build_artifact


def test_chaos_benchmark_artifact_schema():
    artifact = build_artifact(
        Namespace(
            events=10000,
            workers=4,
            kill_worker_at="",
            output_dir="benchmarks",
            artifact_name="",
            base_url="http://127.0.0.1:8000",
        )
    )
    assert artifact["status"] == "pending"
    assert artifact["events"] == 10000
    assert artifact["workers"] == 4
    assert artifact["base_url"] == "http://127.0.0.1:8000"
    assert "throughput_events_per_sec" in artifact


def test_chaos_benchmark_artifact_with_live_metrics():
    artifact = build_artifact(
        Namespace(
            events=100,
            workers=2,
            kill_worker_at="25",
            output_dir="benchmarks",
            artifact_name="bench",
            base_url="http://127.0.0.1:8000",
        ),
        live={
            "status": "measured",
            "events_submitted": 100,
            "events_completed": 98,
            "events_failed": 2,
            "dead_letters": 1,
            "duplicate_events": 0,
            "orphaned_records": 0,
            "redis_lag": 0,
            "pending_entries": 0,
            "reclaimed_entries": 0,
            "recovery_time_seconds": None,
            "throughput_events_per_sec": 42.0,
        },
    )
    assert artifact["status"] == "measured"
    assert artifact["events_submitted"] == 100
    assert artifact["throughput_events_per_sec"] == 42.0
