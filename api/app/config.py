from __future__ import annotations

import os
import socket
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


def _hostname_worker_name() -> str:
    """Per-container worker name derived from hostname (Docker container ID)."""
    host = socket.gethostname()
    return f"worker-{host[:12]}"


def _default_worker_name() -> str:
    explicit = os.getenv("WORKER_NAME", "").strip()
    return explicit if explicit else _hostname_worker_name()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── core ─────────────────────────────────────────────
    database_url: str = "postgresql://replayforge_cp:replayforge_cp_pwd@127.0.0.1:15432/replayforge"
    redis_url: str = "redis://127.0.0.1:16379/0"

    # ── worker ───────────────────────────────────────────
    worker_name: str = _default_worker_name()
    max_attempts: int = 4
    worker_heartbeat_interval: int = 5
    worker_stale_threshold: int = 30
    worker_xreadgroup_block_ms: int = 5000
    worker_xreadgroup_count: int = 10

    # ── ai ───────────────────────────────────────────────
    anthropic_api_key: str = ""
    ai_provider: str = "disabled"
    ollama_base_url: str = "http://localhost:11434"
    ai_model: str = "llama3.1:8b"
    ai_fallback_model: str = "qwen2.5-coder:7b"
    ai_timeout_seconds: int = 20

    # ── http ─────────────────────────────────────────────
    cors_origins: str = "http://localhost:5171"
    request_timeout_seconds: int = 30
    event_backend: str = "redis"  # "redis" or "forgelog"
    forgelog_url: str = "http://forgelog:9090"

    # ── security ─────────────────────────────────────────
    # Comma-separated list of allowed API keys for write endpoints
    # (empty in dev = unauthenticated; required in production)
    api_keys: str = ""
    rate_limit_write_per_min: int = 60
    rate_limit_read_per_min: int = 600
    max_request_body_bytes: int = 262144  # 256 KB

    # ── observability ────────────────────────────────────
    log_level: str = "INFO"
    log_format: str = "json"  # "json" or "text"
    environment: str = "development"  # "development" | "staging" | "production"

    # ── pool sizing ──────────────────────────────────────
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle: int = 300

    def model_post_init(self, _ctx) -> None:
        # If WORKER_NAME was set to empty string in env, replace with hostname-derived name
        if not self.worker_name or not self.worker_name.strip():
            object.__setattr__(self, "worker_name", _hostname_worker_name())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def api_keys_list(self) -> list[str]:
        return [k.strip() for k in self.api_keys.split(",") if k.strip()]

    @property
    def api_keys_set(self) -> bool:
        return len(self.api_keys_list) > 0

    @property
    def normalized_event_backend(self) -> str:
        backend = self.event_backend.strip().lower()
        return backend if backend in {"redis", "forgelog"} else "redis"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
