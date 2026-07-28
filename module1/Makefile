# Config Service — common development tasks.
#
# Run `make` or `make help` for the list. Every target is safe to run twice.
# Bun is the package manager only; the application runs on Node.

SVC          := config-service

PG_CONTAINER := config-service-pg
PG_IMAGE     := postgres:16
PG_PORT      := 5435
PG_USER      := config
PG_PASSWORD  := config
PG_DB        := config_service
PG_TEST_DB   := config_service_test
PG_VOLUME    := config-service-pgdata

TEST_DATABASE_URL := postgresql://$(PG_USER):$(PG_PASSWORD)@localhost:$(PG_PORT)/$(PG_TEST_DB)?schema=public

.DEFAULT_GOAL := help
.PHONY: help setup install dev build start test test-watch lint check migrate migrate-test \
        db-up db-down db-shell db-reset clean

help: ## Show this help
	@echo "Config Service — make targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## --- Setup ---------------------------------------------------------------

setup: install db-up migrate migrate-test ## Prepare a fresh machine end to end
	@echo "Ready. Try: make test"

install: ## Install dependencies with Bun
	cd $(SVC) && bun install

## --- Development ---------------------------------------------------------

dev: db-up ## Run the service with reload (port 3999)
	cd $(SVC) && bun run dev

build: ## Compile TypeScript to dist/
	cd $(SVC) && bun run build

start: ## Run the compiled service on Node
	cd $(SVC) && bun run start

## --- Quality -------------------------------------------------------------

test: db-up ## Run the test suite against the test database
	cd $(SVC) && bun run test

test-watch: db-up ## Run tests in watch mode
	cd $(SVC) && bunx vitest watch

lint: ## Lint with ESLint
	cd $(SVC) && bun run lint

check: lint build test ## Everything CI would run: lint, build, test
	@echo "All checks passed."

## --- Database ------------------------------------------------------------

db-up: ## Start PostgreSQL and ensure both databases exist
	@if [ -z "$$(docker ps -q -f name=^$(PG_CONTAINER)$$)" ]; then \
	  if [ -n "$$(docker ps -aq -f name=^$(PG_CONTAINER)$$)" ]; then \
	    echo "Starting existing $(PG_CONTAINER)..."; \
	    docker start $(PG_CONTAINER) >/dev/null; \
	  else \
	    echo "Creating $(PG_CONTAINER) on port $(PG_PORT)..."; \
	    docker run -d --name $(PG_CONTAINER) \
	      -e POSTGRES_USER=$(PG_USER) \
	      -e POSTGRES_PASSWORD=$(PG_PASSWORD) \
	      -e POSTGRES_DB=$(PG_DB) \
	      -p $(PG_PORT):5432 \
	      -v $(PG_VOLUME):/var/lib/postgresql/data \
	      $(PG_IMAGE) >/dev/null; \
	  fi; \
	  printf "Waiting for PostgreSQL"; \
	  until docker exec $(PG_CONTAINER) pg_isready -U $(PG_USER) -q 2>/dev/null; do printf "."; sleep 1; done; \
	  echo " ready."; \
	fi
	@# CREATE DATABASE has no IF NOT EXISTS, so check first.
	@docker exec $(PG_CONTAINER) psql -U $(PG_USER) -d postgres -tAc \
	  "SELECT 1 FROM pg_database WHERE datname='$(PG_TEST_DB)'" | grep -q 1 || \
	  docker exec $(PG_CONTAINER) psql -U $(PG_USER) -d postgres -c "CREATE DATABASE $(PG_TEST_DB)" >/dev/null

db-down: ## Stop PostgreSQL (data is kept)
	docker stop $(PG_CONTAINER)

db-shell: db-up ## Open psql against the development database
	docker exec -it $(PG_CONTAINER) psql -U $(PG_USER) -d $(PG_DB)

migrate: db-up ## Create and apply a migration (development database)
	cd $(SVC) && bun run migrate

migrate-test: db-up ## Apply existing migrations to the test database
	cd $(SVC) && DATABASE_URL="$(TEST_DATABASE_URL)" bunx prisma migrate deploy

db-reset: db-up ## Drop and recreate both databases, then re-apply migrations
	@echo "Dropping and recreating $(PG_DB) and $(PG_TEST_DB)..."
	@docker exec $(PG_CONTAINER) psql -U $(PG_USER) -d postgres -c "DROP DATABASE IF EXISTS $(PG_DB)" >/dev/null
	@docker exec $(PG_CONTAINER) psql -U $(PG_USER) -d postgres -c "DROP DATABASE IF EXISTS $(PG_TEST_DB)" >/dev/null
	@docker exec $(PG_CONTAINER) psql -U $(PG_USER) -d postgres -c "CREATE DATABASE $(PG_DB)" >/dev/null
	@docker exec $(PG_CONTAINER) psql -U $(PG_USER) -d postgres -c "CREATE DATABASE $(PG_TEST_DB)" >/dev/null
	cd $(SVC) && bunx prisma migrate deploy
	cd $(SVC) && DATABASE_URL="$(TEST_DATABASE_URL)" bunx prisma migrate deploy

## --- Housekeeping --------------------------------------------------------

clean: ## Remove build output (leaves node_modules and the database alone)
	rm -rf $(SVC)/dist
