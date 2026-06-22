.PHONY: up down chaos load check test-backend test-frontend test-worker test-forgelog ci

up:
	docker compose up --build -d

down:
	docker compose down -v --remove-orphans

chaos:
	python3 tests/benchmark_chaos.py

load:
	python3 scripts/load_test.py

check:
	./scripts/check_state.sh

test-backend:
	cd api && pytest app/tests/ -v --ignore=app/tests/test_smoke_e2e.py

test-frontend:
	cd frontend && npm run typecheck && npm run build

test-worker:
	cd worker && go test ./... && go build ./...

test-forgelog:
	cd forgelog && go test ./...

ci: test-backend test-frontend test-worker test-forgelog
