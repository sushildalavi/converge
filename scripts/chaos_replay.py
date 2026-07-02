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
    start_one_go_worker,
    stop_one_go_worker,
    submit_events,
    wait_for_convergence,
    wait_for_ready,
    wait_for_terminal_events,
)

DEFAULT_BASE_URL = os.getenv("REPLAYFORGE_BASE_URL", "http://127.0.0.1:8101")


@dataclass(frozen=True)
class ChaosOutcome:
    status: str
    events: int
    workers: int
    concurrency: int
    kill_delay_seconds: float
    restart_delay_seconds: float
    killed_worker_id: str | None
    submitted: int
    completed: int
    failed: int
    dead_letters: int
    retries: int
    pending_before_recovery: int
    pending_after_recovery: int
    stream_backlog_before_recovery: int
    stream_backlog_after_recovery: int
    orphaned_records: int
    duplicate_deliveries: int
    duplicate_side_effects: int
    convergence_state_before: str
    convergence_state_after: str
    converged: bool
    recovery_time_seconds: float | None
    ingest_throughput_events_per_sec: float | None
    end_to_end_throughput_events_per_sec: float | None
    p50_e2e_ms: float | None
    p95_e2e_ms: float | None
    p99_e2e_ms: float | None
    command: str
    timestamp: str
    base_url: str
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a Converge chaos replay with a worker interruption.")
    parser.add_argument("--events", type=int, default=1000)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--concurrency", type=int, default=25)
    parser.add_argument("--kill-delay", type=float, default=2.0)
    parser.add_argument("--restart-delay", type=float, default=3.0)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--timeout-seconds", type=float, default=240.0)
    parser.add_argument("--api-key", default=os.getenv("REPLAYFORGE_API_KEY", ""))
    parser.add_argument("--output-dir", default="benchmarks")
    parser.add_argument("--artifact-name", default="")
    parser.add_argument("--pending", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reset", action="store_true", help="Recreate the compose stack before the chaos run.")
    return parser


def _command_line(args: argparse.Namespace) -> str:
    parts = [
        "python scripts/chaos_replay.py",
        f"--events {args.events}",
        f"--workers {args.workers}",
        f"--concurrency {args.concurrency}",
        f"--kill-delay {args.kill_delay}",
        f"--restart-delay {args.restart_delay}",
        f"--base-url {args.base_url}",
    ]
    return " ".join(parts)


def _event_payload(index: int) -> dict[str, Any]:
    return {
        "application_name": "chaos-replay",
        "workflow_id": f"chaos-{uuid4().hex[:10]}",
        "event_type": "chaos.event",
        "service_name": f"service-{index % 5}",
        "idempotency_key": uuid4().hex,
        "payload": {"sequence": index, "kind": "chaos"},
        "metadata": {"chaos": True, "sequence": index},
        "max_attempts": 4,
    }


def _pending_artifact(args: argparse.Namespace, note: str) -> dict[str, Any]:
    return ChaosOutcome(
        status="pending",
        events=args.events,
        workers=args.workers,
        concurrency=args.concurrency,
        kill_delay_seconds=args.kill_delay,
        restart_delay_seconds=args.restart_delay,
        killed_worker_id=None,
        submitted=0,
        completed=0,
        failed=0,
        dead_letters=0,
        retries=0,
        pending_before_recovery=0,
        pending_after_recovery=0,
        stream_backlog_before_recovery=0,
        stream_backlog_after_recovery=0,
        orphaned_records=0,
        duplicate_deliveries=0,
        duplicate_side_effects=0,
        convergence_state_before="pending",
        convergence_state_after="pending",
        converged=False,
        recovery_time_seconds=None,
        ingest_throughput_events_per_sec=None,
        end_to_end_throughput_events_per_sec=None,
        p50_e2e_ms=None,
        p95_e2e_ms=None,
        p99_e2e_ms=None,
        command=_command_line(args),
        timestamp=datetime.now(timezone.utc).isoformat(),
        base_url=args.base_url,
        note=note,
    ).to_dict()


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((pct / 100.0) * (len(ordered) - 1)))))
    return round(ordered[index], 2)


async def run_chaos(args: argparse.Namespace) -> dict[str, Any] | None:
    if args.reset:
        restart_control_plane()
        restart_go_workers(scale=args.workers)
    else:
        restart_go_workers(scale=args.workers)

    await wait_for_ready(args.base_url, timeout_seconds=args.timeout_seconds)

    payloads = [_event_payload(i) for i in range(args.events)]
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

    killed_worker_id: str | None = None
    kill_started: float | None = None

    async def _kill_and_restart() -> None:
        nonlocal killed_worker_id, kill_started
        await asyncio.sleep(max(args.kill_delay, 0))
        killed_worker_id = await asyncio.to_thread(stop_one_go_worker)
        kill_started = asyncio.get_running_loop().time()
        await asyncio.sleep(max(args.restart_delay, 0))
        await asyncio.to_thread(start_one_go_worker)

    killer = asyncio.create_task(_kill_and_restart())

    # capture a mid-recovery snapshot after the interruption has had time to land
    await asyncio.sleep(max(args.kill_delay + 1.0, 1.0))
    before_recovery = await fetch_json(args.base_url, "/api/convergence")

    terminal = await wait_for_terminal_events(
        args.base_url,
        event_ids,
        submitted_at,
        timeout_seconds=args.timeout_seconds,
        batch_size=50,
    )
    recovery = await wait_for_convergence(args.base_url, timeout_seconds=args.timeout_seconds)
    await killer
    end = asyncio.get_running_loop().time()

    workers = await fetch_json(args.base_url, "/api/workers")

    completed = sum(1 for t in terminal if t.status == "succeeded")
    dead_letters = sum(1 for t in terminal if t.status == "dead_lettered")
    failures = sum(1 for t in terminal if t.status == "failed")
    e2e_latencies = [t.e2e_ms for t in terminal if t.status != "timeout"]

    ingest_seconds = max(ingest_done - start, 1e-9)
    recovery_anchor = kill_started or start
    recovery_seconds = max(end - recovery_anchor, 1e-9)

    return {
        "status": "measured",
        "events": args.events,
        "workers": len(workers) if isinstance(workers, list) else args.workers,
        "concurrency": args.concurrency,
        "kill_delay_seconds": args.kill_delay,
        "restart_delay_seconds": args.restart_delay,
        "killed_worker_id": killed_worker_id,
        "submitted": len(successful),
        "completed": completed,
        "failed": failures,
        "dead_letters": dead_letters,
        "retries": int(recovery.get("retrying_events", 0)),
        "pending_before_recovery": int(before_recovery.get("pending_events", 0)),
        "pending_after_recovery": int(recovery.get("pending_events", 0)),
        "stream_backlog_before_recovery": int(before_recovery.get("stream_backlog", 0)),
        "stream_backlog_after_recovery": int(recovery.get("stream_backlog", 0)),
        "orphaned_records": int(recovery.get("orphaned_records", 0)),
        "duplicate_deliveries": int(recovery.get("duplicate_deliveries", 0)),
        "duplicate_side_effects": int(recovery.get("duplicate_side_effects", 0)),
        "convergence_state_before": before_recovery.get("convergence_state", "unknown"),
        "convergence_state_after": recovery.get("convergence_state", "unknown"),
        "converged": bool(recovery.get("converged", False)),
        "recovery_time_seconds": round(recovery_seconds, 2),
        "ingest_throughput_events_per_sec": round(len(successful) / ingest_seconds, 2),
        "end_to_end_throughput_events_per_sec": round(len(successful) / recovery_seconds, 2) if successful else 0.0,
        "p50_e2e_ms": _percentile(e2e_latencies, 50),
        "p95_e2e_ms": _percentile(e2e_latencies, 95),
        "p99_e2e_ms": _percentile(e2e_latencies, 99),
    }


def _render_markdown(artifact: dict[str, Any]) -> str:
    lines = [
        "# Converge Chaos Replay",
        "",
        f"- status: {artifact['status']}",
        f"- events: {artifact['events']}",
        f"- workers: {artifact['workers']}",
        f"- concurrency: {artifact['concurrency']}",
        f"- kill delay seconds: {artifact['kill_delay_seconds']}",
        f"- restart delay seconds: {artifact['restart_delay_seconds']}",
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
            f"- killed worker id: {artifact['killed_worker_id']}",
            f"- submitted: {artifact['submitted']}",
            f"- completed: {artifact['completed']}",
            f"- failed: {artifact['failed']}",
            f"- dead letters: {artifact['dead_letters']}",
            f"- retries: {artifact['retries']}",
            f"- pending before recovery: {artifact['pending_before_recovery']}",
            f"- pending after recovery: {artifact['pending_after_recovery']}",
            f"- backlog before recovery: {artifact['stream_backlog_before_recovery']}",
            f"- backlog after recovery: {artifact['stream_backlog_after_recovery']}",
            f"- orphaned records: {artifact['orphaned_records']}",
            f"- duplicate deliveries: {artifact['duplicate_deliveries']}",
            f"- duplicate side effects: {artifact['duplicate_side_effects']}",
            f"- convergence before: {artifact['convergence_state_before']}",
            f"- convergence after: {artifact['convergence_state_after']}",
            f"- converged: {artifact['converged']}",
            f"- recovery time seconds: {artifact['recovery_time_seconds']}",
            f"- ingest throughput events/sec: {artifact['ingest_throughput_events_per_sec']}",
            f"- end-to-end throughput events/sec: {artifact['end_to_end_throughput_events_per_sec']}",
            f"- p50 e2e ms: {artifact['p50_e2e_ms']}",
            f"- p95 e2e ms: {artifact['p95_e2e_ms']}",
            f"- p99 e2e ms: {artifact['p99_e2e_ms']}",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = build_parser().parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    artifact_name = args.artifact_name or f"chaos_replay_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    json_path = output_dir / f"{artifact_name}.json"
    md_path = output_dir / f"{artifact_name}.md"

    if args.dry_run or args.pending:
        artifact = _pending_artifact(args, "pending chaos run requested")
    else:
        live = asyncio.run(run_chaos(args))
        if live is None:
            artifact = _pending_artifact(args, f"chaos run unavailable at {args.base_url}")
        elif live.get("status") != "measured":
            artifact = _pending_artifact(args, str(live.get("note", "chaos run unavailable")))
        else:
            artifact = ChaosOutcome(
                status="measured",
                events=args.events,
                workers=live["workers"],
                concurrency=args.concurrency,
                kill_delay_seconds=args.kill_delay,
                restart_delay_seconds=args.restart_delay,
                killed_worker_id=live["killed_worker_id"],
                submitted=live["submitted"],
                completed=live["completed"],
                failed=live["failed"],
                dead_letters=live["dead_letters"],
                retries=live["retries"],
                pending_before_recovery=live["pending_before_recovery"],
                pending_after_recovery=live["pending_after_recovery"],
                stream_backlog_before_recovery=live["stream_backlog_before_recovery"],
                stream_backlog_after_recovery=live["stream_backlog_after_recovery"],
                orphaned_records=live["orphaned_records"],
                duplicate_deliveries=live["duplicate_deliveries"],
                duplicate_side_effects=live["duplicate_side_effects"],
                convergence_state_before=live["convergence_state_before"],
                convergence_state_after=live["convergence_state_after"],
                converged=live["converged"],
                recovery_time_seconds=live["recovery_time_seconds"],
                ingest_throughput_events_per_sec=live["ingest_throughput_events_per_sec"],
                end_to_end_throughput_events_per_sec=live["end_to_end_throughput_events_per_sec"],
                p50_e2e_ms=live["p50_e2e_ms"],
                p95_e2e_ms=live["p95_e2e_ms"],
                p99_e2e_ms=live["p99_e2e_ms"],
                command=_command_line(args),
                timestamp=datetime.now(timezone.utc).isoformat(),
                base_url=args.base_url,
            ).to_dict()

    json_path.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(_render_markdown(artifact), encoding="utf-8")
    print(json_path)
    print(md_path)


if __name__ == "__main__":
    main()
