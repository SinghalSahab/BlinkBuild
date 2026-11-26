# BlinkBuild Builder Agent Activity Log

---

### #0001 — 2026-11-26
- **Task ID / Requirements:** `P0-T1` (Baseline verification)
- **Action:** Inspected the repository directory tree (`find . -maxdepth 4`), git branches (`git branch -a`), `axios` imports (`grep -rn "axios"`), and read `package.json`, `next.config.ts`, `proxy.ts`, `app/api/template/route.ts`, `app/api/chat/route.ts`, `app/lib/steps.ts`, and `app/generate/generation-content.tsx`.
- **Files touched:** None (read-only inspection).
- **Commands run:**
  - `find . -maxdepth 4 -not -path '*/node_modules*' -not -path '*/.git*' -not -path '*/.next*'`
  - `git branch -a`
  - `grep -rn "axios" app components hooks lib`
- **Result:**
  - Confirmed branches: `main` (`65de19a`), `qa` (`f4318df`, current `HEAD`), plus `origin/develop`, `origin/main`, `origin/qa`.
  - Confirmed `PM.md` Section 2 ground truth matches the repo: Clerk auth in `proxy.ts` and `app/layout.tsx`, COOP/COEP headers and `output: "standalone"` in `next.config.ts`, `parseXml()` and `StepType` in `app/lib/steps.ts`, `revealQueueRef` (350 ms) and Ready overlay in `app/generate/generation-content.tsx`, `/api/chat` using `gemini-2.5-flash`.
  - Confirmed defects/cleanup items: `app/api/gemini/route.ts` exists and is unused; `app/api/template/route.ts` line 58 (`node` branch) interpolates `reactBasePrompt` into `prompts`; `axios` is in `package.json` (`^1.13.6`) with `No axios imports found`; the 19 QA simulation files from `f4318df` are present on `qa`.
  - Discrepancy noted: `node_modules/` was not present at the start of Phase 0 (`No node_modules`).
- **Next step:** Create `docs/flow.md`, `docs/decisions.md`, and `docs/activity-log.md` (`P0-T2`), and install dependencies / run baseline build (`P0-T4`).
- **Linked decisions:** `D-001` through `D-016`.

---

### #0002 — 2026-11-26
- **Task ID / Requirements:** `P0-T2`, `FR-36`
- **Action:** Created the three mandatory documentation files (`docs/flow.md`, `docs/decisions.md`, `docs/activity-log.md`), seeding `decisions.md` with `D-001` through `D-016`, `D-017` (proposed working branch), and open questions `Q-1` through `Q-7`.
- **Files touched:**
  - `docs/flow.md` (created)
  - `docs/decisions.md` (created)
  - `docs/activity-log.md` (created)
- **Commands run:** None (`write_file`).
- **Result:** All three files created in `docs/` following `PM.md` Section 4 formats.
- **Next step:** Complete `P0-T4` (`npm ci` and `npm run build` baseline check), update `docs/flow.md` and `docs/activity-log.md` with the build evidence, and stop at Checkpoint H1 for human approval before committing/branching or starting Phase 1.
- **Linked decisions:** `D-017`.

---

### #0003 — 2026-11-26
- **Task ID / Requirements:** `P0-T4`, `NFR-07`
- **Action:** Installed dependencies with `npm ci` and ran the baseline production build `npm run build` to verify the existing Next.js app builds cleanly before any modifications.
- **Files touched:** `node_modules/` (untracked, ignored by `.gitignore`), `.next/` (untracked, ignored by `.gitignore`).
- **Commands run:**
  - `node -v && npm -v && npm ci` (outside sandbox due to macOS keychain `SecItemCopyMatching` error -50 inside sandbox)
  - `npm run build` (outside sandbox for same reason)
- **Result:**
  - `node`: `v22.20.0`, `npm`: `11.13.0`.
  - `npm ci`: exited `0`, added 778 packages.
  - `npm run build`: exited `0` (Next.js `16.2.3` Turbopack). Compiled in `8.6s`, TypeScript finished in `4.7s`, generated `8/8` static pages.
  - Observed warning: Next.js detected `/Users/prakhar/package-lock.json` outside the repo alongside `/Users/prakhar/BlinkBuild/package-lock.json`; also noted edge runtime warning on `/api/gemini` (which is slated for deletion in `P1-T2`).
- **Next step:** Stop at **Checkpoint H1** and request human approval for the working branch (`feat/multi-agent-engine`), how to handle the QA commit `f4318df`, and approval to begin **Phase 1**.
- **Linked decisions:** `D-017`.

---

### #0004 — 2026-11-26
- **Task ID / Requirements:** `P1-T1`, `D-017`
- **Action:** Reverted commit `f4318df` on `qa` per Checkpoint H1 decision (`D-017`), created branch `feat/multi-agent-engine` from `qa`, and committed the initial `docs/` files (`P0-T2`).
- **Files touched:** 19 files from `f4318df` deleted via revert; `docs/flow.md`, `docs/decisions.md`, `docs/activity-log.md` committed.
- **Commands run:**
  - `git revert --no-edit f4318df`
  - `git checkout -b feat/multi-agent-engine`
  - `git add docs/ && git commit -m "docs: add flow, decisions, activity log"`
- **Result:** Revert commit `e34476d` created on `qa`; branch `feat/multi-agent-engine` created; docs commit `59b10a3` created. None of the 19 QA simulation files remain in the working tree.
- **Next step:** Delete unused `/api/gemini` (`P1-T2`), fix `/api/template` (`P1-T3`), and remove `axios` (`P1-T4`).
- **Linked decisions:** `D-001`, `D-002`, `D-017`.

---

### #0005 — 2026-11-26
- **Task ID / Requirements:** `P1-T2`, `P1-T3`, `P1-T4`, `D-009`
- **Action:** Verified zero references to `/api/gemini` and `axios`, deleted `app/api/gemini/route.ts`, fixed the `node` branch in `app/api/template/route.ts` to interpolate `nodeBasePrompt`, and uninstalled `axios`.
- **Files touched:**
  - `app/api/gemini/route.ts` (deleted)
  - `app/api/template/route.ts` (modified)
  - `package.json`, `package-lock.json` (modified)
- **Commands run:**
  - `grep -rn "api/gemini\|/gemini" app components hooks lib`
  - `rm -rf app/api/gemini && npm uninstall axios`
  - `git add app/api/gemini && git commit -m "P1-T2: delete unused /api/gemini route"`
  - `git add app/api/template/route.ts && git commit -m "P1-T3: fix node branch in /api/template"`
  - `git add package.json package-lock.json && git commit -m "P1-T4: remove unused axios dependency"`
- **Result:** Commits `8cd5b0a` (`P1-T2`), `5b7bdad` (`P1-T3`), `bbb0f02` (`P1-T4`). `npm uninstall axios` removed 9 packages cleanly.
- **Next step:** Move Next.js app into `client/` (`P1-T5`).
- **Linked decisions:** `D-009`, `D-010`.

---

### #0006 — 2026-11-26
- **Task ID / Requirements:** `P1-T5`, `P1-T6`, `D-003`
- **Action:** Moved the Next.js app into `client/` using `git mv` (renaming `DockerFile` to `client/Dockerfile`), updated `docker-compose.yml` build context to `./client`, updated `.gitignore` for `node_modules/`, `.next/`, and `!.env.example`, and added root `.env.example` and updated `README.md`.
- **Files touched:** 48 files moved to `client/`, `.gitignore` (modified), `docker-compose.yml` (modified), `.env.example` (created), `README.md` (modified).
- **Commands run:**
  - `mkdir -p client && git mv ... client/ && git mv client/DockerFile client/Dockerfile`
  - `git add -A client/ docker-compose.yml && git commit -m "P1-T5: move Next.js app into client/ and update docker-compose.yml"` (amended after fixing `.gitignore` and `git rm -r -q --cached client/node_modules`)
  - `git add .env.example README.md && git commit -m "P1-T6: add root .env.example and update README.md"`
- **Result:** Commits `48e450d0` (`P1-T5`) and `856e3dad` (`P1-T6`). `client/next.config.ts` and `client/vercel.json` COOP/COEP headers preserved identically.
- **Next step:** Run `client/` build and smoke test (`P1-T7`).
- **Linked decisions:** `D-003`, `D-008`.

---

### #0007 — 2026-11-26
- **Task ID / Requirements:** `P1-T7`, `NFR-07`
- **Action:** Ran `npm run build` in `client/` and performed a local server startup smoke test on port `3099`. Updated `docs/flow.md` to reflect the `client/` layout.
- **Files touched:** `docs/flow.md` (modified), `docs/activity-log.md` (modified).
- **Commands run:**
  - `cd client && npm run build`
  - `cd client && npx next start -p 3099` + `curl -s -o /dev/null -w "%{http_code}" http://localhost:3099`
- **Result:**
  - `npm run build` exited `0`: Next.js `16.2.3` Turbopack compiled in `7.9s`, TypeScript finished in `5.5s`, `7/7` static pages generated (`/`, `/_not-found`, `/api/chat`, `/api/template`, `/generate`, `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`).
  - `npx next start -p 3099` became ready in `240ms`; `curl` returned `HTTP_CODE=500` because `client/.env.local` is absent (`Error: @clerk/nextjs: Missing publishableKey`). Live sign-in, prompt generation, and WebContainer preview are **not tested** without `client/.env.local` keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `API_KEY`).
- **Next step:** Commit Phase 1 documentation updates and request human approval to start **Phase 2: Server skeleton**.
- **Linked decisions:** `D-003`, `D-017`.

---

### #0008 — 2026-11-26
- **Task ID / Requirements:** `P2-T1`, `P2-T2`, `P2-T3`, `P2-T4`, `P2-T5`, `P2-T6`, `NFR-01`, `NFR-09`
- **Action:** Created `server/` skeleton with pinned dependencies (`pyproject.toml`), non-root `server/Dockerfile`, fail-fast environment settings (`app/config/settings.py`), shared-secret + forwarded Clerk user ID auth (`app/api/auth.py`), FastAPI app with `/health` and `/protected/ping` (`app/main.py`), updated `docker-compose.yml` (private `server` service + `blinkbuild_sqlite_data` volume) and `.env.example`, and ran `pytest`.
- **Files touched:**
  - `.gitignore` (modified: Python ignores)
  - `server/pyproject.toml`, `server/Dockerfile` (created)
  - `server/app/__init__.py`, `server/app/main.py` (created)
  - `server/app/config/__init__.py`, `server/app/config/settings.py` (created)
  - `server/app/api/__init__.py`, `server/app/api/auth.py` (created)
  - `server/tests/__init__.py`, `server/tests/test_server_skeleton.py` (created)
  - `docker-compose.yml`, `.env.example` (modified)
  - `docs/decisions.md`, `docs/flow.md` (modified)
- **Commands run:**
  - `python3 -m venv server/.venv && server/.venv/bin/pip install fastapi "uvicorn[standard]" pydantic-settings pytest httpx`
  - `cd server && .venv/bin/pytest -v`
  - `BLINKBUILD_SERVER_SECRET=local-smoke-secret docker compose up -d --build`
- **Result:**
  - `pytest -v`: **6/6 passed** in `0.71s` (missing env var fail-fast, `/health`, missing secret 401, wrong secret 401, missing user ID 401, valid headers 200).
  - `docker compose up -d --build`: **blocked** (`Cannot connect to the Docker daemon at unix:///Users/prakhar/.docker/run/docker.sock. Is the docker daemon running?`). Live container startup is not yet verified until Docker Desktop is started.
- **Next step:** Commit Phase 2 changes and request human approval before starting **Phase 3: Shared project state (Pydantic + SQLite)** (and note the Docker daemon blocker for `docker compose up`).
- **Linked decisions:** `D-004`, `D-005`, `D-018`, `D-019`.

---

### #0009 — 2026-11-26
- **Task ID / Requirements:** `P3-T1`, `P3-T2`, `P3-T3`, `P3-T4`, `P3-T5`, `P3-T6`, `FR-22`, `FR-23`, `FR-25`, `NFR-04`
- **Action:** Installed `SQLAlchemy==2.1.9` and `alembic==1.20.1`, implemented Pydantic v2 state models & status enums (`app/state/models.py`), SQLAlchemy ORM & SQLite engine (`app/state/db.py` with `PRAGMA foreign_keys=ON`, `WAL`, `busy_timeout=30000`, `timeout=30`), Alembic config (`render_as_batch=True`) & initial migration (`821a201dbed0`), and `StateRepository` (`app/state/repository.py`). Added and ran Phase 3 tests (`tests/test_shared_state.py`).
- **Files touched:**
  - `server/pyproject.toml` (modified)
  - `server/app/state/__init__.py`, `server/app/state/models.py`, `server/app/state/db.py`, `server/app/state/repository.py` (created)
  - `server/alembic.ini`, `server/alembic/env.py`, `server/alembic/script.py.mako`, `server/alembic/versions/821a201dbed0_initial_shared_state.py` (created)
  - `server/tests/test_shared_state.py` (created)
  - `docs/decisions.md`, `docs/flow.md` (modified)
- **Commands run:**
  - `server/.venv/bin/pip install sqlalchemy alembic`
  - `cd server && SQLITE_DB_PATH=/tmp/blinkbuild_alembic_gen.db .venv/bin/alembic revision --autogenerate -m "initial shared state"`
  - `cd server && .venv/bin/pytest -v`
- **Result:**
  - `pytest -v`: **8/8 passed** in `0.75s` (6 from Phase 2 + 2 new Phase 3 tests covering Alembic migration on clean SQLite, `PRAGMA foreign_keys=ON`, run transition validation, Pydantic validation rejection, FK integrity error, retry cap at 3, and persistence across engine dispose/re-open).
  - Note: Container volume restart test (`P3-T6`) is pending Docker Desktop being started.
- **Next step:** Commit Phase 3 changes and request human approval before starting **Phase 4: LLM layer** (and note Checkpoint H4 for deferred model strings/limits when real calls are needed).
- **Linked decisions:** `D-005`, `D-007`, `D-020`, `D-021`.

---

### #0010 — 2026-11-26
- **Task ID / Requirements:** `P4-T1`..`P4-T8`, `FR-26`..`FR-30`
- **Action:** Implemented `server/app/llm/config.py` (env-only config with zero hardcoded model strings or limits), `server/app/llm/router.py` (`LlmRouter`, `ProviderThrottler`, `RunBudgetTracker`, `RunLimitExceeded`, fallback chain, usage & audit recording), exposed authenticated `GET /llm/status` in `server/app/main.py`, updated `.env.example` and `server/pyproject.toml`, and ran stubbed provider tests (`tests/test_llm_layer.py`).
- **Files touched:**
  - `server/app/llm/__init__.py`, `server/app/llm/config.py`, `server/app/llm/router.py` (created)
  - `server/app/main.py`, `server/pyproject.toml`, `.env.example` (modified)
  - `server/tests/test_server_skeleton.py` (modified), `server/tests/test_llm_layer.py` (created)
  - `docs/decisions.md`, `docs/flow.md` (modified)
- **Commands run:**
  - `cd server && .venv/bin/pytest -v`
- **Result:**
  - `pytest -v`: **13/13 passed** in `1.12s` (6 Phase 2 + 2 Phase 3 + 5 Phase 4 stubbed provider tests).
  - Live provider calls against Groq, Local (Ollama), or Gemini: **not tested, waiting for D-016 values** (Checkpoint H4).
- **Next step:** Commit Phase 4 and request human approval to start **Phase 5: Backend runtime agent (first agent, end to end)**.
- **Linked decisions:** `D-006`, `D-015`, `D-016`, `D-022`.

---

### #0011 — 2026-11-26
- **Task ID / Requirements:** `P5-T1`..`P5-T5`, `FR-09`, `FR-10`, `FR-12`
- **Action:** Installed `crewai==1.15.45` (aligning `pydantic==2.12.5`), carried over WebContainer constraints from `client/app/lib/prompt.ts` (`app/agents/constraints.py`), implemented Pydantic I/O & path-traversal/re-ask validation (`app/agents/schemas.py`), `<boltArtifact>` merge & duplicate-path conflict detection (`app/agents/merge.py`), CrewAI Backend agent (`app/agents/backend.py`), and Phase 5 tests (`tests/test_backend_agent.py`).
- **Files touched:**
  - `server/pyproject.toml`, `server/Dockerfile` (modified)
  - `server/app/agents/__init__.py`, `server/app/agents/constraints.py`, `server/app/agents/schemas.py`, `server/app/agents/merge.py`, `server/app/agents/backend.py` (created)
  - `server/tests/conftest.py`, `server/tests/test_backend_agent.py` (created)
  - `docs/decisions.md`, `docs/flow.md` (modified)
- **Commands run:**
  - `server/.venv/bin/pip install crewai`
  - `cd server && HOME=/tmp/crewai_home CREWAI_STORAGE_DIR=/tmp/crewai_storage .venv/bin/pytest -v`
- **Result:**
  - `pytest -v`: **18/18 passed** in `5.91s` (including CrewAI `Agent` creation, path-traversal rejection, 1-reask Pydantic validation, duplicate-path `MergeConflictError`, and Node.js verification of `<boltArtifact>` against `client/app/lib/steps.ts` `parseXml()` regexes).
  - Live LLM backend generation: **not tested, waiting for `D-016` values (Checkpoint H4)**.
- **Next step:** Commit Phase 5 and request human approval to start **Phase 6: Frontend runtime agent and the contract**.
- **Linked decisions:** `D-001`, `D-002`, `D-023`.

---

### #0012 — 2026-11-26
- **Task ID / Requirements:** `P6-T1`..`P6-T5`, `FR-07`, `FR-09`, `FR-11`
- **Action:** Implemented Frontend CrewAI agent (`app/agents/frontend.py`), extracted shared specialist prompt/runner (`app/agents/runner.py`), added cross-agent file-conflict detection with `Defect` logging against `AgentOwner.MANAGER` (`app/agents/merge.py`), and added Phase 6 tests (`tests/test_frontend_and_contract.py`).
- **Files touched:**
  - `server/app/agents/runner.py`, `server/app/agents/frontend.py`, `server/tests/test_frontend_and_contract.py` (created)
  - `server/app/agents/backend.py`, `server/app/agents/merge.py`, `docs/flow.md` (modified)
- **Commands run:**
  - `cd server && HOME=/tmp/crewai_home CREWAI_STORAGE_DIR=/tmp/crewai_storage .venv/bin/pytest -v`
- **Result:**
  - `pytest -v`: **21/21 passed** in `5.97s` (18 existing + 3 new Phase 6 tests covering Frontend CrewAI agent & context minimization, UI-only + full-stack merge, and cross-agent conflict defect logging).
- **Next step:** Commit Phase 6 and request human approval to start **Phase 7: Manager runtime agent**.
- **Linked decisions:** `D-001`, `D-002`.

---

### #0013 — 2026-11-26
- **Task ID / Requirements:** `P7-T1`..`P7-T5`, `FR-05`, `FR-06`, `FR-08`
- **Action:** Implemented CrewAI Manager agent, `ManagerPlanOutput` (enforcing `FR-06` selective activation, `qa` always active, and required `Contract` when both Frontend & Backend are active), `plan_run()`, and `route_defect()` with 1-reask validation & escalation (`server/app/agents/manager.py`). Added Phase 7 tests across 6 prompts and defect routing (`tests/test_manager_agent.py`).
- **Files touched:**
  - `server/app/agents/manager.py`, `server/tests/test_manager_agent.py` (created)
  - `docs/flow.md` (modified)
- **Commands run:**
  - `cd server && HOME=/tmp/crewai_home CREWAI_STORAGE_DIR=/tmp/crewai_storage .venv/bin/pytest -v`
- **Result:**
  - `pytest -v`: **29/29 passed** in `5.97s` (21 existing + 8 new Phase 7 tests: CrewAI Manager agent, 6 activation prompts, and defect routing valid/re-ask/escalation). Live LLM planning accuracy is **not tested, waiting for `D-016` values (Checkpoint H4)**.
- **Next step:** Commit Phase 7 and request human approval to start **Phase 8: QA runtime agent and sandbox** (including Checkpoint H2 for any sandbox package mirror/proxy if needed).
- **Linked decisions:** `D-001`, `D-002`, `D-007`.

---

### #0014 — 2026-11-26
- **Task ID / Requirements:** `P8-T1`..`P8-T12`, `FR-13`..`FR-17b`, `NFR-03`
- **Action:** Installed `docker==7.2.0`, added `tecnativa/docker-socket-proxy:0.3.0` to `docker-compose.yml` (local dev only, residual risk documented in `D-024`), created `server/sandbox.Dockerfile` (`mcr.microsoft.com/playwright:v1.64.1-noble`, `pwuser`), implemented `SandboxRunner` (`server/app/sandbox/runner.py`), wired startup `cleanup_stale_sandboxes()` in `server/app/main.py`, implemented CrewAI QA agent + honest `TestResult`/`Defect` recording (`server/app/agents/qa.py`), and added Phase 8 tests (`tests/test_qa_and_sandbox.py`).
- **Files touched:**
  - `server/pyproject.toml`, `server/app/main.py`, `docker-compose.yml`, `.env.example` (modified)
  - `server/sandbox.Dockerfile`, `server/app/sandbox/__init__.py`, `server/app/sandbox/runner.py`, `server/app/agents/qa.py`, `server/tests/test_qa_and_sandbox.py` (created)
  - `docs/decisions.md`, `docs/flow.md` (modified)
- **Commands run:**
  - `server/.venv/bin/pip install docker`
  - `BLINKBUILD_SERVER_SECRET=check docker compose config --quiet`
  - `cd server && HOME=/tmp/crewai_home CREWAI_STORAGE_DIR=/tmp/crewai_storage .venv/bin/pytest -v`
- **Result:**
  - `docker compose config --quiet`: exited `0`.
  - `pytest -v`: **34/34 passed** in `5.97s` (29 existing + 5 Phase 8 tests with mock Docker client verifying hardening options, archive tar copy, blocked `install`, timeout kill/remove, leftover cleanup, and QA defect logging).
  - Live container execution checks (`P8-T12` against real Docker daemon): **not tested, blocked on Docker Desktop not running**.
- **Next step:** Commit Phase 8 and request human approval to start **Phase 9: Control loop (CrewAI Flow)**.
- **Linked decisions:** `D-012`, `D-013`, `D-024`, `D-025`.

---

### #0015 — 2026-11-26
- **Task ID / Requirements:** `P9-T1`..`P9-T7`, `FR-18`..`FR-21`, `FR-24`, `FR-37`
- **Action:** Implemented `RunEventBus` (`server/app/api/events.py`), CrewAI `Flow` control loop with `@persist(SQLiteFlowPersistence)` and deterministic 3-retry `Decide` logic + escalation report + cancellation (`server/app/flows/control_loop.py`), authenticated `/runs` + `/runs/{id}/events` SSE routes (`server/app/api/runs.py`), mounted router in `server/app/main.py`, and added Phase 9 tests (`tests/test_control_loop.py`).
- **Files touched:**
  - `server/app/api/events.py`, `server/app/api/runs.py`, `server/app/flows/__init__.py`, `server/app/flows/control_loop.py`, `server/tests/test_control_loop.py` (created)
  - `server/app/main.py`, `docs/flow.md` (modified)
- **Commands run:**
  - `cd server && HOME=/tmp/crewai_home CREWAI_STORAGE_DIR=/tmp/crewai_storage .venv/bin/pytest -v`
- **Result:**
  - `pytest -v`: **38/38 passed** in `18.39s` (including normal success + `crewai_flows.db` persistence check, defect recovery at retry 1, escalation at exactly 3 retries with escalation report, and `/runs/{id}` + `/runs/{id}/cancel` API tests).
  - Note: Mid-run container kill/resume (`P9-T4` live process restart) is backed by `SQLiteFlowPersistence` (`flow_states` verified), while live container restart remains pending Docker Desktop.
- **Next step:** Commit Phase 9 and request human approval to start **Phase 10: Client integration**.
- **Linked decisions:** `D-001`, `D-007`, `D-020`.

---

### #0016 — 2026-11-26
- **Task ID / Requirements:** `P10-T1`..`P10-T8`, `FR-01`..`FR-04`, `FR-31`..`FR-35`, `NFR-08`
- **Action:** Generated `client/lib/server-types.ts` directly from FastAPI's OpenAPI schema (`16` schemas), added Clerk-authenticated Next.js proxy & SSE relay routes (`client/lib/server-proxy.ts`, `client/app/api/runs/**`), added `client/components/AgentActivityPanel.tsx`, and additively wired mode selector, SSE handling, reconnect, cancel, and `Agents & QA` tab into `client/app/generate/generation-content.tsx` while keeping follow-up chat on `/api/chat` (`D-014`).
- **Files touched:**
  - `client/lib/server-types.ts`, `client/lib/server-proxy.ts`, `client/components/AgentActivityPanel.tsx` (created)
  - `client/app/api/runs/route.ts`, `client/app/api/runs/[id]/route.ts`, `client/app/api/runs/[id]/events/route.ts`, `client/app/api/runs/[id]/cancel/route.ts` (created)
  - `client/app/generate/generation-content.tsx`, `.env.example`, `docs/flow.md` (modified)
- **Commands run:**
  - `cd server && ... python -c "... app.openapi() ..."` (OpenAPI -> TypeScript codegen)
  - `cd client && npm run build`
- **Result:**
  - `npm run build` exited `0`: Next.js `16.2.3` Turbopack compiled in `6.6s`, TypeScript finished in `8.7s`, `8/8` static/dynamic pages built cleanly including `/api/runs`, `/api/runs/[id]`, `/api/runs/[id]/cancel`, `/api/runs/[id]/events`.
  - Live browser E2E (`P10-T8` with Clerk sign-in + running Python server): **not tested** without `.env.local` Clerk/LLM keys and running containers.
- **Next step:** Commit Phase 10 and request human approval to start **Phase 11: Colab Ollama demo mode**.
- **Linked decisions:** `D-008`, `D-010`, `D-014`.

---

### #0017 — 2026-11-26
- **Task ID / Requirements:** `P11-T1`..`P11-T6`, `D-015`, `D-016`
- **Action:** Created `server/colab/ollama_demo.ipynb` (reads `NGROK_AUTHTOKEN` and `OLLAMA_BEARER_TOKEN` from Colab Secrets, reads `OLLAMA_MODEL` from a runtime variable with no hardcoded model, runs a bearer-token stdlib proxy in front of Ollama), documented demo steps in `docs/flow.md`, and added HTML-interstitial + disconnect fallback tests in `server/tests/test_llm_layer.py`.
- **Files touched:**
  - `server/colab/ollama_demo.ipynb` (created)
  - `server/tests/test_llm_layer.py`, `docs/flow.md` (modified)
- **Commands run:**
  - `cd server && HOME=/tmp/crewai_home CREWAI_STORAGE_DIR=/tmp/crewai_storage .venv/bin/pytest -v`
- **Result:**
  - `pytest -v`: **39/39 passed** (including `test_ngrok_html_interstitial_and_disconnect_fallback`).
  - Live Colab execution (`P11-T5`): **not tested (Google Colab runtime unavailable in this environment)**; marked blocked pending live Colab run.
- **Next step:** Commit Phase 11 and request human approval to start **Phase 12: Audit, limits, and observability**.
- **Linked decisions:** `D-006`, `D-015`, `D-016`.

---

### #0018 — 2026-11-26
- **Task ID / Requirements:** `P12-T1`..`P12-T4`, `FR-29`, `FR-37`, `NFR-06`
- **Action:** Added `RETRY` and `LIMIT_REACHED` audit entries in `server/app/flows/control_loop.py`, added `list_llm_usage()` to `StateRepository` and `llm_usage`/`providers_used`/`total_tokens`/`duration_ms` to `RunSummaryResponse` in `server/app/api/runs.py`, regenerated `client/lib/server-types.ts`, added `server/tests/test_observability_and_limits.py`, and ran a secret-pattern grep across the codebase and docs.
- **Files touched:**
  - `server/app/state/repository.py`, `server/app/flows/control_loop.py`, `server/app/api/runs.py`, `client/lib/server-types.ts` (modified)
  - `server/tests/test_observability_and_limits.py` (created)
- **Commands run:**
  - `cd server && ... python -c "... app.openapi() ..."`
  - `cd server && HOME=/tmp/crewai_home CREWAI_STORAGE_DIR=/tmp/crewai_storage .venv/bin/pytest -v`
  - `grep -rnE "AIza...|gsk_...|sk_live_...|sk_test_..." server/app client/app client/components client/lib docs .env.example`
- **Result:**
  - `pytest -v`: **41/41 passed** in `6.92s` (confirming low `RUN_MAX_LLM_CALLS=1` triggers `LIMIT_REACHED` audit + `escalated` status + SSE events, `GET /runs/{id}` returns usage/tokens/providers/duration, and secret values never appear in audit logs).
  - Secret scan: `SECRET_SCAN_CLEAN`.
- **Next step:** Commit Phase 12 and request human approval to start **Phase 13: Evaluation**.
- **Linked decisions:** `D-016`, `D-022`.

---

### #0019 — 2026-11-26
- **Task ID / Requirements:** `P13-T1`..`P13-T4`
- **Action:** Created the 10-prompt evaluation dataset (`docs/evaluation-prompts.json`), logged `D-026` in `docs/decisions.md`, and wrote `docs/evaluation.md` with the `PRD.md` Section 11 metrics table.
- **Files touched:**
  - `docs/evaluation-prompts.json`, `docs/evaluation.md` (created)
  - `docs/decisions.md` (modified)
- **Commands run:** None (live evaluation blocked).
- **Result:** Live metrics honestly marked `not measured` due to missing `D-016` model strings/keys (H4), missing `.env.local` keys, and Docker Desktop not running.
- **Next step:** Commit Phase 13 and request human approval to start **Phase 14: Finalization**.
- **Linked decisions:** `D-016`, `D-026`.
