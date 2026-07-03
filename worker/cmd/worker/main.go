package main

import (
	"context"
	"crypto/rand"
	"crypto/sha1"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"converge/worker/pkg/recovery"
	"converge/worker/pkg/streams"
)

const (
	streamIncoming           = "events:incoming"
	streamRetry              = "events:retry"
	streamDeadLetter         = "events:deadletter"
	retryZset                = "events:retry:zset"
	consumerGroup            = "converge-workers"
	processingStaleThreshold = 60 * time.Second
	staleWorkerGCThreshold   = 5 * time.Minute
)

var retryBackoff = []int{0, 10, 30, 60}

type application struct {
	redis *redis.Client
	db    *pgxpool.Pool
}

type workerState struct {
	mu             sync.Mutex
	currentEventID string
	workerID       string
	workerName     string
}

type workItem struct {
	stream string
	msg    redis.XMessage
}

type eventRecord struct {
	ID           string
	WorkflowID   string
	EventType    string
	ServiceName  string
	Status       string
	AttemptCount int
	MaxAttempts  int
	LastError    sql.NullString
	PayloadJSON  []byte
	UpdatedAt    time.Time
}

func getenv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%s",
		binary.BigEndian.Uint32(b[0:4]),
		binary.BigEndian.Uint16(b[4:6]),
		binary.BigEndian.Uint16(b[6:8]),
		binary.BigEndian.Uint16(b[8:10]),
		hex.EncodeToString(b[10:16]),
	)
}

func newApplication(ctx context.Context) (*application, error) {
	redisAddr := getenv("REDIS_ADDR", "localhost:6379")
	dsn := getenv("DATABASE_URL", "postgresql://converge_cp:converge_cp_pwd@127.0.0.1:15432/converge")

	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}

	return &application{redis: rdb, db: db}, nil
}

func (a *application) close() {
	a.db.Close()
	_ = a.redis.Close()
}

func registerWorker(ctx context.Context, db *pgxpool.Pool, workerName string) (string, error) {
	var id string
	err := db.QueryRow(ctx,
		`SELECT id::text FROM workers WHERE worker_name = $1`,
		workerName,
	).Scan(&id)
	if err == nil {
		_, err = db.Exec(ctx,
			`UPDATE workers SET status='active', last_heartbeat_at = CURRENT_TIMESTAMP, current_event_id = NULL WHERE worker_name = $1`,
			workerName,
		)
		return id, err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	id = newUUID()
	_, err = db.Exec(ctx, `
		INSERT INTO workers (id, worker_name, status, last_heartbeat_at, current_event_id, created_at, updated_at)
		VALUES ($1::uuid, $2, 'active', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`, id, workerName)
	return id, err
}

func cleanupStaleWorkers(ctx context.Context, db *pgxpool.Pool) (int64, error) {
	cutoff := fmt.Sprintf("%d minutes", int(staleWorkerGCThreshold.Minutes()))
	res, err := db.Exec(ctx, `
		DELETE FROM workers
		WHERE last_heartbeat_at < CURRENT_TIMESTAMP - $1::interval
	`, cutoff)
	return res.RowsAffected(), err
}

func updateWorkerHeartbeat(ctx context.Context, db *pgxpool.Pool, workerID string, state *workerState) error {
	state.mu.Lock()
	currentEventID := state.currentEventID
	state.mu.Unlock()

	status := "active"
	if currentEventID != "" {
		status = "busy"
	}

	_, err := db.Exec(ctx, `
		UPDATE workers
		SET last_heartbeat_at = CURRENT_TIMESTAMP,
		    status = $2,
		    current_event_id = CASE WHEN $3 = '' THEN NULL ELSE $3::uuid END
		WHERE id = $1::uuid
	`, workerID, status, currentEventID)
	return err
}

func markWorkerStopped(ctx context.Context, db *pgxpool.Pool, workerID string) error {
	_, err := db.Exec(ctx, `
		UPDATE workers
		SET status = 'stopped',
		    current_event_id = NULL
		WHERE id = $1::uuid
	`, workerID)
	return err
}

func setCurrentEventID(state *workerState, eventID string) {
	state.mu.Lock()
	state.currentEventID = eventID
	state.mu.Unlock()
}

func currentEventID(state *workerState) string {
	state.mu.Lock()
	defer state.mu.Unlock()
	return state.currentEventID
}

func loadEventForProcessing(ctx context.Context, tx pgx.Tx, eventID string) (*eventRecord, bool, error) {
	row := tx.QueryRow(ctx, `
		SELECT
			id::text,
			workflow_id,
			event_type,
			service_name,
			status,
			attempt_count,
			max_attempts,
			COALESCE(last_error, ''),
			payload_json::text,
			updated_at
		FROM events
		WHERE id = $1::uuid
		FOR UPDATE
	`, eventID)

	record := &eventRecord{}
	var payloadText string
	if err := row.Scan(
		&record.ID,
		&record.WorkflowID,
		&record.EventType,
		&record.ServiceName,
		&record.Status,
		&record.AttemptCount,
		&record.MaxAttempts,
		&record.LastError,
		&payloadText,
		&record.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}
	record.PayloadJSON = []byte(payloadText)
	return record, true, nil
}

func claimEvent(ctx context.Context, db *pgxpool.Pool, eventID string) (*eventRecord, bool, error) {
	tx, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)

	record, found, err := loadEventForProcessing(ctx, tx, eventID)
	if err != nil || !found {
		if err == nil {
			_ = tx.Commit(ctx)
		}
		return record, found, err
	}

	switch record.Status {
	case "succeeded", "dead_lettered", "cancelled":
		if err := tx.Commit(ctx); err != nil {
			return nil, false, err
		}
		return record, false, nil
	case "processing":
		if time.Since(record.UpdatedAt) < processingStaleThreshold {
			if err := tx.Commit(ctx); err != nil {
				return nil, false, err
			}
			return record, false, nil
		}
	}

	_, err = tx.Exec(ctx, `
		UPDATE events
		SET status = 'processing',
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1::uuid
	`, eventID)
	if err != nil {
		return nil, false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	record.Status = "processing"
	return record, true, nil
}

func payloadMap(record *eventRecord) map[string]any {
	payload := map[string]any{}
	_ = json.Unmarshal(record.PayloadJSON, &payload)
	return payload
}

func boolFlag(payload map[string]any, key string) bool {
	raw, ok := payload[key]
	if !ok {
		return false
	}
	switch v := raw.(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(strings.TrimSpace(v), "true")
	case float64:
		return v != 0
	default:
		return false
	}
}

func deterministicFailure(eventID, eventType string, attempt int) bool {
	rates := map[string]float64{
		"payment.authorized": 0.15,
		"inventory.reserved": 0.10,
		"email.receipt_sent": 0.25,
	}
	rate := rates[eventType]
	if rate <= 0 {
		return false
	}

	sum := sha1.Sum([]byte(fmt.Sprintf("%s:%d", eventID, attempt)))
	value := float64(binary.BigEndian.Uint64(sum[:8])) / float64(math.MaxUint64)
	return value < rate
}

func simulateProcessing(record *eventRecord) error {
	payload := payloadMap(record)
	attempt := record.AttemptCount + 1

	if boolFlag(payload, "_force_fail") {
		return errors.New("forced failure via _force_fail flag")
	}
	if boolFlag(payload, "_force_crash") {
		return errors.New("simulated worker crash")
	}
	if deterministicFailure(record.ID, record.EventType, attempt) {
		return fmt.Errorf("%s failed (simulated)", record.EventType)
	}

	time.Sleep(50*time.Millisecond + time.Duration(binary.BigEndian.Uint16([]byte(record.ID)[:2])%100)*2*time.Millisecond)
	return nil
}

func nextRetryDelay(attempt int) int {
	idx := attempt - 1
	if idx < 0 || idx >= len(retryBackoff) {
		return -1
	}
	return retryBackoff[idx]
}

func finalizeSuccess(ctx context.Context, db *pgxpool.Pool, record *eventRecord, workerID, workerName string, attemptNum int, startedAt time.Time) error {
	finishedAt := time.Now().UTC()
	durationMS := int(finishedAt.Sub(startedAt).Milliseconds())

	tx, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO event_attempts (
			id, event_id, attempt_number, worker_id, worker_name, status, error_message, metadata_json, started_at, finished_at, duration_ms
		)
		VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, 'succeeded', NULL, '{}'::jsonb, $6, $7, $8)
	`, newUUID(), record.ID, attemptNum, workerID, workerName, startedAt, finishedAt, durationMS)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE events
		SET status = 'succeeded',
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1::uuid
	`, record.ID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func finalizeFailure(ctx context.Context, db *pgxpool.Pool, rdb *redis.Client, record *eventRecord, workerID, workerName string, attemptNum int, startedAt time.Time, errValue error) error {
	finishedAt := time.Now().UTC()
	durationMS := int(finishedAt.Sub(startedAt).Milliseconds())
	errorMessage := errValue.Error()
	nextAttemptCount := record.AttemptCount + 1

	tx, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO event_attempts (
			id, event_id, attempt_number, worker_id, worker_name, status, error_message, metadata_json, started_at, finished_at, duration_ms
		)
		VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, 'failed', $6, '{}'::jsonb, $7, $8, $9)
	`, newUUID(), record.ID, attemptNum, workerID, workerName, errorMessage, startedAt, finishedAt, durationMS)
	if err != nil {
		return err
	}

	if nextAttemptCount >= record.MaxAttempts {
		_, err = tx.Exec(ctx, `
		INSERT INTO dead_letters (id, event_id, reason, last_error, created_at, replayed_at, replay_status)
		VALUES ($1::uuid, $2::uuid, $3, $4, CURRENT_TIMESTAMP, NULL, NULL)
	`, newUUID(), record.ID, "max_attempts_exceeded", errorMessage)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			UPDATE events
			SET status = 'dead_lettered',
			    attempt_count = $2,
			    last_error = $3,
			    next_retry_at = NULL,
			    updated_at = CURRENT_TIMESTAMP
			WHERE id = $1::uuid
		`, record.ID, nextAttemptCount, errorMessage)
		if err != nil {
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		if err := publishDeadLetter(ctx, rdb, record.ID, "max_attempts_exceeded"); err != nil {
			log.Printf("failed to publish dead letter for %s: %v", record.ID, err)
		}
		return nil
	}

	delay := nextRetryDelay(nextAttemptCount)
	if delay < 0 {
		delay = 0
	}
	retryAt := time.Now().UTC().Add(time.Duration(delay) * time.Second)
	_, err = tx.Exec(ctx, `
		UPDATE events
		SET status = 'retrying',
		    attempt_count = $2,
		    last_error = $3,
		    next_retry_at = $4,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1::uuid
	`, record.ID, nextAttemptCount, errorMessage, retryAt)
	if err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if err := scheduleRetry(ctx, rdb, record.ID, retryAt); err != nil {
		log.Printf("failed to schedule retry for %s: %v", record.ID, err)
	}
	return nil
}

func publishDeadLetter(ctx context.Context, rdb *redis.Client, eventID string, reason string) error {
	return rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: streamDeadLetter,
		MaxLen: 100_000,
		Approx: true,
		Values: map[string]any{
			"event_id": eventID,
			"reason":   reason,
		},
	}).Err()
}

func scheduleRetry(ctx context.Context, rdb *redis.Client, eventID string, runAt time.Time) error {
	return rdb.ZAdd(ctx, retryZset, redis.Z{
		Score:  float64(runAt.Unix()),
		Member: eventID,
	}).Err()
}

func flushDueRetries(ctx context.Context, rdb *redis.Client) error {
	eventIDs, err := rdb.ZRangeByScore(ctx, retryZset, &redis.ZRangeBy{
		Min: "0",
		Max: fmt.Sprintf("%d", time.Now().UTC().Unix()),
	}).Result()
	if err != nil {
		return err
	}
	for _, eventID := range eventIDs {
		removed, err := rdb.ZRem(ctx, retryZset, eventID).Result()
		if err != nil {
			return err
		}
		if removed > 0 {
			if err := rdb.XAdd(ctx, &redis.XAddArgs{
				Stream: streamRetry,
				MaxLen: 100_000,
				Approx: true,
				Values: map[string]any{"event_id": eventID},
			}).Err(); err != nil {
				return err
			}
			log.Printf("re-queued retry for event %s", eventID)
		}
	}
	return nil
}

func handleWorkItem(ctx context.Context, app *application, state *workerState, item workItem) {
	eventID, ok := item.msg.Values["event_id"].(string)
	if !ok || strings.TrimSpace(eventID) == "" {
		if err := app.redis.XAck(ctx, item.stream, consumerGroup, item.msg.ID).Err(); err != nil {
			log.Printf("ack failed for malformed message %s: %v", item.msg.ID, err)
		}
		return
	}

	record, claimed, err := claimEvent(ctx, app.db, eventID)
	if err != nil {
		log.Printf("failed to claim event %s: %v", eventID, err)
		return
	}
	if !claimed || record == nil {
		if err := app.redis.XAck(ctx, item.stream, consumerGroup, item.msg.ID).Err(); err != nil {
			log.Printf("ack failed for skipped event %s: %v", eventID, err)
		}
		return
	}

	setCurrentEventID(state, record.ID)
	defer setCurrentEventID(state, "")
	startedAt := time.Now().UTC()
	attemptNum := record.AttemptCount + 1

	processErr := simulateProcessing(record)
	if processErr == nil {
		if err := finalizeSuccess(ctx, app.db, record, state.workerID, state.workerName, attemptNum, startedAt); err != nil {
			log.Printf("failed to finalize success for %s: %v", record.ID, err)
			return
		}
		if err := app.redis.XAck(ctx, item.stream, consumerGroup, item.msg.ID).Err(); err != nil {
			log.Printf("ack failed for succeeded event %s: %v", record.ID, err)
			return
		}
		log.Printf("event succeeded event_id=%s attempt=%d", record.ID, attemptNum)
		return
	}

	if err := finalizeFailure(ctx, app.db, app.redis, record, state.workerID, state.workerName, attemptNum, startedAt, processErr); err != nil {
		log.Printf("failed to finalize failure for %s: %v", record.ID, err)
		return
	}
	if err := app.redis.XAck(ctx, item.stream, consumerGroup, item.msg.ID).Err(); err != nil {
		log.Printf("ack failed for failed event %s: %v", record.ID, err)
		return
	}
	if record.AttemptCount+1 >= record.MaxAttempts {
		log.Printf("event dead-lettered event_id=%s attempts=%d", record.ID, record.AttemptCount+1)
	} else {
		log.Printf("event retry scheduled event_id=%s attempts=%d", record.ID, record.AttemptCount+1)
	}
}

func reclaimPending(ctx context.Context, app *application, state *workerState, consumerName string) {
	for _, streamName := range []string{streamIncoming, streamRetry} {
		claimed, err := recovery.AutoClaimPending(ctx, app.redis, streamName, consumerGroup, consumerName, 30*time.Second)
		if err == nil && len(claimed) > 0 {
			log.Printf("reclaimed %d pending message(s) from %s", len(claimed), streamName)
			for _, msg := range claimed {
				handleWorkItem(ctx, app, state, workItem{stream: streamName, msg: msg})
			}
		}
		forced, err := recovery.ForceReclaimDeadConsumerPEL(ctx, app.redis, streamName, consumerGroup, consumerName, 5*time.Second)
		if err == nil && len(forced) > 0 {
			log.Printf("force-reclaimed %d orphaned message(s) from %s", len(forced), streamName)
			for _, msg := range forced {
				handleWorkItem(ctx, app, state, workItem{stream: streamName, msg: msg})
			}
		}
	}
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	app, err := newApplication(ctx)
	if err != nil {
		log.Fatalf("worker boot failed: %v", err)
	}
	defer app.close()

	workerName := getenv("WORKER_NAME", "")
	if workerName == "" {
		host, _ := os.Hostname()
		if host == "" {
			host = "worker"
		}
		workerName = fmt.Sprintf("go-%s", host[:min(len(host), 12)])
	}
	log.Printf("worker starting worker=%s", workerName)

	if err := streams.EnsureConsumerGroup(ctx, app.redis, streamIncoming, consumerGroup); err != nil {
		log.Fatalf("consumer group init failed for %s: %v", streamIncoming, err)
	}
	if err := streams.EnsureConsumerGroup(ctx, app.redis, streamRetry, consumerGroup); err != nil {
		log.Fatalf("consumer group init failed for %s: %v", streamRetry, err)
	}

	staleCount, err := cleanupStaleWorkers(ctx, app.db)
	if err == nil && staleCount > 0 {
		log.Printf("garbage-collected stale workers count=%d", staleCount)
	}

	workerID, err := registerWorker(ctx, app.db, workerName)
	if err != nil {
		log.Fatalf("worker registration failed: %v", err)
	}
	log.Printf("worker registered worker_id=%s worker_name=%s", workerID, workerName)

	state := &workerState{
		workerID:   workerID,
		workerName: workerName,
	}

	heartbeatStop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Duration(maxInt(1, getenvInt("WORKER_HEARTBEAT_INTERVAL", 5))) * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-heartbeatStop:
				return
			case <-ticker.C:
				if err := updateWorkerHeartbeat(ctx, app.db, workerID, state); err != nil {
					log.Printf("heartbeat failed: %v", err)
				}
			}
		}
	}()

	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-heartbeatStop:
				return
			case <-ticker.C:
				if err := flushDueRetries(ctx, app.redis); err != nil {
					log.Printf("retry scheduler error: %v", err)
				}
			}
		}
	}()

	reclaimPending(ctx, app, state, workerName)

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(shutdown)

	workCh := make(chan workItem, runtime.NumCPU()*2)
	var wg sync.WaitGroup
	for i := 0; i < runtime.NumCPU()*2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case item := <-workCh:
					handleWorkItem(ctx, app, state, item)
				}
			}
		}()
	}

	readStream := func(streamName string) {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			results, err := app.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    consumerGroup,
				Consumer: workerName,
				Streams:  []string{streamName, ">"},
				Count:    int64(getenvInt("WORKER_XREADGROUP_COUNT", 10)),
				Block:    time.Duration(getenvInt("WORKER_XREADGROUP_BLOCK_MS", 5000)) * time.Millisecond,
			}).Result()
			if err != nil {
				if errors.Is(err, redis.Nil) {
					continue
				}
				log.Printf("xreadgroup failed stream=%s: %v", streamName, err)
				time.Sleep(time.Second)
				continue
			}
			for _, stream := range results {
				for _, msg := range stream.Messages {
					item := workItem{stream: stream.Stream, msg: msg}
					select {
					case <-ctx.Done():
						return
					case workCh <- item:
					}
				}
			}
		}
	}

	wg.Add(2)
	go readStream(streamIncoming)
	go readStream(streamRetry)

	janitorStop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-janitorStop:
				return
			case <-ticker.C:
				reclaimPending(ctx, app, state, workerName)
			}
		}
	}()

	log.Printf("worker initialized; awaiting signal")
	<-shutdown
	log.Printf("signal intercepted; draining resources")
	cancel()
	close(heartbeatStop)
	close(janitorStop)
	wg.Wait()
	if err := markWorkerStopped(context.Background(), app.db, workerID); err != nil {
		log.Printf("could not mark worker stopped: %v", err)
	}
	log.Printf("worker stopped cleanly")
}

func getenvInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	var parsed int
	if _, err := fmt.Sscanf(raw, "%d", &parsed); err == nil && parsed > 0 {
		return parsed
	}
	return fallback
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
