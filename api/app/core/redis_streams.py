from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from redis import Redis
from redis.exceptions import ResponseError

from app.config import settings

log = logging.getLogger(__name__)

STREAM_INCOMING = "events:incoming"
STREAM_RETRY = "events:retry"
STREAM_DLQ = "events:deadletter"
RETRY_ZSET = "events:retry:zset"
GROUP = "converge-workers"

_client: Redis | None = None


def get_redis() -> Redis:
    global _client
    if _client is None:
        _client = Redis.from_url(settings.redis_url, decode_responses=True)
    return _client


def ensure_consumer_group(stream: str) -> None:
    r = get_redis()
    try:
        r.xgroup_create(stream, GROUP, id="0", mkstream=True)
        log.info("created consumer group %s on %s", GROUP, stream)
    except ResponseError as exc:
        if "BUSYGROUP" in str(exc):
            pass
        else:
            raise


def publish_incoming(event_id: str) -> None:
    r = get_redis()
    r.xadd(STREAM_INCOMING, {"event_id": event_id}, maxlen=100_000, approximate=True)


def schedule_retry(event_id: str, run_at: datetime) -> None:
    r = get_redis()
    score = run_at.replace(tzinfo=timezone.utc).timestamp() if run_at.tzinfo else run_at.timestamp()
    r.zadd(RETRY_ZSET, {event_id: score})


def publish_deadletter(event_id: str, reason: str) -> None:
    r = get_redis()
    r.xadd(STREAM_DLQ, {"event_id": event_id, "reason": reason}, maxlen=100_000, approximate=True)


def due_retry_event_ids() -> list[str]:
    r = get_redis()
    now_ts = time.time()
    return r.zrangebyscore(RETRY_ZSET, 0, now_ts)


def remove_from_retry_zset(event_id: str) -> None:
    r = get_redis()
    r.zrem(RETRY_ZSET, event_id)


def publish_retry_stream(event_id: str) -> None:
    r = get_redis()
    r.xadd(STREAM_RETRY, {"event_id": event_id}, maxlen=100_000, approximate=True)
