# syntax=docker/dockerfile:1.7
# ── stage 1: build wheels ──────────────────────────────────
FROM python:3.11.9-slim AS builder

WORKDIR /build

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libpq-dev \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Install into a target dir we'll copy to runtime
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── stage 2: runtime ──────────────────────────────────────
FROM python:3.11.9-slim AS runtime

# Runtime deps only — no compilers, smaller image, smaller attack surface
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq5 curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

WORKDIR /app

# Copy installed packages and binaries
COPY --from=builder /install /usr/local

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

# Application code
COPY --chown=app:app . .

USER app

# Healthcheck used by docker compose; orchestrators (k8s/Cloud Run) use /health/ready
HEALTHCHECK --interval=15s --timeout=4s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8000/health/live || exit 1

EXPOSE 8000

# Default CMD is the API. Worker overrides via compose `command:`
CMD ["sh", "-c", "alembic upgrade head 2>/dev/null || true; exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
