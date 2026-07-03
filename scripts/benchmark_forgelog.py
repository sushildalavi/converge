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


DEFAULT_BASE_URL = os.getenv("EVENT_BACKEND_URL", "http://127.0.0.1:9090")


@dataclass(frozen=True)
class EventBackendBenchmark:
    status: str
    events: int
    append_p50_ms: float | None
    append_p95_ms: float | None
    append_throughput_events_per_sec: float | None
    read_throughput_events_per_sec: float | None
    wal_size_bytes: int | None
    last_offset: int | None
    committed_offset: int | None
    recovery_time_seconds: float | None
    command: str
    timestamp: str
    base_url: str
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark the event backend append/read path.")
    parser.add_argument("--events", type=int, default=1000)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-dir", default="benchmarks")
    parser.add_argument("--artifact-name", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--pending", action="store_true")
    return parser


def _command_line(args: argparse.Namespace) -> str:
    return " ".join(
        [
            "python scripts/benchmark_forgelog.py",
            f"--events {args.events}",
            f"--base-url {args.base_url}",
        ]
    )


def _pending_artifact(args: argparse.Namespace, note: str) -> dict[str, Any]:
    return EventBackendBenchmark(
        status="pending",
        events=args.events,
        append_p50_ms=None,
        append_p95_ms=None,
        append_throughput_events_per_sec=None,
        read_throughput_events_per_sec=None,
        wal_size_bytes=None,
        last_offset=None,
        committed_offset=None,
        recovery_time_seconds=None,
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


def run_benchmark(args: argparse.Namespace) -> dict[str, Any] | None:
    base_url = args.base_url.rstrip("/")
    try:
        with httpx.Client(timeout=10.0) as client:
            health = client.get(f"{base_url}/health")
            if health.status_code != 200:
                return None

            latencies: list[float] = []
            start = time.perf_counter()
            for _ in range(args.events):
                payload = {
                    "event_id": uuid.uuid4().hex,
                    "workflow_id": f"event-backend-{uuid.uuid4().hex[:8]}",
                    "event_type": "event-backend.benchmark",
                    "service_name": "benchmark",
                    "payload": {"kind": "benchmark"},
                }
                t0 = time.perf_counter()
                resp = client.post(f"{base_url}/append", json=payload)
                resp.raise_for_status()
                latencies.append((time.perf_counter() - t0) * 1000)

            append_seconds = max(time.perf_counter() - start, 1e-9)
            append_throughput = round(args.events / append_seconds, 2)

            read_start = time.perf_counter()
            read_resp = client.get(f"{base_url}/read", params={"offset": 0, "limit": args.events})
            read_resp.raise_for_status()
            read_seconds = max(time.perf_counter() - read_start, 1e-9)
            read_throughput = round(args.events / read_seconds, 2)

            stats_resp = client.get(f"{base_url}/stats")
            stats_resp.raise_for_status()
            stats = stats_resp.json()

            return {
                "status": "measured",
                "events": args.events,
                "append_p50_ms": _percentile(latencies, 50),
                "append_p95_ms": _percentile(latencies, 95),
                "append_throughput_events_per_sec": append_throughput,
                "read_throughput_events_per_sec": read_throughput,
                "wal_size_bytes": stats.get("wal_size"),
                "last_offset": stats.get("last_offset"),
                "committed_offset": stats.get("committed_offset"),
                "recovery_time_seconds": None,
            }
    except Exception as exc:
        return {"status": "pending", "note": f"event backend benchmark unavailable: {exc}"}


def main() -> None:
    args = build_parser().parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    name = args.artifact_name or f"event_backend_benchmark_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    json_path = output_dir / f"{name}.json"

    if args.dry_run or args.pending:
        artifact = _pending_artifact(args, "pending benchmark requested")
    else:
        live = run_benchmark(args)
        if live is None:
            artifact = _pending_artifact(args, f"event backend unavailable at {args.base_url}")
        elif live.get("status") != "measured":
            artifact = _pending_artifact(args, str(live.get("note", "event backend unavailable")))
        else:
            artifact = EventBackendBenchmark(
                status="measured",
                events=args.events,
                append_p50_ms=live["append_p50_ms"],
                append_p95_ms=live["append_p95_ms"],
                append_throughput_events_per_sec=live["append_throughput_events_per_sec"],
                read_throughput_events_per_sec=live["read_throughput_events_per_sec"],
                wal_size_bytes=live["wal_size_bytes"],
                last_offset=live["last_offset"],
                committed_offset=live["committed_offset"],
                recovery_time_seconds=live["recovery_time_seconds"],
                command=_command_line(args),
                timestamp=datetime.now(timezone.utc).isoformat(),
                base_url=args.base_url,
            ).to_dict()

    json_path.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json_path)


if __name__ == "__main__":
    main()
