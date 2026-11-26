# BlinkBuild

An AI-powered, browser-based website generator combining a **Next.js 16** client (Clerk auth, Monaco Editor, StackBlitz WebContainers) with a **Python FastAPI + CrewAI** multi-agent server (`Manager`, `Frontend`, `Backend`, `QA`), SQLite shared state, and hardened sibling-container QA sandboxes.

## Repository Structure

```text
BlinkBuild/
├── client/               # Next.js 16 frontend & SSE proxy routes
├── server/               # Python 3.11+ FastAPI + CrewAI multi-agent server
│   ├── app/              # api, agents, flows, llm, sandbox, state, config
│   ├── alembic/          # SQLite batch-mode database migrations
│   ├── colab/            # Optional demo Ollama + bearer-token ngrok notebook
│   ├── tests/            # Pytest suite (41 unit & integration tests)
│   ├── Dockerfile        # Non-root server container
│   └── sandbox.Dockerfile# Playwright + Node non-root QA sandbox image
├── docs/                 # Living docs: flow.md, decisions.md, activity-log.md, evaluation.md
├── docker-compose.yml    # client, server, docker-proxy (local dev), blinkbuild_sqlite_data volume
├── .env.example          # Required & optional environment variable names (no values)
├── PRD.md                # Product Requirements Document
└── PM.md                 # Project Plan
```

## Getting Started (Local Development)

### 1. Environment Variables

Copy `.env.example` to `.env` (for Docker Compose) and/or `client/.env.local` (for Next.js dev), and supply your values (see `docs/decisions.md` `D-016` for deferred model strings and limits):

```bash
cp .env.example .env
```

### 2. Client (`Next.js 16`, verified with Node `v22.20.0`, npm `11.13.0`)

```bash
cd client
npm ci
npm run build    # Production build
npm run dev      # Development server (http://localhost:3000)
```

### 3. Server (`FastAPI + CrewAI`, verified with Python `3.13.7`)

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"

# Run Alembic migrations against your SQLite path
SQLITE_DB_PATH=/tmp/blinkbuild.db .venv/bin/alembic upgrade head

# Run test suite
HOME=/tmp/crewai_home CREWAI_STORAGE_DIR=/tmp/crewai_storage .venv/bin/pytest -v
```

### 4. Docker Compose

```bash
# Build the pre-built QA sandbox image first
docker build -f server/sandbox.Dockerfile -t blinkbuild-sandbox:latest server/

# Start client, server, and local-dev docker-proxy
docker compose up -d --build
```

> **Security note:** `docker-proxy` is for local development only (`D-013`). Rootless Docker (or an evaluated body-inspecting proxy) is required before any public hosting.
