package main

import (
	"log"
	"net/http"
	"os"

	"converge/forgelog/internal/logstore"
	"converge/forgelog/internal/server"
)

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	dataDir := getenv("EVENT_BACKEND_DATA_DIR", "/var/lib/event-backend")
	addr := getenv("EVENT_BACKEND_ADDR", ":9090")

	store, err := logstore.New(dataDir)
	if err != nil {
		log.Fatalf("event backend init failed: %v", err)
	}
	defer store.Close()

	log.Printf("event backend starting on %s with data dir %s", addr, dataDir)
	if err := http.ListenAndServe(addr, server.New(store)); err != nil {
		log.Fatalf("event backend exited: %v", err)
	}
}
