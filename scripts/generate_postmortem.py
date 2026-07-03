from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from app.core.recovery_postmortem import (
    RecoveryPostmortemOut,
    RecoveryPostmortemRequest,
    generate_recovery_postmortem,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate an evidence-grounded recovery postmortem.")
    parser.add_argument("--artifact", action="append", default=[], help="Path to a benchmark or chaos JSON artifact.")
    parser.add_argument("--workflow-id", default="", help="Optional workflow id to analyze from live API state.")
    parser.add_argument("--provider", default="", help="AI provider override: disabled, fake, or ollama.")
    parser.add_argument("--model", default="", help="Optional Ollama model override.")
    parser.add_argument("--base-url", default="", help="Optional live API base URL for convergence/workflow snapshots.")
    parser.add_argument("--output-dir", default="postmortems")
    parser.add_argument("--artifact-name", default="")
    parser.add_argument("--no-live-snapshot", action="store_true")
    return parser


def _load_json(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _fetch_live_snapshot(base_url: str, workflow_id: str) -> dict[str, Any]:
    if not base_url:
        return {}

    base = base_url.rstrip("/")
    snapshot: dict[str, Any] = {}
    with httpx.Client(timeout=15.0) as client:
        convergence = client.get(f"{base}/api/convergence")
        convergence.raise_for_status()
        snapshot["convergence_snapshot"] = convergence.json()

        workers = client.get(f"{base}/api/workers")
        workers.raise_for_status()
        snapshot["worker_snapshot"] = {"workers": workers.json()}

        if workflow_id:
            timeline = client.get(f"{base}/api/workflows/{workflow_id}/timeline")
            if timeline.status_code == 200:
                body = timeline.json()
                events = body.get("events", [])
                snapshot["workflow_snapshot"] = {
                    "workflow_id": body.get("workflow_id", workflow_id),
                    "events": len(events),
                    "succeeded": sum(1 for e in events if e.get("status") == "succeeded"),
                    "failed": sum(1 for e in events if e.get("status") == "failed"),
                    "dead_lettered": sum(1 for e in events if e.get("status") == "dead_lettered"),
                    "retrying": sum(1 for e in events if e.get("status") == "retrying"),
                    "in_flight": sum(1 for e in events if e.get("status") in {"received", "queued", "processing"}),
                }
    return snapshot


def build_request(args: argparse.Namespace) -> RecoveryPostmortemRequest:
    request_kwargs: dict[str, Any] = {
        "workflow_id": args.workflow_id or None,
        "artifact_paths": list(args.artifact or []),
        "provider": args.provider or None,
        "model": args.model or None,
        "include_live_snapshot": not args.no_live_snapshot,
    }
    if args.base_url:
        live = _fetch_live_snapshot(args.base_url, args.workflow_id or "")
        request_kwargs.update(live)
    return RecoveryPostmortemRequest(**request_kwargs)


def run_postmortem(args: argparse.Namespace) -> RecoveryPostmortemOut:
    request = build_request(args)
    return generate_recovery_postmortem(None, request)


def main() -> None:
    args = build_parser().parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    artifact_name = args.artifact_name or f"recovery_postmortem_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    json_path = output_dir / f"{artifact_name}.json"

    report = run_postmortem(args)
    payload = report.model_dump(mode="json")
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json_path)


if __name__ == "__main__":
    main()
