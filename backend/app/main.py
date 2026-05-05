import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

logging.basicConfig(level=settings.log_level)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    from app.core.redis_streams import STREAM_INCOMING, STREAM_RETRY, ensure_consumer_group
    try:
        ensure_consumer_group(STREAM_INCOMING)
        ensure_consumer_group(STREAM_RETRY)
    except Exception:
        log.warning("redis not ready on startup — consumer groups will be created lazily")
    yield


app = FastAPI(title="ReplayForge", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}


from app.api import routes_events  # noqa: E402
app.include_router(routes_events.router)
app.include_router(routes_events.demo_router)
