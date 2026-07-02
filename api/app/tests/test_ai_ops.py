from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.ai_ops import (
    compare_traces,
    deterministic_fake_llm_judge,
    exact_match_verdict,
    json_schema_verdict,
    select_judge_provider,
)
from app.database import get_db
from app.main import app
from app.models import EventOutbox


def _client(db):
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=True)


def test_exact_match_and_schema_evaluators_are_deterministic():
    exact = exact_match_verdict("same", "same")
    schema = json_schema_verdict({"a": 1, "b": "x"}, {"required": ["a", "b"], "properties": {"a": {"type": "object"}}})
    judge_a = deterministic_fake_llm_judge("prompt", "response", "rubric")
    judge_b = deterministic_fake_llm_judge("prompt", "response", "rubric")

    assert exact["verdict"] == "pass"
    assert schema["verdict"] == "fail"
    assert judge_a == judge_b


def test_trace_comparison_and_provider_fallback():
    comparison = compare_traces(
        {"steps": [{"tool_name": "retrieval.search"}], "output": "one", "verdict": "pass", "failure_category": None},
        {"steps": [{"tool_name": "retrieval.search"}, {"tool_name": "llm.summarize"}], "output": "two", "verdict": "review", "failure_category": "schema_validation"},
    )
    provider = select_judge_provider()

    assert comparison["replay_confidence"] < 1.0
    assert comparison["tool_sequence_diff_json"]["added"] == ["llm.summarize"]
    assert provider.name == "fake"


def test_failed_publish_creates_recoverable_outbox_row(db):
    payload = {
        "application_name": "demo",
        "workflow_id": "wf-ai-1",
        "event_type": "agent.summarize",
        "service_name": "ai-agent",
        "idempotency_key": "wf-ai-1-step-1",
        "payload": {"text": "hello"},
        "metadata": {"mode": "ai-agent"},
        "agent_run_id": "agent-run-1",
        "step_id": "step-1",
        "tool_name": "llm.summarize",
        "model_name": "gpt-4o-mini",
        "provider_name": "fake",
        "prompt_hash": "abc",
        "system_prompt_hash": "def",
        "input_tokens": 12,
        "output_tokens": 8,
        "trace_status": "recorded",
        "evaluation_status": "pending",
        "replay_confidence": 0.5,
        "original_output_hash": "1",
        "replayed_output_hash": "2",
        "tool_call_args_hash": "3",
        "tool_call_result_hash": "4",
        "structured_output_valid": True,
        "failure_category": "tool_timeout",
    }

    with patch("app.api.events.append_event_to_backend", side_effect=RuntimeError("redis down")):
        client = _client(db)
        response = client.post("/api/events", json=payload)

    assert response.status_code == 201
    outbox_rows = db.query(EventOutbox).all()
    assert len(outbox_rows) == 1
    assert outbox_rows[0].status == "pending"

    recovered: list[str] = []
    with patch("app.api.events.publish_incoming", side_effect=lambda event_id: recovered.append(event_id)):
        recovery = client.post("/api/events/outbox/recover")

    assert recovery.status_code == 200
    db.refresh(outbox_rows[0])
    assert outbox_rows[0].status == "published"
    assert recovered
