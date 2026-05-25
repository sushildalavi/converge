package recovery

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

func StartJanitor(ctx context.Context, rdb *redis.Client, interval time.Duration, run func(context.Context, *redis.Client)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run(ctx, rdb)
		}
	}
}

func AutoClaimPending(ctx context.Context, rdb *redis.Client, streamName, groupName, consumerName string, minIdle time.Duration) ([]redis.XMessage, error) {
	claimed := make([]redis.XMessage, 0)
	start := "0-0"

	for {
		msgs, nextStart, err := rdb.XAutoClaim(ctx, &redis.XAutoClaimArgs{
			Stream:   streamName,
			Group:    groupName,
			Consumer: consumerName,
			MinIdle:  minIdle,
			Start:    start,
			Count:    50,
		}).Result()
		if err != nil {
			if err == redis.Nil {
				return claimed, nil
			}
			return claimed, err
		}

		claimed = append(claimed, msgs...)
		if len(msgs) == 0 || nextStart == "0-0" {
			break
		}
		start = nextStart
	}

	return claimed, nil
}

func RequeueClaimed(ctx context.Context, claimed []redis.XMessage, out chan<- redis.XMessage) {
	for _, msg := range claimed {
		select {
		case <-ctx.Done():
			return
		case out <- msg:
		}
	}
}
