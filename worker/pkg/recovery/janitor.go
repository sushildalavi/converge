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
