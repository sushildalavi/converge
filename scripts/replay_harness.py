from __future__ import annotations

import asyncio
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class SubmittedEvent:
    event_id: str
    duplicate: bool
    submitted_at: float
    status_code: int
    error: str | None = None


@dataclass(frozen=True)
class TerminalEvent:
    event_id: str
    status: str
    e2e_ms: float


def compose(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", "compose", *args],
        cwd=REPO_ROOT,
        check=check,
        text=True,
        capture_output=True,
    )


def compose_service_ids(service: str) -> list[str]:
    result = compose("ps", "-q", service, check=True)
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def restart_go_workers(scale: int | None = None) -> None:
    args = ["up", "-d"]
    if scale is not None:
        args.extend(["--scale", f"go-worker={scale}"])
    else:
        args.append("--build")
    args.append("go-worker")
    compose(*args, check=True)


def restart_control_plane() -> None:
    compose("up", "-d", "--build", "control-plane", check=True)


def stop_one_go_worker() -> str | None:
    worker_ids = compose_service_ids("go-worker")
    if not worker_ids:
        return None
    worker_id = worker_ids[0]
    subprocess.run(
        ["docker", "stop", worker_id],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return worker_id


def start_one_go_worker() -> None:
    compose("up", "-d", "go-worker", check=True)


def build_headers(api_key: str = "") -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key
    return headers


async def wait_for_ready(base_url: str, timeout_seconds: float = 120.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        while time.monotonic() < deadline:
            try:
                response = await client.get(f"{base_url.rstrip('/')}/health/ready")
                if response.status_code == 200:
                    return response.json()
            except Exception:
                pass
            await asyncio.sleep(1)
    raise TimeoutError(f"backend not ready at {base_url}")


async def submit_events(
    base_url: str,
    payloads: list[dict[str, Any]],
    *,
    concurrency: int = 20,
    api_key: str = "",
    timeout_seconds: float = 30.0,
) -> list[SubmittedEvent]:
    sem = asyncio.Semaphore(max(1, concurrency))
    submitted: list[SubmittedEvent] = []

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds),
        headers=build_headers(api_key),
    ) as client:
        async def _submit(payload: dict[str, Any]) -> SubmittedEvent:
            async with sem:
                submitted_at = time.perf_counter()
                try:
                    response = await client.post(f"{base_url.rstrip('/')}/api/events", json=payload)
                    body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                    return SubmittedEvent(
                        event_id=str(body.get("id", "")),
                        duplicate=bool(body.get("duplicate")),
                        submitted_at=submitted_at,
                        status_code=response.status_code,
                    )
                except Exception as exc:
                    return SubmittedEvent(
                        event_id="",
                        duplicate=False,
                        submitted_at=submitted_at,
                        status_code=0,
                        error=str(exc),
                    )

        submitted = await asyncio.gather(*[_submit(payload) for payload in payloads])
    return submitted


async def wait_for_terminal_events(
    base_url: str,
    event_ids: list[str],
    submitted_at: dict[str, float],
    *,
    timeout_seconds: float = 180.0,
    poll_interval_seconds: float = 0.25,
    batch_size: int = 200,
) -> list[TerminalEvent]:
    pending = set(event_ids)
    results: dict[str, TerminalEvent] = {}
    deadline = time.monotonic() + timeout_seconds

    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        while pending and time.monotonic() < deadline:
            batch_ids = list(pending)[: max(1, batch_size)]
            batches = [batch_ids[i : i + max(1, batch_size)] for i in range(0, len(batch_ids), max(1, batch_size))]

            async def _poll_batch(batch: list[str]) -> list[dict[str, Any]]:
                try:
                    response = await client.post(
                        f"{base_url.rstrip('/')}/api/events/status",
                        json={"event_ids": batch},
                    )
                    if response.status_code != 200:
                        return []
                    body = response.json()
                    return body if isinstance(body, list) else []
                except Exception:
                    return []

            for body in await asyncio.gather(*[_poll_batch(batch) for batch in batches]):
                for item in body:
                    event_id = str(item.get("id", ""))
                    status = str(item.get("status", ""))
                    if event_id in pending and status in {"succeeded", "failed", "dead_lettered", "cancelled"}:
                        pending.discard(event_id)
                        results[event_id] = TerminalEvent(
                            event_id=event_id,
                            status=status,
                            e2e_ms=(time.perf_counter() - submitted_at[event_id]) * 1000.0,
                        )
            if pending:
                await asyncio.sleep(poll_interval_seconds)

    for event_id in pending:
        results[event_id] = TerminalEvent(
            event_id=event_id,
            status="timeout",
            e2e_ms=(time.perf_counter() - submitted_at[event_id]) * 1000.0,
        )
    return list(results.values())


async def fetch_json(base_url: str, path: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        response = await client.get(f"{base_url.rstrip('/')}{path}")
        response.raise_for_status()
        return response.json()


async def wait_for_convergence(
    base_url: str,
    *,
    timeout_seconds: float = 180.0,
    poll_interval_seconds: float = 1.0,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    last: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        try:
            last = await fetch_json(base_url, "/api/convergence")
            if last.get("converged"):
                return last
        except Exception:
            pass
        await asyncio.sleep(poll_interval_seconds)
    if last is None:
        raise TimeoutError(f"no convergence data returned by {base_url}")
    return last
