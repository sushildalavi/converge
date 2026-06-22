package logstore

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Record struct {
	Offset     int64           `json:"offset"`
	AppendedAt  time.Time       `json:"appended_at"`
	Event      json.RawMessage `json:"event"`
}

type committedState struct {
	CommittedOffsets map[string]int64 `json:"committed_offsets"`
}

type Stats struct {
	LastOffset     int64  `json:"last_offset"`
	CommittedOffset int64  `json:"committed_offset"`
	WALSize        int64  `json:"wal_size"`
	SegmentCount   int    `json:"segment_count"`
	LeaderID       string `json:"leader_id"`
	RaftState      string `json:"raft_state"`
}

type Store struct {
	mu              sync.Mutex
	dir             string
	walPath         string
	checkpointPath  string
	wal             *os.File
	records         []Record
	committed       map[string]int64
	lastOffset      int64
	committedOffset int64
}

func New(dir string) (*Store, error) {
	if dir == "" {
		dir = "."
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	walPath := filepath.Join(dir, "forgelog.wal")
	checkpointPath := filepath.Join(dir, "forgelog.checkpoint.json")

	wal, err := os.OpenFile(walPath, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0o644)
	if err != nil {
		return nil, err
	}

	store := &Store{
		dir:            dir,
		walPath:        walPath,
		checkpointPath: checkpointPath,
		wal:            wal,
		committed:      map[string]int64{},
	}

	if err := store.loadWal(); err != nil {
		_ = wal.Close()
		return nil, err
	}
	if err := store.loadCheckpoint(); err != nil {
		_ = wal.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.wal == nil {
		return nil
	}
	err := s.wal.Close()
	s.wal = nil
	return err
}

func (s *Store) loadWal() error {
	f, err := os.Open(s.walPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	defer f.Close()

	reader := bufio.NewReader(f)
	for {
		line, err := reader.ReadBytes('\n')
		if len(bytes.TrimSpace(line)) > 0 {
			var rec Record
			if uerr := json.Unmarshal(bytes.TrimSpace(line), &rec); uerr != nil {
				break
			}
			if rec.Offset > s.lastOffset {
				s.lastOffset = rec.Offset
			}
			s.records = append(s.records, rec)
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) loadCheckpoint() error {
	data, err := os.ReadFile(s.checkpointPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	var state committedState
	if err := json.Unmarshal(data, &state); err != nil {
		return err
	}
	if state.CommittedOffsets == nil {
		state.CommittedOffsets = map[string]int64{}
	}
	s.committed = state.CommittedOffsets
	for _, off := range s.committed {
		if off > s.committedOffset {
			s.committedOffset = off
		}
	}
	return nil
}

func (s *Store) persistCheckpointLocked() error {
	data, err := json.MarshalIndent(committedState{CommittedOffsets: s.committed}, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.checkpointPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.checkpointPath)
}

func (s *Store) Append(event json.RawMessage) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.wal == nil {
		return Record{}, fmt.Errorf("store closed")
	}

	s.lastOffset++
	rec := Record{
		Offset:    s.lastOffset,
		AppendedAt: time.Now().UTC(),
		Event:     append(json.RawMessage(nil), event...),
	}
	line, err := json.Marshal(rec)
	if err != nil {
		return Record{}, err
	}
	line = append(line, '\n')
	if _, err := s.wal.Write(line); err != nil {
		return Record{}, err
	}
	if err := s.wal.Sync(); err != nil {
		return Record{}, err
	}
	s.records = append(s.records, rec)
	return rec, nil
}

func (s *Store) ReadFrom(offset int64, limit int) ([]Record, int64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if limit <= 0 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	result := make([]Record, 0, limit)
	var nextOffset int64 = offset
	for _, rec := range s.records {
		if rec.Offset <= offset {
			continue
		}
		result = append(result, rec)
		nextOffset = rec.Offset
		if len(result) >= limit {
			break
		}
	}
	return result, nextOffset
}

func (s *Store) Commit(consumer string, offset int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if consumer == "" {
		consumer = "default"
	}
	if offset < 0 {
		offset = 0
	}
	if current, ok := s.committed[consumer]; !ok || offset > current {
		s.committed[consumer] = offset
	}
	s.committedOffset = int64(0)
	for _, off := range s.committed {
		if off > s.committedOffset {
			s.committedOffset = off
		}
	}
	return s.persistCheckpointLocked()
}

func (s *Store) Stats() (Stats, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	info, err := os.Stat(s.walPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return Stats{}, err
	}
	size := int64(0)
	if info != nil {
		size = info.Size()
	}
	return Stats{
		LastOffset:     s.lastOffset,
		CommittedOffset: s.committedOffset,
		WALSize:        size,
		SegmentCount:   1,
		LeaderID:       "",
		RaftState:      "standalone",
	}, nil
}
