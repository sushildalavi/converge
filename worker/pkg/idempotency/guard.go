package idempotency

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ClaimResult struct {
	Claimed bool
	Status  string
}

func AtomicClaim(ctx context.Context, db *pgxpool.Pool, eventUUID, pipelineID string) (ClaimResult, error) {
	cmd, err := db.Exec(ctx, `
		INSERT INTO event_idempotency_registry (event_uuid, pipeline_id, status)
		VALUES ($1::uuid, $2::uuid, 'processing')
		ON CONFLICT (event_uuid) DO NOTHING
	`, eventUUID, pipelineID)
	if err != nil {
		return ClaimResult{}, err
	}

	if cmd.RowsAffected() == 1 {
		return ClaimResult{Claimed: true, Status: "processing"}, nil
	}

	tx, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return ClaimResult{}, err
	}
	defer tx.Rollback(ctx)

	var status string
	var retryCount int
	var maxRetries int
	err = tx.QueryRow(ctx, `
		SELECT status::text, retry_count, max_retries
		FROM event_idempotency_registry
		WHERE event_uuid = $1::uuid
		FOR UPDATE
	`, eventUUID).Scan(&status, &retryCount, &maxRetries)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ClaimResult{}, err
		}
		return ClaimResult{}, err
	}

	result, err := evaluateLockedState(ctx, tx, eventUUID, status, retryCount, maxRetries)
	if err != nil {
		return ClaimResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return ClaimResult{}, err
	}
	return result, nil
}

func evaluateLockedState(ctx context.Context, tx pgx.Tx, eventUUID, status string, retryCount, maxRetries int) (ClaimResult, error) {
	switch status {
	case "completed":
		return ClaimResult{Claimed: false, Status: "completed"}, nil
	case "processing":
		return ClaimResult{Claimed: false, Status: "processing"}, fmt.Errorf("event is currently processing")
	case "failed":
		if retryCount >= maxRetries {
			if _, err := tx.Exec(ctx, `
				UPDATE event_idempotency_registry
				SET status = 'terminal', updated_at = CURRENT_TIMESTAMP
				WHERE event_uuid = $1::uuid
			`, eventUUID); err != nil {
				return ClaimResult{}, err
			}
			return ClaimResult{Claimed: false, Status: "terminal"}, nil
		}
		return ClaimResult{Claimed: true, Status: "processing"}, nil
	default:
		return ClaimResult{Claimed: false, Status: status}, nil
	}
}

func CommitCompleted(ctx context.Context, db *pgxpool.Pool, eventUUID string, sideEffectPayload []byte) error {
	tx, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	h := sha256.Sum256(sideEffectPayload)
	hash := hex.EncodeToString(h[:])

	_, err = tx.Exec(ctx, `
		UPDATE event_idempotency_registry
		SET status = 'completed', side_effect_hash = $2, updated_at = CURRENT_TIMESTAMP
		WHERE event_uuid = $1::uuid
	`, eventUUID, hash)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}
