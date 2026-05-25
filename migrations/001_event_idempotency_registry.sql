CREATE TYPE execution_status AS ENUM ('processing', 'completed', 'failed', 'terminal');

CREATE TABLE event_idempotency_registry (
    event_uuid UUID PRIMARY KEY,
    pipeline_id UUID NOT NULL,
    status execution_status NOT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    side_effect_hash TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_idempotency_registry_pipeline_status
    ON event_idempotency_registry USING BTREE (pipeline_id, status);
