from __future__ import annotations

from scripts.incident_recovery_agent import analyze_incident


def test_worker_crash_artifact_produces_summary():
    artifact = {
        "status": "measured",
        "events_submitted": 100,
        "events_completed": 95,
        "events_failed": 5,
        "dead_letters": 2,
        "redis_lag": 10,
        "pending_entries": 0,
        "throughput_events_per_sec": 42.0,
    }

    result = analyze_incident(artifact)
    assert "dead letter" in result["incident_summary"].lower()
    assert result["verification_status"] == "needs_follow_up"
    assert result["trace"]


def test_pending_artifact_is_handled_gracefully():
    artifact = {"status": "pending", "dead_letters": 0, "events_failed": 0, "redis_lag": 0}

    result = analyze_incident(artifact)
    assert result["verification_status"] == "pending"
    assert "pending" in result["recommended_recovery_action"].lower()


def test_dead_letters_produce_runbook_recommendation():
    artifact = {
        "status": "measured",
        "events_submitted": 10,
        "events_completed": 8,
        "events_failed": 2,
        "dead_letters": 1,
        "redis_lag": 0,
        "pending_entries": 0,
    }

    result = analyze_incident(artifact)
    assert "replay" in result["recommended_recovery_action"].lower()
    assert result["trace"][0]["step_name"] == "Incident Summarizer Agent"
