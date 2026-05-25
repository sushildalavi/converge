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
	minIdle = 5 * time.Second

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

// ForceReclaimDeadConsumerPEL scans consumer-group members and aggressively
// reclaims PEL messages from stale consumers.
//
// A consumer is considered stale when:
//   - it has pending messages, and
//   - its idle time is >= crashWindow.
//
// Reclaimed messages are reassigned to activeConsumer and returned.
func ForceReclaimDeadConsumerPEL(
	ctx context.Context,
	rdb *redis.Client,
	streamName, groupName, activeConsumer string,
	crashWindow time.Duration,
) ([]redis.XMessage, error) {
	consumers, err := rdb.XInfoConsumers(ctx, streamName, groupName).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, err
	}

	allClaimed := make([]redis.XMessage, 0)
	minIdle := 5 * time.Second
	if crashWindow > minIdle {
		minIdle = crashWindow
	}

	for _, c := range consumers {
		// Skip healthy/active members and empty PEL holders.
		if c.Pending <= 0 {
			continue
		}
		if c.Name == activeConsumer {
			continue
		}
		if time.Duration(c.Idle)*time.Millisecond < crashWindow {
			continue
		}

		start := "0-0"
		for {
			msgs, nextStart, claimErr := rdb.XAutoClaim(ctx, &redis.XAutoClaimArgs{
				Stream:   streamName,
				Group:    groupName,
				Consumer: activeConsumer,
				MinIdle:  minIdle,
				Start:    start,
				Count:    100,
			}).Result()
			if claimErr != nil {
				if claimErr == redis.Nil {
					break
				}
				return allClaimed, claimErr
			}

			allClaimed = append(allClaimed, msgs...)
			if len(msgs) == 0 || nextStart == "0-0" {
				break
			}
			start = nextStart
		}
	}

	return allClaimed, nil
}
