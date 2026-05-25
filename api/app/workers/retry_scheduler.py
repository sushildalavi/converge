from __future__ import annotations

import logging
import threading
import time

from app.core.redis_streams import (
    RETRY_ZSET,
    due_retry_event_ids,
    get_redis,
    publish_retry_stream,
    remove_from_retry_zset,
)

log = logging.getLogger(__name__)


def _flush_due_retries() -> int:
    event_ids = due_retry_event_ids()
    if not event_ids:
        return 0
    r = get_redis()
    flushed = 0
    for eid in event_ids:
        removed = r.zrem(RETRY_ZSET, eid)
        if removed:
            publish_retry_stream(eid)
            log.info("re-queued retry for event %s", eid)
            flushed += 1
    return flushed


class RetrySchedulerThread(threading.Thread):
    def __init__(self, interval: float = 1.0) -> None:
        super().__init__(daemon=True, name="retry-scheduler")
        self.interval = interval
        self._stop_event = threading.Event()

    def run(self) -> None:
        while not self._stop_event.wait(self.interval):
            try:
                _flush_due_retries()
            except Exception:
                log.exception("retry scheduler error")

    def stop(self) -> None:
        self._stop_event.set()
