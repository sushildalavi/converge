package streams

import (
	"context"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

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
