FROM python:3.11.9-slim

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libpq-dev curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

CMD ["sh", "-c", "alembic upgrade head 2>/dev/null || true; uvicorn app.main:app --host 0.0.0.0 --port 8000"]
