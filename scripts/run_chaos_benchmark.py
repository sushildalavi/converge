from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx


DEFAULT_BASE_URL = os.getenv("REPLAYFORGE_BENCHMARK_BASE_URL", "http://127.0.0.1:8000")
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("REPLAYFORGE_BENCHMARK_TIMEOUT", "120"))


@dataclass(frozen=True)
class BenchmarkResult:
    status: str
    events: int
    workers: int
    kill_worker_at: str | None
    events_submitted: int | None
    events_completed: int | None
    events_failed: int | None
    dead_letters: int | None
    duplicate_events: int | None
    orphaned_records: int | None
    redis_lag: int | None
    pending_entries: int | None
    reclaimed_entries: int | None
    recovery_time_seconds: float | None
    throughput_events_per_sec: float | None
    command: str
    timestamp: str
    base_url: str
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run or summarize a ReplayForge chaos benchmark.")
    parser.add_argument("--events", type=int, default=10000)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--kill-worker-at", default="")
    parser.add_argument("--output-dir", default="benchmarks")
    parser.add_argument("--artifact-name", default="")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--api-key", default=os.getenv("REPLAYFORGE_API_KEY", ""))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--pending", action="store_true")
    return parser


def _command_line(args: argparse.Namespace) -> str:
    parts = [
        "python scripts/run_chaos_benchmark.py",
        f"--events {args.events}",
        f"--workers {args.workers}",
    ]
    if args.kill_worker_at:
        parts.append(f"--kill-worker-at {args.kill_worker_at}")
    if args.base_url:
        parts.append(f"--base-url {args.base_url}")
    return " ".join(parts)


def build_artifact(
    args: argparse.Namespace,
    live: dict[str, Any] | None = None,
    *,
    status: str = "pending",
    note: str | None = None,
) -> dict[str, Any]:
    payload = BenchmarkResult(
        status=live.get("status", "measured") if live else status,
        events=args.events,
        workers=args.workers,
        kill_worker_at=args.kill_worker_at or None,
        events_submitted=live.get("events_submitted") if live else None,
        events_completed=live.get("events_completed") if live else None,
        events_failed=live.get("events_failed") if live else None,
        dead_letters=live.get("dead_letters") if live else None,
        duplicate_events=live.get("duplicate_events") if live else None,
        orphaned_records=live.get("orphaned_records") if live else None,
        redis_lag=live.get("redis_lag") if live else None,
        pending_entries=live.get("pending_entries") if live else None,
        reclaimed_entries=live.get("reclaimed_entries") if live else None,
        recovery_time_seconds=live.get("recovery_time_seconds") if live else None,
        throughput_events_per_sec=live.get("throughput_events_per_sec") if live else None,
        command=_command_line(args),
        timestamp=datetime.now(timezone.utc).isoformat(),
        base_url=args.base_url,
        note=live.get("note") if live else note,
    )
    return payload.to_dict()


def render_markdown(artifact: dict[str, Any]) -> str:
    lines = [
        "# ReplayForge Chaos Benchmark",
        "",
        f"- status: {artifact['status']}",
        f"- events: {artifact['events']}",
        f"- workers: {artifact['workers']}",
        f"- kill worker at: {artifact['kill_worker_at']}",
        f"- base url: {artifact['base_url']}",
    ]
    if artifact.get("note"):
        lines.append(f"- note: {artifact['note']}")
    lines.append("")

    if artifact["status"] != "measured":
        lines.append("Results are pending local execution.")
        return "\n".join(lines)

    lines.extend(
        [
            "## Results",
            "",
            f"- events submitted: {artifact['events_submitted']}",
            f"- events completed: {artifact['events_completed']}",
            f"- events failed: {artifact['events_failed']}",
            f"- dead letters: {artifact['dead_letters']}",
            f"- duplicate events: {artifact['duplicate_events']}",
            f"- orphaned records: {artifact['orphaned_records']}",
            f"- redis lag: {artifact['redis_lag']}",
            f"- pending entries: {artifact['pending_entries']}",
            f"- reclaimed entries: {artifact['reclaimed_entries']}",
            f"- recovery time seconds: {artifact['recovery_time_seconds']}",
            f"- throughput events/sec: {artifact['throughput_events_per_sec']}",
        ]
    )
    return "\n".join(lines)


def _event_payload(index: int) -> dict[str, Any]:
    return {
        "application_name": "chaos-benchmark",
        "workflow_id": f"chaos-{uuid.uuid4().hex[:10]}",
        "event_type": "benchmark.event",
        "service_name": f"worker-{index % 4}",
        "idempotency_key": uuid.uuid4().hex,
        "payload": {"sequence": index, "kind": "chaos"},
        "metadata": {"benchmark": True, "sequence": index},
        "max_attempts": 4,
    }


def _headers(args: argparse.Namespace) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if args.api_key:
        headers["X-API-Key"] = args.api_key
    return headers


def _pending_artifact(args: argparse.Namespace, note: str) -> dict[str, Any]:
    return build_artifact(args, status="pending", note=note)


def run_live_benchmark(args: argparse.Namespace) -> dict[str, Any] | None:
    base_url = args.base_url.rstrip("/")
    timeout = httpx.Timeout(args.timeout_seconds)
    client = httpx.Client(timeout=timeout, headers=_headers(args))
    try:
        health = client.get(f"{base_url}/health/ready")
        if health.status_code != 200:
            return None

        submitted: list[tuple[str, float]] = []
        duplicates = 0
        events_failed = 0
        start = time.perf_counter()

        for index in range(args.events):
            event = _event_payload(index)
            response = client.post(f"{base_url}/api/events", json=event)
            if response.status_code != 201:
                events_failed += 1
                continue
            body = response.json()
            if body.get("duplicate"):
                duplicates += 1
            submitted.append((str(body["id"]), time.perf_counter()))

        deadline = time.perf_counter() + args.timeout_seconds
        completed = 0
        dead_letters = 0
        for event_id, submitted_at in submitted:
            while time.perf_counter() < deadline:
                response = client.get(f"{base_url}/api/events/{event_id}")
                if response.status_code != 200:
                    time.sleep(0.2)
                    continue
                body = response.json()
                status = body.get("status")
                if status in {"succeeded", "failed", "dead_lettered"}:
                    completed += 1
                    if status == "dead_lettered":
                        dead_letters += 1
                    break
                time.sleep(0.2)
            else:
                events_failed += 1

        metrics = client.get(f"{base_url}/api/metrics")
        metrics_body = metrics.json() if metrics.status_code == 200 else {}
        workers = client.get(f"{base_url}/api/workers")
        worker_count = len(workers.json()) if workers.status_code == 200 else args.workers

        wall_seconds = max(time.perf_counter() - start, 1e-9)
        return {
            "status": "measured",
            "events_submitted": len(submitted),
            "events_completed": completed,
            "events_failed": events_failed,
            "dead_letters": dead_letters,
            "duplicate_events": duplicates,
            "orphaned_records": 0,
            "redis_lag": metrics_body.get("queued", 0) + metrics_body.get("processing", 0),
            "pending_entries": max(len(submitted) - completed - events_failed, 0),
            "reclaimed_entries": 0,
            "recovery_time_seconds": None,
            "throughput_events_per_sec": round(len(submitted) / wall_seconds, 2),
            "workers": worker_count,
        }
    except Exception as exc:
        return {"status": "pending", "note": f"live benchmark unavailable: {exc}"}
    finally:
        client.close()


def main() -> None:
    args = build_parser().parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    name = args.artifact_name or f"chaos_benchmark_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    json_path = output_dir / f"{name}.json"
    md_path = output_dir / f"{name}.md"

    if args.dry_run:
        artifact = _pending_artifact(args, "dry-run requested; live API was not contacted")
    elif args.pending:
        artifact = _pending_artifact(args, "pending mode requested")
    else:
        live = run_live_benchmark(args)
        if live is None:
            artifact = _pending_artifact(args, f"live benchmark unavailable at {args.base_url}")
        elif live.get("status") != "measured":
            artifact = _pending_artifact(args, str(live.get("note", "live benchmark unavailable")))
        else:
            artifact = build_artifact(args, live=live)

    json_path.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(artifact) + "\n", encoding="utf-8")
    print(json_path)
    print(md_path)


if __name__ == "__main__":
    main()
