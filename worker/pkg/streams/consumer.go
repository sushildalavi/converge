package streams

import (
	"context"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// NewTaskChannel returns an explicitly unbuffered channel (capacity = 0).
// This forces XREADGROUP ingestion to block until a worker is ready to receive.
func NewTaskChannel() chan redis.XMessage {
	return make(chan redis.XMessage)
}

func EnsureConsumerGroup(ctx context.Context, rdb *redis.Client, streamName, groupName string) error {
	err := rdb.XGroupCreateMkStream(ctx, streamName, groupName, "$").Err()
	if err == nil {
		return nil
	}
	if strings.Contains(err.Error(), "BUSYGROUP") {
		return nil
	}
	return err
}

func ReadGroupLoop(ctx context.Context, rdb *redis.Client, streamName, groupName, consumerName string) ([]redis.XStream, error) {
	return rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    groupName,
		Consumer: consumerName,
		Streams:  []string{streamName, ">"},
		Count:    50,
		Block:    2 * time.Second,
	}).Result()
}

func StartBlockingLoop(ctx context.Context, rdb *redis.Client, streamName, groupName, consumerName string, handler func(redis.XMessage)) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		streams, err := ReadGroupLoop(ctx, rdb, streamName, groupName, consumerName)
		if err != nil {
			if err == redis.Nil {
				continue
			}
			return err
		}

		for _, s := range streams {
			for _, msg := range s.Messages {
				handler(msg)
			}
		}
	}
}

func SpawnWorkerPool(ctx context.Context, in <-chan redis.XMessage, handle func(redis.XMessage) bool) *sync.WaitGroup {
	workerCount := runtime.NumCPU() * 2
	wg := &sync.WaitGroup{}
	wg.Add(workerCount)

	for i := 0; i < workerCount; i++ {
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case msg := <-in:
					if handle(msg) {
						// Cooldown after successful execution gives DB/network layers
						// a deterministic timeslice to flush writes before hard termination.
						time.Sleep(100 * time.Millisecond)
					}
				}
			}
		}()
	}

	return wg
}
