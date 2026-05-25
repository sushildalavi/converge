package main

import (
	"crypto/sha1"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"replayforge/worker/pkg/idempotency"
	"replayforge/worker/pkg/recovery"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"replayforge/worker/pkg/streams"
)

type Application struct {
	Redis      *redis.Client
	DB         *pgxpool.Pool
	ShutdownCh chan struct{}
	TaskCh     chan redis.XMessage
}

func newApplication(ctx context.Context) (*Application, error) {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgresql://replayforge_cp:replayforge_cp_pwd@localhost:5432/replayforge"
	}

	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}

	return &Application{
		Redis:      rdb,
		DB:         db,
		ShutdownCh: make(chan struct{}),
		TaskCh:     make(chan redis.XMessage),
	}, nil
}

func waitForSignal() <-chan os.Signal {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	return sigCh
}

func (a *Application) Teardown() {
	close(a.ShutdownCh)
	a.DB.Close()
	_ = a.Redis.Close()
}

func ensureIdempotencySchema(ctx context.Context, app *Application) error {
	_, err := app.DB.Exec(ctx, `
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_status') THEN
				CREATE TYPE execution_status AS ENUM ('processing', 'completed', 'failed', 'terminal');
			END IF;
		END $$;
	`)
	if err != nil {
		return err
	}

	_, err = app.DB.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS event_idempotency_registry (
			event_uuid UUID PRIMARY KEY,
			pipeline_id UUID NOT NULL,
			status execution_status NOT NULL,
			retry_count INT NOT NULL DEFAULT 0,
			max_retries INT NOT NULL DEFAULT 3,
			side_effect_hash TEXT,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		return err
	}

	_, err = app.DB.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_event_idempotency_registry_pipeline_status
		ON event_idempotency_registry USING BTREE (pipeline_id, status);
	`)
	return err
}

func normalizeUUID(raw string) string {
	if raw == "" {
		return ""
	}
	// deterministic uuid-v5 compatible hash mapping for non-uuid inputs
	if strings.Count(raw, "-") == 4 && len(raw) == 36 {
		return raw
	}
	sum := sha1.Sum([]byte(raw))
	h := fmt.Sprintf("%x", sum)[:32]
	return fmt.Sprintf("%s-%s-%s-%s-%s", h[:8], h[8:12], h[12:16], h[16:20], h[20:32])
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	app, err := newApplication(ctx)
	if err != nil {
		log.Fatalf("worker boot failed: %v", err)
	}

	streamName := "workflow_events"
	groupName := "replay_forge_workers"
	consumerName, _ := os.Hostname()
	if consumerName == "" {
		consumerName = "go-worker"
	}

	if err := ensureIdempotencySchema(ctx, app); err != nil {
		log.Fatalf("schema ensure failed: %v", err)
	}

	if err := streams.EnsureConsumerGroup(ctx, app.Redis, streamName, groupName); err != nil {
		log.Fatalf("consumer group init failed: %v", err)
	}

	handle := func(msg redis.XMessage) bool {
		eventUUID := normalizeUUID(fmt.Sprintf("%v", msg.Values["event_uuid"]))
		pipelineID := normalizeUUID(fmt.Sprintf("%v", msg.Values["pipeline_id"]))
		if eventUUID == "" || pipelineID == "" {
			// Invalid payloads are non-recoverable; ack to avoid poison-message loops.
			_ = app.Redis.XAck(ctx, streamName, groupName, msg.ID).Err()
			return true
		}

		claim, err := idempotency.AtomicClaim(ctx, app.DB, eventUUID, pipelineID)
		if err != nil {
			// leave unacked on hard DB errors so janitor can reclaim
			return false
		}
		if !claim.Claimed && claim.Status == "completed" {
			// This message was previously committed in Postgres; safe to ack duplicate delivery.
			_ = app.Redis.XAck(ctx, streamName, groupName, msg.ID).Err()
			return true
		}
		if !claim.Claimed && claim.Status == "terminal" {
			_ = app.Redis.XAck(ctx, streamName, groupName, msg.ID).Err()
			return true
		}

		payloadBytes, _ := json.Marshal(msg.Values)
		persisted := false
		if err := idempotency.CommitCompleted(ctx, app.DB, eventUUID, payloadBytes); err != nil {
			_, _ = app.DB.Exec(ctx, `
				UPDATE event_idempotency_registry
				SET status='failed', retry_count=retry_count+1, updated_at=CURRENT_TIMESTAMP
				WHERE event_uuid=$1::uuid
			`, eventUUID)
			return false
		}
		persisted = true

		// Two-phase durability rule:
		// Redis ack is only allowed after the DB commit returned success.
		if persisted {
			_ = app.Redis.XAck(ctx, streamName, groupName, msg.ID).Err()
		}
		return true
	}

	wg := streams.SpawnWorkerPool(ctx, app.TaskCh, handle)

	go func() {
		err := streams.StartBlockingLoop(ctx, app.Redis, streamName, groupName, consumerName, func(msg redis.XMessage) {
			app.TaskCh <- msg
		})
		if err != nil && ctx.Err() == nil {
			log.Printf("stream loop stopped: %v", err)
		}
	}()

	go recovery.StartJanitor(ctx, app.Redis, 5*time.Second, func(runCtx context.Context, rdb *redis.Client) {
		claimed, err := recovery.AutoClaimPending(runCtx, rdb, streamName, groupName, consumerName, 30*time.Second)
		if err != nil || len(claimed) == 0 {
			return
		}
		recovery.RequeueClaimed(runCtx, claimed, app.TaskCh)
	})

	log.Println("go worker initialized; awaiting signal")
	<-waitForSignal()
	log.Println("signal intercepted; draining resources")
	time.Sleep(250 * time.Millisecond)
	cancel()
	wg.Wait()
	app.Teardown()
	log.Println("teardown complete")
}
