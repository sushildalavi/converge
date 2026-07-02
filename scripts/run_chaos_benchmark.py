from __future__ import annotations

import argparse
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.benchmark_replay import main


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


def _command_line(args: argparse.Namespace) -> str:
    parts = [
        "python scripts/run_chaos_benchmark.py",
        f"--events {args.events}",
        f"--workers {args.workers}",
    ]
    kill_worker_at = getattr(args, "kill_worker_at", "")
    if kill_worker_at:
        parts.append(f"--kill-worker-at {kill_worker_at}")
    base_url = getattr(args, "base_url", "")
    if base_url:
        parts.append(f"--base-url {base_url}")
    return " ".join(parts)


def build_artifact(
    args: argparse.Namespace,
    live: dict[str, Any] | None = None,
    *,
    status: str = "pending",
    note: str | None = None,
) -> dict[str, Any]:
    kill_worker_at = getattr(args, "kill_worker_at", "") or None
    payload = BenchmarkResult(
        status=live.get("status", "measured") if live else status,
        events=args.events,
        workers=args.workers,
        kill_worker_at=kill_worker_at,
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


if __name__ == "__main__":
    main()
