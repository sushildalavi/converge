#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import time
import uuid

import psycopg2
import redis
from api.app.core.redis_streams import GROUP as REDIS_GROUP
from api.app.core.redis_streams import STREAM_INCOMING, STREAM_RETRY

STREAM = STREAM_INCOMING
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
TOTAL = int(os.getenv("CHAOS_TOTAL_EVENTS", "100000"))
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://replayforge_cp:replayforge_cp_pwd@localhost:5432/replayforge",
)
POST_KILL_CONVERGENCE_WAIT_SECONDS = 45
GROUP = os.getenv("CHAOS_GROUP", REDIS_GROUP)
ACTIVE_CONSUMER = os.getenv("CHAOS_ACTIVE_CONSUMER", "chaos-finalizer")


def kill_worker_mid_transit() -> None:
    result = subprocess.run(
        ["docker", "compose", "ps", "-q", "go-worker"],
        capture_output=True,
        text=True,
        check=False,
    )
    ids = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not ids:
        print("kill_skip reason=no_go_worker_containers")
        return

    victim = ids[-1]
    subprocess.run(["docker", "kill", victim], check=False)
    print(f"killed_container={victim}")


def verify_registry_state() -> None:
    deadline = time.time() + 180
    status_counts = {}

    while time.time() < deadline:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT status::text, COUNT(*)
                    FROM event_idempotency_registry
                    GROUP BY status
                    ORDER BY status
                    """
                )
                rows = cur.fetchall()
        status_counts = {status: count for status, count in rows}
        completed = status_counts.get("completed", 0)
        if completed >= TOTAL:
            break
        time.sleep(2)

    print("registry_status_counts=", status_counts)

    if status_counts.get("completed", 0) < TOTAL:
        raise RuntimeError(
            f"incomplete processing: completed={status_counts.get('completed', 0)} total={TOTAL}"
        )


def final_janitor_flush() -> None:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    for stream in (STREAM_INCOMING, STREAM_RETRY):
        consumers = client.xinfo_consumers(stream, GROUP)
        for c in consumers:
            pending = int(c.get("pending", 0))
            idle_ms = int(c.get("idle", 0))
            name = c.get("name", "")
            if pending <= 0:
                continue
            if name == ACTIVE_CONSUMER:
                continue
            if idle_ms < 5000:
                continue

            start = "0-0"
            seen_starts = set()
            while True:
                if start in seen_starts:
                    break
                seen_starts.add(start)
                msgs, next_start, _deleted = client.xautoclaim(
                    stream,
                    GROUP,
                    ACTIVE_CONSUMER,
                    min_idle_time=5000,
                    start_id=start,
                    count=100,
                )
                if not msgs or next_start == "0-0" or next_start == start:
                    break
                start = next_start


def seed_events() -> None:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    t0 = time.perf_counter()

    for i in range(TOTAL):
        event_uuid = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        payload = {
            "event_uuid": event_uuid,
            "pipeline_id": pipeline_id,
            "sequence": i,
            "payload": json.dumps({"kind": "chaos", "idx": i}),
        }
        client.xadd(STREAM, payload)

        if i == 30000:
            kill_worker_mid_transit()

        if i > 0 and i % 10000 == 0:
            print(f"seeded={i}")

    elapsed = time.perf_counter() - t0
    print(f"seed_complete total={TOTAL} elapsed_s={elapsed:.2f}")
    print(f"waiting_for_convergence_s={POST_KILL_CONVERGENCE_WAIT_SECONDS}")
    time.sleep(POST_KILL_CONVERGENCE_WAIT_SECONDS)
    final_janitor_flush()
    verify_registry_state()


if __name__ == "__main__":
    seed_events()
