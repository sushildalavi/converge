package streams

import (
	"context"
	"errors"

	"github.com/redis/go-redis/v9"
)

func EnsureConsumerGroup(ctx context.Context, rdb *redis.Client, streamName, groupName string) error {
	err := rdb.XGroupCreateMkStream(ctx, streamName, groupName, "$").Err()
	if err == nil {
		return nil
	}
	if err != nil && isBusyGroup(err) {
		return nil
	}
	return err
}

func isBusyGroup(err error) bool {
	if err == nil {
		return false
	}
	return errors.Is(err, redis.ErrClosed) == false && containsBusyGroup(err.Error())
}

func containsBusyGroup(msg string) bool {
	return len(msg) >= 9 && (msg == "BUSYGROUP" || (len(msg) > 9 && msg[:9] == "BUSYGROUP"))
}
