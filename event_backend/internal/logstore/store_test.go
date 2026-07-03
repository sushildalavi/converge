package logstore

import (
	"encoding/json"
	"testing"
)

func TestAppendReturnsMonotonicOffsets(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer store.Close()

	first, err := store.Append(json.RawMessage(`{"n":1}`))
	if err != nil {
		t.Fatalf("Append first: %v", err)
	}
	second, err := store.Append(json.RawMessage(`{"n":2}`))
	if err != nil {
		t.Fatalf("Append second: %v", err)
	}
	if first.Offset != 1 || second.Offset != 2 {
		t.Fatalf("unexpected offsets: %+v %+v", first, second)
	}
}

func TestReadFromReturnsEventsInOrder(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer store.Close()

	if _, err := store.Append(json.RawMessage(`{"n":1}`)); err != nil {
		t.Fatalf("Append 1: %v", err)
	}
	if _, err := store.Append(json.RawMessage(`{"n":2}`)); err != nil {
		t.Fatalf("Append 2: %v", err)
	}

	records, next := store.ReadFrom(0, 10)
	if len(records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(records))
	}
	if next != 2 {
		t.Fatalf("expected next offset 2, got %d", next)
	}
	if string(records[0].Event) != `{"n":1}` || string(records[1].Event) != `{"n":2}` {
		t.Fatalf("records out of order: %+v", records)
	}
}

func TestRestartRecoversWalAndCheckpoint(t *testing.T) {
	dir := t.TempDir()

	store, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := store.Append(json.RawMessage(`{"n":1}`)); err != nil {
		t.Fatalf("Append: %v", err)
	}
	if err := store.Commit("worker-a", 1); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	reopened, err := New(dir)
	if err != nil {
		t.Fatalf("Reopen: %v", err)
	}
	defer reopened.Close()

	records, _ := reopened.ReadFrom(0, 10)
	if len(records) != 1 {
		t.Fatalf("expected 1 record after restart, got %d", len(records))
	}
	stats, err := reopened.Stats()
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if stats.CommittedOffset != 1 || stats.LastOffset != 1 {
		t.Fatalf("unexpected stats after restart: %+v", stats)
	}
}
