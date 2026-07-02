from __future__ import annotations

from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.ai_ops import (
    attach_step,
    compare_traces,
    exact_match_verdict,
    failure_category_summary,
    json_schema_verdict,
    now_utc,
    record_eval_result,
    select_judge_provider,
    stable_hash,
    upsert_trace_comparison,
    ensure_agent_run,
)
from app.models import Event
from app.core.idempotency import _get_or_create_application


def _tool_chain(index: int) -> list[dict[str, object]]:
    return [
        {
            "step_id": f"retrieve-{index}",
            "tool_name": "retrieval.search",
            "model_name": "gpt-4o-mini",
            "provider_name": "openai" if index % 3 == 0 else "fake",
            "prompt_hash": stable_hash({"kind": "retrieve", "index": index}),
            "system_prompt_hash": stable_hash("system:retrieve"),
            "input_tokens": 120 + index,
            "output_tokens": 80,
            "trace_status": "recorded",
            "evaluation_status": "pass",
            "replay_confidence": 0.95,
            "original_output_hash": stable_hash({"result": "documents"}),
            "replayed_output_hash": stable_hash({"result": "documents"}),
            "tool_call_args_hash": stable_hash({"query": f"query-{index}"}),
            "tool_call_result_hash": stable_hash({"docs": [1, 2, 3]}),
            "structured_output_valid": True,
            "failure_category": None,
        },
        {
            "step_id": f"summarize-{index}",
            "parent_step_id": f"retrieve-{index}",
            "tool_name": "llm.summarize",
            "model_name": "gpt-4o-mini",
            "provider_name": "openai" if index % 2 == 0 else "gemini",
            "prompt_hash": stable_hash({"kind": "summarize", "index": index}),
            "system_prompt_hash": stable_hash("system:summarize"),
            "input_tokens": 420 + index,
            "output_tokens": 210,
            "trace_status": "recorded",
            "evaluation_status": "pass",
            "replay_confidence": 0.88,
            "original_output_hash": stable_hash({"summary": "ok"}),
            "replayed_output_hash": stable_hash({"summary": "ok"}),
            "tool_call_args_hash": stable_hash({"context": "retrieval"}),
            "tool_call_result_hash": stable_hash({"summary": "ok"}),
            "structured_output_valid": True,
            "failure_category": None,
        },
        {
            "step_id": f"extract-{index}",
            "parent_step_id": f"summarize-{index}",
            "tool_name": "tool.extract",
            "model_name": "qwen2.5-coder:7b",
            "provider_name": "fake",
            "prompt_hash": stable_hash({"kind": "extract", "index": index}),
            "system_prompt_hash": stable_hash("system:extract"),
            "input_tokens": 280 + index,
            "output_tokens": 140,
            "retry_reason": "schema_validation_retry" if index % 5 == 0 else None,
            "trace_status": "recorded" if index % 5 else "replayed",
            "evaluation_status": "warn" if index % 5 == 0 else "pass",
            "replay_confidence": 0.72 if index % 5 == 0 else 0.91,
            "original_output_hash": stable_hash({"json": {"ok": True}}),
            "replayed_output_hash": stable_hash({"json": {"ok": index % 5 != 0}}),
            "tool_call_args_hash": stable_hash({"schema": "v1"}),
            "tool_call_result_hash": stable_hash({"json": {"ok": True}}),
            "structured_output_valid": index % 5 != 0,
            "failure_category": "schema_validation" if index % 5 == 0 else None,
        },
    ]


def seed_ai_workloads(db: Session, *, runs: int = 3) -> dict[str, int]:
    application = _get_or_create_application(db, "ai-agent-demo")
    created_runs = 0
    created_steps = 0
    created_events = 0
    created_evals = 0
    created_comparisons = 0

    for index in range(runs):
        agent_run_id = f"agent-run-{index}-{uuid4().hex[:8]}"
        workflow_id = f"ai-workflow-{index}-{uuid4().hex[:6]}"
        run = ensure_agent_run(
            db,
            workflow_id=workflow_id,
            agent_run_id=agent_run_id,
            provider_name="fake" if index % 3 else "openai",
            model_name="gpt-4o-mini" if index % 3 else "gemini-1.5-flash",
            prompt_hash=stable_hash({"run": index, "type": "ai-agent"}),
            system_prompt_hash=stable_hash("system:ai-agent"),
        )
        created_runs += 1

        steps = []
        for step_payload in _tool_chain(index):
            step = attach_step(db, run, step_payload)
            steps.append(
                {
                    "step_id": step.step_id,
                    "tool_name": step.tool_name,
                    "failure_category": step.failure_category,
                    "output": step.replayed_output_hash or step.original_output_hash or "",
                }
            )
            created_steps += 1

            event = Event(
                application_id=application.id,
                workflow_id=workflow_id,
                event_type=f"agent.{step.tool_name or 'step'}",
                service_name="ai-agent",
                idempotency_key=f"{agent_run_id}:{step.step_id}",
                status="succeeded" if step.structured_output_valid else "retrying",
                payload_json={"step_id": step.step_id, "tool_name": step.tool_name},
                metadata_json={"ai": True, "seeded": True},
                agent_run_id=agent_run_id,
                step_id=step.step_id,
                parent_step_id=step.parent_step_id,
                tool_name=step.tool_name,
                model_name=step.model_name,
                provider_name=step.provider_name,
                prompt_hash=step.prompt_hash,
                system_prompt_hash=step.system_prompt_hash,
                input_tokens=step.input_tokens,
                output_tokens=step.output_tokens,
                retry_reason=step.retry_reason,
                trace_status=step.trace_status,
                evaluation_status=step.evaluation_status,
                replay_confidence=step.replay_confidence,
                original_output_hash=step.original_output_hash,
                replayed_output_hash=step.replayed_output_hash,
                tool_call_args_hash=step.tool_call_args_hash,
                tool_call_result_hash=step.tool_call_result_hash,
                structured_output_valid=step.structured_output_valid,
                failure_category=step.failure_category,
                max_attempts=4,
            )
            db.add(event)
            created_events += 1

        original = {
            "steps": [{"tool_name": step.tool_name} for step in steps],
            "output": " ".join(step["output"] for step in steps),
            "verdict": "pass",
            "failure_category": None,
        }
        replayed = {
            "steps": [{"tool_name": step.tool_name} for step in steps],
            "output": " ".join(step["output"] for step in steps),
            "verdict": "pass" if index % 4 else "review",
            "failure_category": "schema_validation" if index % 5 == 0 else None,
        }
        verdict = exact_match_verdict(original["output"], replayed["output"])
        schema = json_schema_verdict({"steps": steps, "output": replayed["output"]}, {"required": ["steps", "output"]})
        judge = select_judge_provider().evaluate("compare agent replay", replayed["output"], "deterministic rubric")
        comparison = compare_traces(original, replayed)
        upsert_trace_comparison(db, run, comparison)
        record_eval_result(
            db,
            run,
            evaluator_name="exact-match",
            evaluator_kind="deterministic",
            verdict=verdict["verdict"],
            score=verdict["score"],
            details=verdict["details"],
            compared_against="original-output",
        )
        record_eval_result(
            db,
            run,
            evaluator_name="json-schema",
            evaluator_kind="deterministic",
            verdict=schema["verdict"],
            score=schema["score"],
            details=schema["details"],
            compared_against="structured-output",
        )
        record_eval_result(
            db,
            run,
            evaluator_name="fake-llm-judge",
            evaluator_kind="llm",
            verdict=judge["verdict"],
            score=judge["score"],
            details=judge["details"],
            compared_against="replayed-output",
        )
        run.original_output_hash = stable_hash(original["output"])
        run.replayed_output_hash = stable_hash(replayed["output"])
        run.failure_category = "schema_validation" if failure_category_summary(steps).get("schema_validation") else None
        run.trace_status = "recorded"
        run.evaluation_status = "complete"
        run.replay_confidence = comparison["replay_confidence"]
        created_evals += 3
        created_comparisons += 1

    db.commit()
    return {
        "agent_runs": created_runs,
        "steps": created_steps,
        "events": created_events,
        "eval_results": created_evals,
        "trace_comparisons": created_comparisons,
        "generated_at": now_utc().isoformat(),
    }
