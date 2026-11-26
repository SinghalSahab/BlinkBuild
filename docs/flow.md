# BlinkBuild System Flow

Last updated: 2026-11-26 | Task: P3-T6

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

## 4. Runtime Agents (Planned)

- **Manager:** Reads the user prompt, template type, and WebContainer constraints; produces a structured plan (activated agents, tasks with testable acceptance criteria, and an API contract when both Frontend and Backend are active); routes QA defects to `frontend` or `backend`. Never writes application code, never counts retries, and never decides to continue past the retry cap.
- **Frontend:** Writes UI code (components, styles, client routing) for the generated project in the chosen template stack. Receives only its task, the contract, owned files, and WebContainer constraints. Never writes server code, edits Backend-owned files, or invents routes outside the contract.
- **Backend:** Writes server code (routes, logic, data handling) for the generated project. Receives only its task, the contract, owned files, and WebContainer constraints. Never writes UI code, edits Frontend-owned files, or uses native binaries incompatible with WebContainers.
- **QA:** Derives test cases (happy path, negative/edge, security/auth, regression) from acceptance criteria and runs real checks (install, build, lint, type-check, unit tests, browser smoke test) inside hardened sibling Docker containers. Never edits application code, never mocks the logic under test, and never reports a pass for a check that did not run.

## 5. Control Loop and Retry Cap (Planned)

- **Run statuses:** `queued` → `planning` → `generating` → `validating` ↔ `fixing` → terminal (`succeeded`, `escalated`, `failed`, `cancelled`).
- **Retry cap:** Hard-coded at `3` per task in deterministic Python code (not in LLM prompts). The counter is persisted to SQLite *before* any fix is attempted. Reaching `3` immediately transitions the run to `escalated` and generates a human escalation report.

## 6. LLM Routing

- **Current:** Hard-coded to `gemini-2.5-flash` in `client/app/api/template/route.ts` and `client/app/api/chat/route.ts` using `process.env.API_KEY`.
- **Planned:** Configured per agent via environment variables (exact model strings and limits deferred per `D-016`):
  - `fast` mode: Groq.
  - `local` mode: Ollama on Google Colab via ngrok (with `ngrok-skip-browser-warning` header and bearer token; demo only).
  - `auto` mode: Manager's per-task size hint (`short` → Groq, `long` → Local if healthy).
  - Fallback chain: Local → Groq → Gemini (if key configured), with audit logging and UI notification.

## 7. Shared State

- **Current:**
  - `client`: Ephemeral React state in `client/app/generate/generation-content.tsx` (`steps`, `files`, `llmMessages`, `selectedFile`).
  - `server`: Pydantic models (`server/app/state/models.py`) validated and persisted via `StateRepository` (`server/app/state/repository.py`) into SQLite (`SQLITE_DB_PATH`, Alembic-managed with `render_as_batch=True`, `PRAGMA foreign_keys=ON`, `WAL` mode, and `30s` busy timeout). Covers `runs`, `plans`, `tasks`, `contracts`, `generated_files`, `test_cases`, `test_results`, `defects`, `agent_status`, `retry_counters`, `llm_usage`, and `audit_entries`.
- **Planned:** CrewAI Flow persistence will use a separate SQLite file (`/data/crewai_flows.db` on the same Docker named volume) in Phase 9 (`D-020`).

## 8. How the Client Displays Results

- **Current:** `GenerationContent` renders a 280px left panel (phase pills, progress bar capped at 85% until chat completes, 350 ms queued step list, follow-up chat) and a tabbed right panel (`Code` with `FileExplorer` + read-only Monaco `CodeEditor`; `Preview` with `PreviewFrame` running `npm install && npm run dev` in WebContainers).
- **Planned:** Additive panels on `/generate` consuming SSE events for live agent activity, test results, defects, retry counts, provider fallback notices, and escalation reports, while keeping the legacy single-call path and follow-up chat intact.

## 9. How to Run Locally

Verified at Phase 1 (`P1-T7`, Node `v22.20.0`, npm `11.13.0`):
- Install dependencies: `cd client && npm ci`
- Development server: `cd client && npm run dev` (`next dev --turbopack`)
- Production build: `cd client && npm run build` (`next build` — verified passing on Next.js 16.2.3 Turbopack)
- Production start: `cd client && npm run start` (`next start`)
- Lint: `cd client && npm run lint` (`next lint`)

Environment variables required currently (see `.env.example`): `API_KEY` (Gemini), Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).

## 10. Known Limitations

1. `downloadFilesAsZip()` in `client/app/generate/generation-content.tsx` downloads a plain-text bundle (`blinkbuild-project.txt`) rather than a `.zip` archive.
2. **Planned limitation:** QA will execute generated code inside a full Node Docker container, whereas live preview executes in browser WebContainers (different runtime; mismatches must be recorded during evaluation).
