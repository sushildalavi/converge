from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.replay_harness import (
    fetch_json,
    restart_control_plane,
    restart_go_workers,
    submit_events,
    wait_for_convergence,
    wait_for_ready,
    wait_for_terminal_events,
)

DEFAULT_BASE_URL = os.getenv("REPLAYFORGE_BENCHMARK_BASE_URL", "http://127.0.0.1:8101")


@dataclass(frozen=True)
class BenchmarkOutcome:
    status: str
    mode: str
    events: int
    workers: int
    concurrency: int
    submitted: int
    completed: int
    failed: int
    dead_letters: int
    retries: int
    pending_entries: int
    stream_backlog: int
    orphaned_records: int
    duplicate_deliveries: int
    duplicate_side_effects: int
    convergence_state: str
    converged: bool
    ingest_throughput_events_per_sec: float | None
    processing_throughput_events_per_sec: float | None
    end_to_end_throughput_events_per_sec: float | None
    recovery_time_seconds: float | None
    p50_e2e_ms: float | None
    p95_e2e_ms: float | None
    p99_e2e_ms: float | None
    eval_enabled: bool
    trace_comparison_enabled: bool
    ai_eval_pass_rate: float | None
    replay_confidence_p50: float | None
    replay_confidence_p95: float | None
    command: str
    timestamp: str
    base_url: str
    redis_stream_batch_size: int
    db_pool_size: int
    payload_size: int
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark Converge replay throughput and convergence.")
    parser.add_argument("--events", type=int, default=1000)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--concurrency", type=int, default=25)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--timeout-seconds", type=float, default=180.0)
    parser.add_argument("--api-key", default=os.getenv("REPLAYFORGE_API_KEY", ""))
    parser.add_argument("--output-dir", default="benchmarks")
    parser.add_argument("--artifact-name", default="")
    parser.add_argument("--pending", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reset", action="store_true", help="Recreate the compose stack before benchmarking.")
    parser.add_argument("--mode", choices=["generic", "ai-agent"], default="generic")
    parser.add_argument("--payload-size", type=int, default=256)
    parser.add_argument("--redis-stream-batch-size", type=int, default=50)
    parser.add_argument("--db-pool-size", type=int, default=50)
    parser.add_argument("--eval-enabled", action="store_true")
    parser.add_argument("--trace-comparison-enabled", action="store_true")
    return parser


def _command_line(args: argparse.Namespace) -> str:
    parts = [
        "python scripts/benchmark_replay.py",
        f"--events {args.events}",
        f"--workers {args.workers}",
        f"--concurrency {args.concurrency}",
        f"--base-url {args.base_url}",
        f"--mode {args.mode}",
    ]
    return " ".join(parts)


def _payload_body(index: int, size: int) -> dict[str, Any]:
    return {"sequence": index, "kind": "benchmark", "blob": "x" * max(0, size - 48)}


def _event_payload(index: int, *, mode: str, payload_size: int) -> dict[str, Any]:
    workflow_id = f"{mode}-benchmark-{uuid4().hex[:10]}"
    payload = {
        "application_name": "converge-benchmark",
        "workflow_id": workflow_id,
        "event_type": "benchmark.event",
        "service_name": f"service-{index % 4}",
        "idempotency_key": uuid4().hex,
        "payload": _payload_body(index, payload_size),
        "metadata": {"benchmark": True, "sequence": index, "mode": mode},
        "max_attempts": 4,
    }
    if mode == "ai-agent":
        payload.update(
            {
                "workflow_id": workflow_id,
                "event_type": f"agent.{['retrieve', 'summarize', 'extract', 'validate'][index % 4]}",
                "service_name": "ai-agent",
                "agent_run_id": f"agent-run-{workflow_id}",
                "step_id": f"step-{index}",
                "parent_step_id": f"step-{index - 1}" if index > 0 else None,
                "tool_name": ["retrieval.search", "llm.summarize", "tool.extract", "schema.validate"][index % 4],
                "model_name": ["gpt-4o-mini", "gpt-4o-mini", "qwen2.5-coder:7b", "fake-judge"][index % 4],
                "provider_name": ["openai", "openai", "fake", "fake"][index % 4],
                "prompt_hash": uuid4().hex,
                "system_prompt_hash": uuid4().hex,
                "input_tokens": 100 + index,
                "output_tokens": 50 + (index % 7),
                "retry_reason": "schema_validation_retry" if index % 11 == 0 else None,
                "trace_status": "recorded" if index % 7 else "replayed",
                "evaluation_status": "complete" if index % 5 else "warn",
                "replay_confidence": 0.9 if index % 5 else 0.71,
                "original_output_hash": uuid4().hex,
                "replayed_output_hash": uuid4().hex,
                "tool_call_args_hash": uuid4().hex,
                "tool_call_result_hash": uuid4().hex,
                "structured_output_valid": index % 6 != 0,
                "failure_category": "schema_validation" if index % 11 == 0 else None,
            }
        )
    return payload


def _pending_artifact(args: argparse.Namespace, note: str) -> dict[str, Any]:
    return BenchmarkOutcome(
        status="pending",
        mode=args.mode,
        events=args.events,
        workers=args.workers,
        concurrency=args.concurrency,
        submitted=0,
        completed=0,
        failed=0,
        dead_letters=0,
        retries=0,
        pending_entries=0,
        stream_backlog=0,
        orphaned_records=0,
        duplicate_deliveries=0,
        duplicate_side_effects=0,
        convergence_state="pending",
        converged=False,
        ingest_throughput_events_per_sec=None,
        processing_throughput_events_per_sec=None,
        end_to_end_throughput_events_per_sec=None,
        recovery_time_seconds=None,
        p50_e2e_ms=None,
        p95_e2e_ms=None,
        p99_e2e_ms=None,
        eval_enabled=bool(args.eval_enabled),
        trace_comparison_enabled=bool(args.trace_comparison_enabled),
        ai_eval_pass_rate=None,
        replay_confidence_p50=None,
        replay_confidence_p95=None,
        command=_command_line(args),
        timestamp=datetime.now(timezone.utc).isoformat(),
        base_url=args.base_url,
        redis_stream_batch_size=args.redis_stream_batch_size,
        db_pool_size=args.db_pool_size,
        payload_size=args.payload_size,
        note=note,
    ).to_dict()


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((pct / 100.0) * (len(ordered) - 1)))))
    return round(ordered[index], 2)


async def run_benchmark(args: argparse.Namespace) -> dict[str, Any] | None:
    if args.reset:
        restart_control_plane()
        restart_go_workers(scale=args.workers)
    else:
        restart_go_workers(scale=args.workers)

    await wait_for_ready(args.base_url, timeout_seconds=args.timeout_seconds)

    payloads = [_event_payload(i, mode=args.mode, payload_size=args.payload_size) for i in range(args.events)]
    start = asyncio.get_running_loop().time()
    submissions = await submit_events(
        args.base_url,
        payloads,
        concurrency=args.concurrency,
        api_key=args.api_key,
        timeout_seconds=min(args.timeout_seconds, 30.0),
    )
    ingest_done = asyncio.get_running_loop().time()

    successful = [s for s in submissions if s.status_code == 201 and s.event_id]
    event_ids = [s.event_id for s in successful]
    submitted_at = {s.event_id: s.submitted_at for s in successful}
    duplicates = sum(1 for s in submissions if s.duplicate)
    failed_submissions = sum(1 for s in submissions if s.status_code != 201)

    terminal = await wait_for_terminal_events(
        args.base_url,
        event_ids,
        submitted_at,
        timeout_seconds=args.timeout_seconds,
        batch_size=args.redis_stream_batch_size,
    )
    end = asyncio.get_running_loop().time()

    convergence = await wait_for_convergence(args.base_url, timeout_seconds=args.timeout_seconds)
    workers = await fetch_json(args.base_url, "/api/workers")
    ai_runs: list[dict[str, Any]] = []
    ai_evals: list[dict[str, Any]] = []
    if args.mode == "ai-agent" or args.eval_enabled or args.trace_comparison_enabled:
        try:
            raw_runs = await fetch_json(args.base_url, "/api/ai/agent-runs")
            ai_runs = raw_runs if isinstance(raw_runs, list) else []
        except Exception:
            ai_runs = []
        try:
            raw_evals = await fetch_json(args.base_url, "/api/ai/evals")
            ai_evals = raw_evals if isinstance(raw_evals, list) else []
        except Exception:
            ai_evals = []

    completed = sum(1 for t in terminal if t.status == "succeeded")
    dead_letters = sum(1 for t in terminal if t.status == "dead_lettered")
    failures = sum(1 for t in terminal if t.status == "failed")
    e2e_latencies = [t.e2e_ms for t in terminal if t.status != "timeout"]
    replay_confidences = [float(run.get("replay_confidence", 0.0)) for run in ai_runs if isinstance(run, dict)]
    eval_scores = [float(result.get("score", 0.0)) for result in ai_evals if isinstance(result, dict)]

    ingest_seconds = max(ingest_done - start, 1e-9)
    recovery_seconds = max(end - start, 1e-9)

    return {
        "status": "measured",
        "events": args.events,
        "workers": len(workers) if isinstance(workers, list) else args.workers,
        "concurrency": args.concurrency,
        "submitted": len(successful),
        "completed": completed,
        "failed": failed_submissions + failures,
        "dead_letters": dead_letters,
        "retries": int(convergence.get("retrying_events", 0)),
        "pending_entries": int(convergence.get("pending_events", 0)),
        "stream_backlog": int(convergence.get("stream_backlog", 0)),
        "orphaned_records": int(convergence.get("orphaned_records", 0)),
        "duplicate_deliveries": int(convergence.get("duplicate_deliveries", 0)) + duplicates,
        "duplicate_side_effects": int(convergence.get("duplicate_side_effects", 0)),
        "convergence_state": convergence.get("convergence_state", "unknown"),
        "converged": bool(convergence.get("converged", False)),
        "ingest_throughput_events_per_sec": round(len(successful) / ingest_seconds, 2),
        "processing_throughput_events_per_sec": round(completed / recovery_seconds, 2) if completed else 0.0,
        "end_to_end_throughput_events_per_sec": round(len(successful) / recovery_seconds, 2) if successful else 0.0,
        "recovery_time_seconds": round(recovery_seconds, 2),
        "p50_e2e_ms": _percentile(e2e_latencies, 50),
        "p95_e2e_ms": _percentile(e2e_latencies, 95),
        "p99_e2e_ms": _percentile(e2e_latencies, 99),
        "eval_enabled": bool(args.eval_enabled),
        "trace_comparison_enabled": bool(args.trace_comparison_enabled),
        "ai_eval_pass_rate": round(sum(1 for score in eval_scores if score >= 0.75) / len(eval_scores), 3) if eval_scores else None,
        "replay_confidence_p50": _percentile(replay_confidences, 50),
        "replay_confidence_p95": _percentile(replay_confidences, 95),
        "redis_stream_batch_size": args.redis_stream_batch_size,
        "db_pool_size": args.db_pool_size,
        "payload_size": args.payload_size,
    }


def _render_markdown(artifact: dict[str, Any]) -> str:
    lines = [
        "# Converge Benchmark",
        "",
        f"- status: {artifact['status']}",
        f"- events: {artifact['events']}",
        f"- workers: {artifact['workers']}",
        f"- concurrency: {artifact['concurrency']}",
        f"- base url: {artifact['base_url']}",
        "",
    ]
    if artifact["status"] != "measured":
        lines.append("Results are pending local execution.")
        return "\n".join(lines)

    lines.extend(
        [
            "## Results",
            "",
            f"- mode: {artifact['mode']}",
            f"- submitted: {artifact['submitted']}",
            f"- completed: {artifact['completed']}",
            f"- failed: {artifact['failed']}",
            f"- dead letters: {artifact['dead_letters']}",
            f"- retries: {artifact['retries']}",
            f"- pending entries: {artifact['pending_entries']}",
            f"- stream backlog: {artifact['stream_backlog']}",
            f"- orphaned records: {artifact['orphaned_records']}",
            f"- duplicate deliveries: {artifact['duplicate_deliveries']}",
            f"- duplicate side effects: {artifact['duplicate_side_effects']}",
            f"- convergence state: {artifact['convergence_state']}",
            f"- converged: {artifact['converged']}",
            f"- ingest throughput events/sec: {artifact['ingest_throughput_events_per_sec']}",
            f"- processing throughput events/sec: {artifact['processing_throughput_events_per_sec']}",
            f"- end-to-end throughput events/sec: {artifact['end_to_end_throughput_events_per_sec']}",
            f"- recovery time seconds: {artifact['recovery_time_seconds']}",
            f"- p50 e2e ms: {artifact['p50_e2e_ms']}",
            f"- p95 e2e ms: {artifact['p95_e2e_ms']}",
            f"- p99 e2e ms: {artifact['p99_e2e_ms']}",
            f"- eval enabled: {artifact['eval_enabled']}",
            f"- trace comparison enabled: {artifact['trace_comparison_enabled']}",
            f"- AI eval pass rate: {artifact['ai_eval_pass_rate']}",
            f"- replay confidence p50: {artifact['replay_confidence_p50']}",
            f"- replay confidence p95: {artifact['replay_confidence_p95']}",
            f"- redis stream batch size: {artifact['redis_stream_batch_size']}",
            f"- db pool size: {artifact['db_pool_size']}",
            f"- payload size: {artifact['payload_size']}",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = build_parser().parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    artifact_name = args.artifact_name or f"benchmark_replay_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    json_path = output_dir / f"{artifact_name}.json"
    md_path = output_dir / f"{artifact_name}.md"

    if args.dry_run or args.pending:
        artifact = _pending_artifact(args, "pending benchmark requested")
    else:
        live = asyncio.run(run_benchmark(args))
        if live is None:
            artifact = _pending_artifact(args, f"benchmark unavailable at {args.base_url}")
        elif live.get("status") != "measured":
            artifact = _pending_artifact(args, str(live.get("note", "benchmark unavailable")))
        else:
            artifact = BenchmarkOutcome(
                status="measured",
                mode=live["mode"],
                events=args.events,
                workers=live["workers"],
                concurrency=args.concurrency,
                submitted=live["submitted"],
                completed=live["completed"],
                failed=live["failed"],
                dead_letters=live["dead_letters"],
                retries=live["retries"],
                pending_entries=live["pending_entries"],
                stream_backlog=live["stream_backlog"],
                orphaned_records=live["orphaned_records"],
                duplicate_deliveries=live["duplicate_deliveries"],
                duplicate_side_effects=live["duplicate_side_effects"],
                convergence_state=live["convergence_state"],
                converged=live["converged"],
                ingest_throughput_events_per_sec=live["ingest_throughput_events_per_sec"],
                processing_throughput_events_per_sec=live["processing_throughput_events_per_sec"],
                end_to_end_throughput_events_per_sec=live["end_to_end_throughput_events_per_sec"],
                recovery_time_seconds=live["recovery_time_seconds"],
                p50_e2e_ms=live["p50_e2e_ms"],
                p95_e2e_ms=live["p95_e2e_ms"],
                p99_e2e_ms=live["p99_e2e_ms"],
                eval_enabled=live["eval_enabled"],
                trace_comparison_enabled=live["trace_comparison_enabled"],
                ai_eval_pass_rate=live["ai_eval_pass_rate"],
                replay_confidence_p50=live["replay_confidence_p50"],
                replay_confidence_p95=live["replay_confidence_p95"],
                command=_command_line(args),
                timestamp=datetime.now(timezone.utc).isoformat(),
                base_url=args.base_url,
                redis_stream_batch_size=live["redis_stream_batch_size"],
                db_pool_size=live["db_pool_size"],
                payload_size=live["payload_size"],
            ).to_dict()

    json_path.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(_render_markdown(artifact), encoding="utf-8")
    print(json_path)
    print(md_path)


if __name__ == "__main__":
    main()
