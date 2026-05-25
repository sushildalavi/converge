package idempotency

import (
	"context"
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
	err = tx.QueryRow(ctx, `
		SELECT status::text
		FROM event_idempotency_registry
		WHERE event_uuid = $1::uuid
		FOR UPDATE
	`, eventUUID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ClaimResult{}, err
		}
		return ClaimResult{}, err
	}

	result, err := evaluateLockedState(status)
	if err != nil {
		return ClaimResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return ClaimResult{}, err
	}
	return result, nil
}

func evaluateLockedState(status string) (ClaimResult, error) {
	switch status {
	case "completed":
		return ClaimResult{Claimed: false, Status: "completed"}, nil
	case "processing":
		return ClaimResult{Claimed: false, Status: "processing"}, fmt.Errorf("event is currently processing")
	default:
		return ClaimResult{Claimed: false, Status: status}, nil
	}
}
