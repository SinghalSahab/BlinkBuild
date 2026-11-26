# BlinkBuild System Flow

Last updated: 2026-11-26 | Task: P14-T5

## 1. What BlinkBuild Does Now

BlinkBuild is an AI-powered, browser-based website generator built on Next.js 16 (App Router) and Clerk authentication. A signed-in user enters a natural-language prompt on the landing page, is redirected to `/generate?prompt=...`, and the app calls two Next.js API routes backed by Google Gemini 2.5 Flash (`/api/template` and `/api/chat`) to generate a React or Node.js project in `<boltArtifact>` XML format, parses it into steps and a nested file tree, displays the code in a read-only Monaco Editor, and runs a live preview directly inside the browser using StackBlitz WebContainers.

## 2. Codebases (`client` and `server`)

- **Current state (Phase 2 complete):**
  - `client/`: The Next.js 16 application (`client/app/`, `client/components/`, `client/hooks/`, `client/lib/`, `client/public/`, `client/Dockerfile`).
  - `server/`: Python FastAPI skeleton (`server/app/main.py`, `server/app/config/settings.py`, `server/app/api/auth.py`, `server/pyproject.toml`, `server/Dockerfile`, `server/tests/`), running privately on the Docker Compose network (`expose: ["8000"]`) with `GET /health` and internal shared-secret + Clerk user ID authentication (`X-BlinkBuild-Secret`, `X-Clerk-User-Id`).
- **Planned:**
  - `server/` (Phases 3–9): SQLite shared state, LLM routing, CrewAI agents (Manager, Frontend, Backend, QA), and hardened sibling Docker sandbox.
  - `client/` additions (Phase 10): a Next.js SSE proxy route, OpenAPI-generated TypeScript types, and additive UI panels for mode selection, agent activity, test results, defects, and escalations.

## 3. Step-by-Step Flow of a Run

### Current Flow (Legacy Single-Call Path)
1. User signs in via Clerk (`/sign-in` or modal) and submits a prompt on `/` (`app/page.tsx`).
2. Server Action `generateWebsite` (`app/actions.ts`) redirects to `/generate?prompt=...`.
3. `GenerationContent` (`app/generate/generation-content.tsx`) calls `POST /api/template` with `{ prompt }`.
4. `/api/template` asks `gemini-2.5-flash` to classify the prompt as `"react"` or `"node"` and returns base system prompts and starter scaffold XML (`app/lib/defaults/react.ts` or `node.ts`).
5. `GenerationContent` parses `uiPrompts[0]` via `parseXml()` (`app/lib/steps.ts`) and enqueues steps into `revealQueueRef` (revealing one step every 350 ms).
6. `GenerationContent` calls `POST /api/chat` with the base prompts, starter XML, and user prompt.
7. `/api/chat` calls `gemini-2.5-flash` with `getSystemPrompt()` (`app/lib/prompt.ts`) and returns a `<boltArtifact>` XML response.
8. `GenerationContent` parses the XML into `Step[]`, builds the nested `FileItem[]` tree, mounts the files into the singleton WebContainer (`hooks/useWebcontainers.ts`), and `PreviewFrame` (`components/PreviewFrame.tsx`) runs `npm install` and `npm run dev` to render the live `<iframe>` preview.
9. Follow-up messages in the `/generate` sidebar append to `llmMessages` and call `POST /api/chat` directly.

### Planned Flow (Multi-Agent Engine)
1. User submits a prompt on `/` and lands on `/generate`, selecting an LLM mode (`auto`, `fast`, or `local`).
2. Next.js forwards the run request with a shared secret and Clerk user ID to FastAPI `POST /runs` and relays SSE events from `GET /runs/{id}/events`.
3. CrewAI Flow executes: `Understand` → `Plan` (Manager) → `Select` (activation) → `Execute` (Frontend/Backend) → `Merge` → `Validate` (QA in sibling Docker sandbox) → `Decide`.
4. If QA fails and task retries `< 3`, deterministic code increments the retry counter, Manager routes the defect to `frontend` or `backend`, the owner fixes, and QA re-runs failed checks plus regression.
5. If all checks pass, the run reaches `succeeded` and the merged `<boltArtifact>` feeds into the existing `parseXml()` → file tree → Monaco → WebContainer pipeline. If retries reach `3` or a per-run limit hits, the run stops as `escalated` with a report.

## 4. Runtime Agents

- **Backend (implemented in `server/app/agents/backend.py`):** CrewAI `Agent` (`Backend Software Engineer`) that writes server-side routes, logic, and data handling strictly following the API contract, acceptance criteria, and WebContainer constraints (`server/app/agents/constraints.py`). Returns `AgentFileOutput` JSON validated by Pydantic (`server/app/agents/schemas.py`) with one automatic re-ask on invalid output and path-traversal/ownership checks; `server/app/agents/merge.py` converts validated files into `<boltArtifact>` XML compatible with `client/app/lib/steps.ts` `parseXml()`. Never writes UI code, edits Frontend-owned files, or uses native binaries.
- **Manager (implemented in `server/app/agents/manager.py`):** CrewAI `Agent` (`AI Software Engineering Manager`) that reads the user prompt, template type, and WebContainer constraints; produces a Pydantic-validated `ManagerPlanOutput` (`FR-05`, `FR-06`: UI-only → `[frontend, qa]`, backend-only → `[backend, qa]`, full-stack → `[frontend, backend, qa]` + required `Contract`, with `short`/`long` size hints); and routes QA defects to `frontend` or `backend` (`FR-08`, 1 re-ask before escalating). Never writes application code, never counts retries, and never decides to continue past the retry cap.
- **Frontend (implemented in `server/app/agents/frontend.py`):** CrewAI `Agent` (`Frontend Software Engineer`) that writes UI components, styles, and client routing in the chosen template stack. Shares `server/app/agents/runner.py` with Backend (`FR-09` minimal scoped context: task, contract, owned files, WebContainer constraints) and `server/app/agents/merge.py` (`merge_agent_outputs()` detects cross-agent path conflicts and logs a `Defect` against the Manager's contract). Never writes server code, edits Backend-owned files, or invents routes not in the contract.
- **QA (implemented in `server/app/agents/qa.py` and `server/app/sandbox/runner.py`):** CrewAI `Agent` (`Quality Assurance Verification Engineer`) that synthesizes test cases (`happy_path`, `negative_edge`, `security_auth`, `regression`) from acceptance criteria without mocking business logic or mutating application files. `SandboxRunner` runs checks (`install`, `build`, `lint`, `typecheck`, `unit_tests`, `browser_smoke`) in short-lived hardened sibling containers (`cap_drop=["ALL"]`, `no-new-privileges`, non-root `pwuser`, `read_only=True`, `network_mode="none"`, archive-API copy, hard timeouts, startup leftover cleanup). `install` is honestly recorded as `blocked` when no allow-listed mirror/proxy is configured (`P8-T4`), and `blocked`/`skipped` is never reported as `passed`.

## 5. Control Loop and Retry Cap

Implemented in `server/app/flows/control_loop.py` (`BlinkBuildOrchestrator` using CrewAI `Flow` + `@persist(SQLiteFlowPersistence)` into `crewai_flows.db`) and exposed via `server/app/api/runs.py` (`POST /runs`, `GET /runs/{id}`, `GET /runs/{id}/events`, `POST /runs/{id}/cancel`):
- **Flow sequence:** `understand` → `plan` → `execute` → `validate` → `decide` (with `retry_validation` loop when defects occur).
- **Run statuses:** `queued` → `planning` → `generating` → `validating` ↔ `fixing` → terminal (`succeeded`, `escalated`, `failed`, `cancelled`).
- **Retry cap:** Hard-coded at `3` per task in deterministic Python code (`StateRepository.increment_retry()`). The counter is persisted to SQLite *before* any fix is attempted. Reaching `3` immediately transitions the run to `escalated` and builds an escalation report.
- **SSE events (`server/app/api/events.py`):** `RunEventBus` streams ordered events with replay support (`Last-Event-ID`).

## 6. LLM Routing

- **Client (legacy path):** Hard-coded to `gemini-2.5-flash` in `client/app/api/template/route.ts` and `client/app/api/chat/route.ts` using `process.env.API_KEY`.
- **Server (`server/app/llm/`):** Implemented with environment-only configuration (`LLM_MODEL_MANAGER`, `LLM_MODEL_FRONTEND`, `LLM_MODEL_BACKEND`, `LLM_MODEL_QA`; exact model strings and limits deferred per `D-016`):
  - `fast` mode: Groq (`GROQ_API_KEY`).
  - `local` mode: Ollama on Google Colab via `OLLAMA_BASE_URL` (sends `ngrok-skip-browser-warning: true` and optional `OLLAMA_BEARER_TOKEN`; demo only).
  - `auto` mode: uses `local` for `long` tasks if healthy, otherwise `groq`.
  - Fallback chain (`LLM_FALLBACK_CHAIN`, default `local,groq,gemini`): on HTTP/connection error, falls back to next configured provider, logs `PROVIDER_FALLBACK` in `audit_entries`, and returns a fallback notice.
  - Throttling (`LLM_RPM_GROQ`, `LLM_RPM_OLLAMA`, `LLM_RPM_GEMINI`): sliding 60s window when set; off with warning when unset.
  - Per-run limits (`RUN_MAX_LLM_CALLS`, `RUN_MAX_TOKENS`, `RUN_MAX_SECONDS`): raises `RunLimitExceeded` when reached; writes `LIMIT_WARNING` audit entry when unset.
  - Health endpoint: `GET /llm/status` (authenticated).

## 7. Shared State

- **Current:**
  - `client`: Ephemeral React state in `client/app/generate/generation-content.tsx` (`steps`, `files`, `llmMessages`, `selectedFile`).
  - `server`: Pydantic models (`server/app/state/models.py`) validated and persisted via `StateRepository` (`server/app/state/repository.py`) into SQLite (`SQLITE_DB_PATH`, Alembic-managed with `render_as_batch=True`, `PRAGMA foreign_keys=ON`, `WAL` mode, and `30s` busy timeout). Covers `runs`, `plans`, `tasks`, `contracts`, `generated_files`, `test_cases`, `test_results`, `defects`, `agent_status`, `retry_counters`, `llm_usage`, and `audit_entries`.
- **Planned:** CrewAI Flow persistence will use a separate SQLite file (`/data/crewai_flows.db` on the same Docker named volume) in Phase 9 (`D-020`).

## 8. How the Client Displays Results

- **Current (`client/app/generate/generation-content.tsx` & `client/components/AgentActivityPanel.tsx`):**
  - Header includes a mode selector (`auto`, `fast`, `local`, or `legacy` single-call baseline).
  - Multi-agent runs call Next.js proxy routes (`client/app/api/runs/*`) which verify Clerk `auth()`, attach `X-BlinkBuild-Secret` + `X-Clerk-User-Id`, and relay SSE events (`EventSource` with `Last-Event-ID` reconnect & `sessionStorage` run ID recovery).
  - `files_ready` `<boltArtifact>` payloads feed directly into `parseXml()` → 350 ms `revealQueueRef` → `FileExplorer` + read-only Monaco `CodeEditor` + WebContainers `PreviewFrame`.
  - The `Agents & QA` tab displays live SSE events, fallback notices, retry counters, sandbox `test_results`, `defects`, escalation reports, and `Cancel Run` / `Reconnect` controls.
  - Follow-up chat messages stay on the legacy `/api/chat` single-call path (`D-014`) and are labeled `"Follow-up edits (Legacy Single-Call Path)"`.

## 9. How to Run Locally

Verified at Phase 1 (`P1-T7`, Node `v22.20.0`, npm `11.13.0`):
- Install dependencies: `cd client && npm ci`
- Development server: `cd client && npm run dev` (`next dev --turbopack`)
- Production build: `cd client && npm run build` (`next build` — verified passing on Next.js 16.2.3 Turbopack)
- Production start: `cd client && npm run start` (`next start`)
- Lint: `cd client && npm run lint` (`next lint`)

Environment variables required currently (see `.env.example`): `API_KEY` (Gemini), Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`), `BLINKBUILD_SERVER_SECRET`, `SQLITE_DB_PATH`, and `LLM_MODEL_*` / provider keys.

### How to Run the Colab Ollama Demo (`local` mode)
1. Open `server/colab/ollama_demo.ipynb` in Google Colab and add `NGROK_AUTHTOKEN` and `OLLAMA_BEARER_TOKEN` to Colab Secrets.
2. Set `OLLAMA_MODEL` in cell 1 to your chosen coder model (`D-016`) and run all cells.
3. Copy the printed public URL into `OLLAMA_BASE_URL` (and matching `OLLAMA_BEARER_TOKEN`) in `.env`.
4. Verify connectivity via authenticated `GET /llm/status`, then select `Mode: Local (Ollama)` in `/generate`. If the Colab session disconnects, the server automatically falls back to Groq and notifies the UI.

## 10. Known Issues & Limitations

1. `downloadFilesAsZip()` in `client/app/generate/generation-content.tsx` downloads a plain-text bundle (`blinkbuild-project.txt`) rather than a `.zip` archive.
2. **Runtime mismatch:** QA executes generated code inside a full Node Docker container (`mcr.microsoft.com/playwright:v1.64.1-noble`), whereas live preview executes in browser WebContainers (different runtime; mismatches must be recorded during evaluation).
3. **Sandbox `install` phase (`P8-T4` / Checkpoint H2):** Marked `blocked` unless `SANDBOX_INSTALL_NETWORK` is configured with an approved package mirror or filtering proxy.
4. **Pending live verification (blocked on environment):**
   - Live LLM calls (`D-016` / Checkpoint H4 model strings, keys, and limits not yet supplied).
   - Live Docker Compose & sibling-container sandbox runs (Docker Desktop not running on build host).
   - Live Google Colab `local` mode run (Colab runtime unavailable).
