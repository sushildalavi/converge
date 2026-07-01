#!/usr/bin/env python3
"""
Converge load test — measures ingestion throughput and end-to-end processing latency.

Prerequisites:
  docker compose up -d          # backend + 3 workers + postgres + redis
  Set RATE_LIMIT_WRITE_PER_MIN=10000 in backend/.env (or disable rate limiter)

Usage:
  python scripts/load_test.py                     # default: 200 events, 20 concurrent
  python scripts/load_test.py --events 500 --concurrency 50
  python scripts/load_test.py --base-url http://host:18000
"""
from __future__ import annotations

import argparse
import asyncio
import statistics
import time
import uuid
from dataclasses import dataclass, field

import httpx

DEFAULT_BASE_URL = "http://127.0.0.1:18000"
DEFAULT_EVENTS = 200
DEFAULT_CONCURRENCY = 20
POLL_INTERVAL = 0.3          # seconds between completion polls
POLL_TIMEOUT = 120           # max seconds to wait for all events to complete


@dataclass
class EventResult:
    event_id: str = ""
    ingestion_ms: float = 0.0
    e2e_ms: float = 0.0
    status: str = ""
    error: str = ""


@dataclass
class LoadTestReport:
    total_events: int = 0
    succeeded: int = 0
    failed: int = 0
    dead_lettered: int = 0
    duplicates: int = 0
    ingestion_errors: int = 0
    worker_count: int = 0
    wall_time_s: float = 0.0
    ingestion_throughput: float = 0.0     # events/sec (ingestion phase)
    ingestion_latencies_ms: list[float] = field(default_factory=list)
    e2e_latencies_ms: list[float] = field(default_factory=list)

    def print_summary(self) -> None:
        print("\n" + "=" * 60)
        print("  REPLAYFORGE LOAD TEST RESULTS")
        print("=" * 60)

        print(f"\n  Events sent:       {self.total_events}")
        print(f"  Ingestion errors:  {self.ingestion_errors}")
        print(f"  Duplicates:        {self.duplicates}")
        print(f"  Succeeded:         {self.succeeded}")
        print(f"  Failed:            {self.failed}")
        print(f"  Dead-lettered:     {self.dead_lettered}")
        print(f"  Workers observed:  {self.worker_count}")

        print(f"\n  Wall time:         {self.wall_time_s:.2f}s")
        print(f"  Ingestion rate:    {self.ingestion_throughput:.1f} events/sec")

        if self.ingestion_latencies_ms:
            ing = self.ingestion_latencies_ms
            print(f"\n  Ingestion latency (POST → 201):")
            print(f"    median:  {statistics.median(ing):.1f} ms")
            print(f"    p95:     {_percentile(ing, 95):.1f} ms")
            print(f"    p99:     {_percentile(ing, 99):.1f} ms")
            print(f"    max:     {max(ing):.1f} ms")

        if self.e2e_latencies_ms:
            e2e = self.e2e_latencies_ms
            print(f"\n  End-to-end latency (POST → worker finished):")
            print(f"    median:  {statistics.median(e2e):.1f} ms")
            print(f"    p95:     {_percentile(e2e, 95):.1f} ms")
            print(f"    p99:     {_percentile(e2e, 99):.1f} ms")
            print(f"    max:     {max(e2e):.1f} ms")

        print("\n" + "=" * 60)


def _percentile(data: list[float], pct: int) -> float:
    s = sorted(data)
    k = (len(s) - 1) * pct / 100
    f = int(k)
    c = f + 1
    if c >= len(s):
        return s[-1]
    return s[f] + (k - f) * (s[c] - s[f])


def _make_event(i: int) -> dict:
    return {
        "application_name": "loadtest",
        "workflow_id": f"wf-loadtest-{uuid.uuid4().hex[:8]}",
        "event_type": "order.created",
        "service_name": f"svc-{i % 5}",
        "idempotency_key": uuid.uuid4().hex,
        "payload": {"item": f"item-{i}", "amount": round(10 + i * 0.5, 2)},
        "metadata": {"source": "load_test", "seq": i},
        "max_attempts": 4,
    }


async def _ingest_one(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    base_url: str,
    event_data: dict,
) -> EventResult:
    result = EventResult()
    async with sem:
        t0 = time.perf_counter()
        try:
            resp = await client.post(f"{base_url}/api/events", json=event_data, timeout=30)
            result.ingestion_ms = (time.perf_counter() - t0) * 1000
            if resp.status_code == 201:
                body = resp.json()
                result.event_id = body["id"]
                result.status = "ingested"
                if body.get("duplicate"):
                    result.status = "duplicate"
            elif resp.status_code == 429:
                result.error = "rate_limited"
                result.status = "error"
            else:
                result.error = f"http_{resp.status_code}"
                result.status = "error"
        except Exception as e:
            result.ingestion_ms = (time.perf_counter() - t0) * 1000
            result.error = str(e)
            result.status = "error"
    return result


async def _poll_completion(
    client: httpx.AsyncClient,
    base_url: str,
    event_ids: list[str],
    submit_times: dict[str, float],
) -> list[EventResult]:
    """Poll until all events reach a terminal status or timeout."""
    pending = set(event_ids)
    results: dict[str, EventResult] = {}
    terminal = {"succeeded", "failed", "dead_lettered", "cancelled"}
    deadline = time.monotonic() + POLL_TIMEOUT

    while pending and time.monotonic() < deadline:
        await asyncio.sleep(POLL_INTERVAL)
        check = list(pending)[:50]  # batch polls to avoid overwhelming the API
        for eid in check:
            try:
                resp = await client.get(f"{base_url}/api/events/{eid}", timeout=10)
                if resp.status_code != 200:
                    continue
                body = resp.json()
                status = body.get("status", "")
                if status in terminal:
                    pending.discard(eid)
                    r = EventResult(event_id=eid, status=status)
                    # e2e latency: from ingestion submit to now
                    r.e2e_ms = (time.perf_counter() - submit_times[eid]) * 1000
                    results[eid] = r
            except Exception:
                pass

    # mark remaining as timed out
    for eid in pending:
        results[eid] = EventResult(event_id=eid, status="timeout")

    return list(results.values())


async def _get_worker_count(client: httpx.AsyncClient, base_url: str) -> int:
    try:
        resp = await client.get(f"{base_url}/api/workers", timeout=5)
        if resp.status_code == 200:
            workers = resp.json()
            return len([w for w in workers if w.get("status") == "active"])
    except Exception:
        pass
    return 0


async def run_load_test(base_url: str, total: int, concurrency: int) -> LoadTestReport:
    report = LoadTestReport(total_events=total)
    sem = asyncio.Semaphore(concurrency)
    events = [_make_event(i) for i in range(total)]

    async with httpx.AsyncClient() as client:
        # check health
        try:
            health = await client.get(f"{base_url}/health/live", timeout=5)
            if health.status_code != 200:
                print(f"ERROR: backend not healthy at {base_url}/health/live")
                return report
        except Exception as e:
            print(f"ERROR: cannot reach backend at {base_url} — {e}")
            return report

        report.worker_count = await _get_worker_count(client, base_url)
        print(f"Active workers: {report.worker_count}")
        print(f"Ingesting {total} events (concurrency={concurrency})...")

        # phase 1: ingest
        t_start = time.perf_counter()
        submit_times: dict[str, float] = {}
        tasks = []
        for ev in events:
            tasks.append(_ingest_one(client, sem, base_url, ev))

        ingestion_results = await asyncio.gather(*tasks)
        t_ingest_done = time.perf_counter()

        ingestion_wall = t_ingest_done - t_start
        ingested_ids = []
        for r in ingestion_results:
            if r.status == "ingested":
                ingested_ids.append(r.event_id)
                submit_times[r.event_id] = t_start  # approximate
                report.ingestion_latencies_ms.append(r.ingestion_ms)
            elif r.status == "duplicate":
                report.duplicates += 1
            else:
                report.ingestion_errors += 1

        ok_count = len(ingested_ids)
        report.ingestion_throughput = ok_count / ingestion_wall if ingestion_wall > 0 else 0
        print(f"Ingested {ok_count}/{total} in {ingestion_wall:.2f}s "
              f"({report.ingestion_throughput:.1f} events/sec)")

        if report.ingestion_errors > 0:
            sample_errors = [r.error for r in ingestion_results if r.status == "error"][:5]
            print(f"  ingestion errors ({report.ingestion_errors}): {sample_errors}")

        if not ingested_ids:
            print("No events ingested — skipping processing phase.")
            report.wall_time_s = ingestion_wall
            return report

        # phase 2: poll for worker completion
        print(f"Waiting for {ok_count} events to be processed (timeout={POLL_TIMEOUT}s)...")
        completion_results = await _poll_completion(client, base_url, ingested_ids, submit_times)

        t_done = time.perf_counter()
        report.wall_time_s = t_done - t_start

        for cr in completion_results:
            if cr.status == "succeeded":
                report.succeeded += 1
                report.e2e_latencies_ms.append(cr.e2e_ms)
            elif cr.status == "failed":
                report.failed += 1
                report.e2e_latencies_ms.append(cr.e2e_ms)
            elif cr.status == "dead_lettered":
                report.dead_lettered += 1
                report.e2e_latencies_ms.append(cr.e2e_ms)
            # timeout events have no e2e latency

        report.worker_count = await _get_worker_count(client, base_url)

    return report


def main():
    parser = argparse.ArgumentParser(description="Converge load test")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Backend URL")
    parser.add_argument("--events", type=int, default=DEFAULT_EVENTS, help="Total events to ingest")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY, help="Max concurrent requests")
    args = parser.parse_args()

    report = asyncio.run(run_load_test(args.base_url, args.events, args.concurrency))
    report.print_summary()


if __name__ == "__main__":
    main()
