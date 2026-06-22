package main

import (
	"log"
	"net/http"
	"os"

	"replayforge/forgelog/internal/logstore"
	"replayforge/forgelog/internal/server"
)

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	dataDir := getenv("FORGELOG_DATA_DIR", "/var/lib/forgelog")
	addr := getenv("FORGELOG_ADDR", ":9090")

	store, err := logstore.New(dataDir)
	if err != nil {
		log.Fatalf("forgelog init failed: %v", err)
	}
	defer store.Close()

	log.Printf("forgelog starting on %s with data dir %s", addr, dataDir)
	if err := http.ListenAndServe(addr, server.New(store)); err != nil {
		log.Fatalf("forgelog exited: %v", err)
	}
}
