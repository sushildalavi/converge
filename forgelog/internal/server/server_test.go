package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"replayforge/forgelog/internal/logstore"
)

func TestHealthStatsAndAppend(t *testing.T) {
	store, err := logstore.New(t.TempDir())
	if err != nil {
		t.Fatalf("New store: %v", err)
	}
	defer store.Close()

	h := New(store)

	health := httptest.NewRecorder()
	h.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/health", nil))
	if health.Code != http.StatusOK {
		t.Fatalf("health status = %d", health.Code)
	}

	appendReq := httptest.NewRequest(http.MethodPost, "/append", bytes.NewBufferString(`{"workflow_id":"wf-1"}`))
	appendRes := httptest.NewRecorder()
	h.ServeHTTP(appendRes, appendReq)
	if appendRes.Code != http.StatusCreated {
		t.Fatalf("append status = %d", appendRes.Code)
	}

	stats := httptest.NewRecorder()
	h.ServeHTTP(stats, httptest.NewRequest(http.MethodGet, "/stats", nil))
	if stats.Code != http.StatusOK {
		t.Fatalf("stats status = %d", stats.Code)
	}
}
