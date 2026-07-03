from __future__ import annotations

from app.config import Settings


def test_event_backend_defaults_to_redis():
    settings = Settings()
    assert settings.normalized_event_backend == "redis"
    assert settings.event_backend_url.startswith("http://")
