from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql://replayforge:replayforge@localhost:5432/replayforge"
    redis_url: str = "redis://localhost:6379/0"
    anthropic_api_key: str = ""
    worker_name: str = "worker-1"
    max_attempts: int = 4
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
