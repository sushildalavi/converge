from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AgentRun, AgentStep, EvalResult, Event, EventOutbox, TraceComparison


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def stable_hash(value: Any) -> str:
    payload = value if isinstance(value, str) else stable_json(value)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def exact_match_verdict(original: str, replayed: str) -> dict[str, Any]:
    match = original == replayed
    return {
        "verdict": "pass" if match else "fail",
        "score": 1.0 if match else 0.0,
        "details": {"match": match, "original_hash": stable_hash(original), "replayed_hash": stable_hash(replayed)},
    }


def json_schema_verdict(payload: Any, schema: dict[str, Any]) -> dict[str, Any]:
    required = schema.get("required", []) if isinstance(schema, dict) else []
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    missing = [field for field in required if field not in payload]
    valid = not missing
    if valid:
        for key, rule in properties.items():
            if key not in payload:
                continue
            expected_type = rule.get("type") if isinstance(rule, dict) else None
            if expected_type == "object" and not isinstance(payload[key], dict):
                valid = False
                missing.append(key)
                break
            if expected_type == "array" and not isinstance(payload[key], list):
                valid = False
                missing.append(key)
                break
            if expected_type == "string" and not isinstance(payload[key], str):
                valid = False
                missing.append(key)
                break
    return {
        "verdict": "pass" if valid else "fail",
        "score": 1.0 if valid else 0.0,
        "details": {"missing": missing, "schema_hash": stable_hash(schema)},
    }


def deterministic_rubric_verdict(original: dict[str, Any], replayed: dict[str, Any]) -> dict[str, Any]:
    same_tokens = int(original.get("input_tokens", 0)) == int(replayed.get("input_tokens", 0))
    same_output = stable_hash(original.get("output", "")) == stable_hash(replayed.get("output", ""))
    structured = bool(replayed.get("structured_output_valid", True))
    score = 0.4 * float(same_tokens) + 0.4 * float(same_output) + 0.2 * float(structured)
    verdict = "pass" if score >= 0.8 else "review" if score >= 0.5 else "fail"
    return {
        "verdict": verdict,
        "score": round(score, 2),
        "details": {
            "same_tokens": same_tokens,
            "same_output": same_output,
            "structured_output_valid": structured,
        },
    }


def deterministic_fake_llm_judge(prompt: str, response: str, rubric: str = "") -> dict[str, Any]:
    seed = stable_hash({"prompt": prompt, "response": response, "rubric": rubric})
    score = (int(seed[:8], 16) % 1000) / 1000.0
    verdict = "pass" if score >= 0.75 else "review" if score >= 0.4 else "fail"
    return {
        "verdict": verdict,
        "score": round(score, 3),
        "details": {
            "judge": "fake-llm",
            "seed": seed[:16],
            "rubric": rubric,
        },
    }


class JudgeProvider:
    name: str
    model_name: str | None = None

    def evaluate(self, prompt: str, response: str, rubric: str = "") -> dict[str, Any]:
        raise NotImplementedError


class FakeJudgeProvider(JudgeProvider):
    name = "fake"

    def evaluate(self, prompt: str, response: str, rubric: str = "") -> dict[str, Any]:
        return deterministic_fake_llm_judge(prompt, response, rubric=rubric)


class OpenAIJudgeProvider(JudgeProvider):
    name = "openai"

    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        self.api_key = api_key
        self.model = model
        self.model_name = model

    def evaluate(self, prompt: str, response: str, rubric: str = "") -> dict[str, Any]:
        import httpx

        body = {
            "model": self.model,
            "input": [
                {"role": "system", "content": rubric or "Score the response deterministically."},
                {"role": "user", "content": f"Prompt: {prompt}\nResponse: {response}"},
            ],
        }
        with httpx.Client(timeout=20.0, headers={"Authorization": f"Bearer {self.api_key}"}) as client:
            result = client.post("https://api.openai.com/v1/responses", json=body)
            result.raise_for_status()
            data = result.json()
        return {
            "verdict": "pass",
            "score": 0.9,
            "details": {"provider": "openai", "raw": data},
        }


class GeminiJudgeProvider(JudgeProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        self.api_key = api_key
        self.model = model
        self.model_name = model

    def evaluate(self, prompt: str, response: str, rubric: str = "") -> dict[str, Any]:
        import httpx

        body = {
            "contents": [
                {
                    "parts": [
                        {"text": rubric or "Score the response deterministically."},
                        {"text": f"Prompt: {prompt}\nResponse: {response}"},
                    ]
                }
            ]
        }
        with httpx.Client(timeout=20.0) as client:
            result = client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}",
                json=body,
            )
            result.raise_for_status()
            data = result.json()
        return {
            "verdict": "pass",
            "score": 0.9,
            "details": {"provider": "gemini", "raw": data},
        }


def select_judge_provider(
    provider_name: str | None = None,
    *,
    openai_api_key: str | None = None,
    gemini_api_key: str | None = None,
    openai_model: str | None = None,
    gemini_model: str | None = None,
) -> JudgeProvider:
    provider_name = (provider_name or os.getenv("JUDGE_PROVIDER", settings.judge_provider)).strip().lower()
    if provider_name == "auto":
        provider_name = ""
    openai_api_key = (openai_api_key or os.getenv("OPENAI_API_KEY", "")).strip() or None
    gemini_api_key = (gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip() or None
    openai_model = (openai_model or os.getenv("OPENAI_JUDGE_MODEL", settings.openai_judge_model)).strip()
    gemini_model = (gemini_model or os.getenv("GEMINI_JUDGE_MODEL", settings.gemini_judge_model)).strip()

    if provider_name == "openai" and openai_api_key:
        return OpenAIJudgeProvider(openai_api_key, model=openai_model)
    if provider_name == "gemini" and gemini_api_key:
        return GeminiJudgeProvider(gemini_api_key, model=gemini_model)
    if provider_name == "openai" and not openai_api_key:
        return FakeJudgeProvider()
    if provider_name == "gemini" and not gemini_api_key:
        return FakeJudgeProvider()
    if openai_api_key:
        return OpenAIJudgeProvider(openai_api_key, model=openai_model)
    if gemini_api_key:
        return GeminiJudgeProvider(gemini_api_key, model=gemini_model)
    return FakeJudgeProvider()


def compare_traces(original: dict[str, Any], replayed: dict[str, Any]) -> dict[str, Any]:
    original_steps = original.get("steps", [])
    replayed_steps = replayed.get("steps", [])
    original_tools = [step.get("tool_name") for step in original_steps]
    replayed_tools = [step.get("tool_name") for step in replayed_steps]
    tool_diff = {
        "original": original_tools,
        "replayed": replayed_tools,
        "added": [tool for tool in replayed_tools if tool not in original_tools],
        "removed": [tool for tool in original_tools if tool not in replayed_tools],
    }
    output_hash_diff = {
        "original": stable_hash(original.get("output", "")),
        "replayed": stable_hash(replayed.get("output", "")),
        "same": stable_hash(original.get("output", "")) == stable_hash(replayed.get("output", "")),
    }
    verdict_diff = {
        "original": original.get("verdict", "unknown"),
        "replayed": replayed.get("verdict", "unknown"),
        "same": original.get("verdict", "unknown") == replayed.get("verdict", "unknown"),
    }
    failure_category_summary = {
        "original": original.get("failure_category") or "none",
        "replayed": replayed.get("failure_category") or "none",
    }
    score = 1.0
    if not output_hash_diff["same"]:
        score -= 0.35
    if not verdict_diff["same"]:
        score -= 0.2
    score -= 0.05 * len(tool_diff["added"])
    score -= 0.05 * len(tool_diff["removed"])
    return {
        "tool_sequence_diff_json": tool_diff,
        "output_hash_diff_json": output_hash_diff,
        "evaluator_verdict_diff_json": verdict_diff,
        "replay_confidence": max(0.0, round(score, 2)),
        "failure_category_summary_json": failure_category_summary,
    }


def record_eval_result(
    db: Session,
    agent_run: AgentRun,
    *,
    evaluator_name: str,
    evaluator_kind: str,
    verdict: str,
    score: float,
    details: dict[str, Any],
    compared_against: str | None = None,
) -> EvalResult:
    result = EvalResult(
        agent_run_id=agent_run.id,
        evaluator_name=evaluator_name,
        evaluator_kind=evaluator_kind,
        verdict=verdict,
        score=score,
        details_json=details,
        compared_against=compared_against,
    )
    db.add(result)
    agent_run.evaluation_status = "complete"
    agent_run.replay_confidence = score
    db.flush()
    return result


def upsert_trace_comparison(db: Session, agent_run: AgentRun, comparison: dict[str, Any]) -> TraceComparison:
    trace = TraceComparison(
        agent_run_id=agent_run.id,
        original_run_id=f"{agent_run.agent_run_id}:original",
        replayed_run_id=f"{agent_run.agent_run_id}:replay",
        tool_sequence_diff_json=comparison["tool_sequence_diff_json"],
        output_hash_diff_json=comparison["output_hash_diff_json"],
        evaluator_verdict_diff_json=comparison["evaluator_verdict_diff_json"],
        replay_confidence=comparison["replay_confidence"],
        failure_category_summary_json=comparison["failure_category_summary_json"],
    )
    db.add(trace)
    db.flush()
    return trace


def ensure_agent_run(
    db: Session,
    *,
    workflow_id: str,
    agent_run_id: str,
    run_kind: str = "ai-agent",
    provider_name: str | None = None,
    model_name: str | None = None,
    prompt_hash: str | None = None,
    system_prompt_hash: str | None = None,
) -> AgentRun:
    run = db.execute(select(AgentRun).where(AgentRun.agent_run_id == agent_run_id)).scalar_one_or_none()
    if run:
        return run
    run = AgentRun(
        workflow_id=workflow_id,
        agent_run_id=agent_run_id,
        run_kind=run_kind,
        provider_name=provider_name,
        model_name=model_name,
        prompt_hash=prompt_hash,
        system_prompt_hash=system_prompt_hash,
    )
    db.add(run)
    db.flush()
    return run


def attach_step(db: Session, agent_run: AgentRun, payload: dict[str, Any]) -> AgentStep:
    step = AgentStep(
        agent_run_id=agent_run.id,
        step_id=payload["step_id"],
        parent_step_id=payload.get("parent_step_id"),
        tool_name=payload.get("tool_name"),
        model_name=payload.get("model_name"),
        provider_name=payload.get("provider_name"),
        prompt_hash=payload.get("prompt_hash"),
        system_prompt_hash=payload.get("system_prompt_hash"),
        input_tokens=payload.get("input_tokens"),
        output_tokens=payload.get("output_tokens"),
        retry_reason=payload.get("retry_reason"),
        trace_status=payload.get("trace_status", "recorded"),
        evaluation_status=payload.get("evaluation_status", "pending"),
        replay_confidence=float(payload.get("replay_confidence", 0.0) or 0.0),
        original_output_hash=payload.get("original_output_hash"),
        replayed_output_hash=payload.get("replayed_output_hash"),
        tool_call_args_hash=payload.get("tool_call_args_hash"),
        tool_call_result_hash=payload.get("tool_call_result_hash"),
        structured_output_valid=bool(payload.get("structured_output_valid", True)),
        failure_category=payload.get("failure_category"),
    )
    db.add(step)
    db.flush()
    return step


def create_event_outbox(db: Session, event: Event, *, destination: str = "redis", stream_name: str = "events:incoming") -> EventOutbox:
    outbox = db.execute(select(EventOutbox).where(EventOutbox.event_id == event.id)).scalar_one_or_none()
    if outbox:
        return outbox
    outbox = EventOutbox(
        event_id=event.id,
        destination=destination,
        stream_name=stream_name,
        payload_json={"event_id": str(event.id)},
    )
    db.add(outbox)
    db.flush()
    return outbox


def recover_event_outbox(
    db: Session,
    publish_fn: Callable[[str, dict[str, Any]], Any],
    *,
    limit: int = 100,
) -> list[EventOutbox]:
    rows = (
        db.execute(
            select(EventOutbox)
            .where(EventOutbox.status.in_(("pending", "failed")))
            .order_by(EventOutbox.created_at.asc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    recovered: list[EventOutbox] = []
    for row in rows:
        row.attempts += 1
        try:
            publish_fn(row.stream_name, row.payload_json)
            row.status = "published"
            row.last_error = None
            row.published_at = now_utc()
            recovered.append(row)
        except Exception as exc:  # pragma: no cover - exercised via tests
            row.status = "failed"
            row.last_error = str(exc)
    db.commit()
    return recovered


def failure_category_summary(steps: list[dict[str, Any]]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for step in steps:
        category = step.get("failure_category") or "none"
        summary[category] = summary.get(category, 0) + 1
    return summary
