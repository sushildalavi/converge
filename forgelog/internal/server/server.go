package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"converge/forgelog/internal/logstore"
)

type Handler struct {
	store *logstore.Store
	mux   *http.ServeMux
}

func New(store *logstore.Store) http.Handler {
	h := &Handler{
		store: store,
		mux:   http.NewServeMux(),
	}
	h.mux.HandleFunc("POST /append", h.handleAppend)
	h.mux.HandleFunc("GET /read", h.handleRead)
	h.mux.HandleFunc("POST /commit", h.handleCommit)
	h.mux.HandleFunc("GET /health", h.handleHealth)
	h.mux.HandleFunc("GET /stats", h.handleStats)
	return h.mux
}

func (h *Handler) handleAppend(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid body"})
		return
	}
	if !json.Valid(body) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "body must be valid json"})
		return
	}

	rec, err := h.store.Append(body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"offset": rec.Offset,
		"event":  json.RawMessage(body),
	})
}

func (h *Handler) handleRead(w http.ResponseWriter, r *http.Request) {
	offset := int64(0)
	if raw := r.URL.Query().Get("offset"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			offset = parsed
		}
	}
	limit := 100
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	records, nextOffset := h.store.ReadFrom(offset, limit)
	events := make([]map[string]any, 0, len(records))
	for _, rec := range records {
		events = append(events, map[string]any{
			"offset":      rec.Offset,
			"appended_at":  rec.AppendedAt,
			"event":        json.RawMessage(rec.Event),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"events":      events,
		"next_offset": nextOffset,
	})
}

func (h *Handler) handleCommit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Consumer string `json:"consumer"`
		Offset   int64  `json:"offset"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}
	if err := h.store.Commit(body.Consumer, body.Offset); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":           "ok",
		"consumer":         body.Consumer,
		"committed_offset": body.Offset,
	})
}

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	stats, err := h.store.Stats()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "down", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"backend": "event-backend",
		"stats":   stats,
	})
}

func (h *Handler) handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.store.Stats()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "down", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
