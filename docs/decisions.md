# Architecture & Build Decisions Log

## Open Questions

- **Q-1 (deferred, D-016):** LiteLLM model strings for Groq and Ollama. Blocks real LLM calls in Phase 4+; human will supply values at Checkpoint H4.
- **Q-2 (deferred, D-016):** Groq model names, Ollama coder model name, and Gemini model name if used. Blocks real LLM calls in Phase 4+; human will supply values at Checkpoint H4.
- **Q-3 (deferred, D-016):** Provider rate limits used for throttling settings (`max_rpm`). Deferred to Checkpoint H4.
- **Q-4 (deferred, D-016):** Per-run limits for LLM calls, tokens, and wall-clock time. Human plans to set these after measuring real runs.
- **Q-5:** SQLite layout: whether CrewAI's Flow persistence and our shared state use one shared SQLite file or two separate files. Proposed default: decide in `P3-T2` after reading CrewAI's current Flow persistence docs.
- **Q-6:** How the sandbox install phase reaches packages (a package mirror or filtering proxy). Needs human approval at Checkpoint H2 before adding any dependency in `P8-T4`.
- **Q-7:** Server hosting location for any deployment beyond local Docker Compose. Deferred to Checkpoint H6.

---

## Decisions

### D-001 — Agent Framework Choice
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Use **CrewAI** as the runtime multi-agent framework; do not use GitHub Copilot `.agent.md` files.
- **Context:** The repository currently has `.github/agents/*.agent.md` from commit `f4318df`, whereas the product requires a programmatic runtime engine inside the Python backend.
- **Options considered:** (a) CrewAI (Crews + Flows); (b) GitHub Copilot custom agent definitions; (c) TypeScript simulated agents.
- **Chosen option and why:** CrewAI. Decided by human on 26 Nov 2026 (`PM.md` Section 5).
- **Impact:** Adds Python `server/` with CrewAI; `.github/agents/*.agent.md` will be removed in Phase 1.
- **Status:** `ACCEPTED`
- **How to reverse it:** Replace CrewAI orchestration in `server/app/agents/` and `server/app/flows/`.

### D-002 — Runtime Agents in Scope
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Limit runtime agents in scope to **Manager, Frontend, Backend, and QA** only.
- **Context:** Commit `f4318df` referenced Architect, Database, and DevOps roles, which are out of scope for this release.
- **Options considered:** (a) 4 agents (Manager, Frontend, Backend, QA); (b) 7 agents including Architect, Database, DevOps.
- **Chosen option and why:** 4 agents only. Decided by human on 26 Nov 2026 (`PM.md` Section 5, `PRD.md` Section 4).
- **Impact:** Simplifies planning, contract ownership, and LLM call budgets.
- **Status:** `ACCEPTED`
- **How to reverse it:** Add new agent definitions in `server/app/agents/` and update Manager activation rules.

### D-003 — Monorepo Layout (`client/` and `server/`)
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Structure the repository as a monorepo with `client/` (existing Next.js app moved via `git mv`) and `server/` (Python service).
- **Context:** Keeping Next.js at root alongside Python code mixes two ecosystems and build contexts.
- **Options considered:** (a) `client/` + `server/` monorepo; (b) Keep Next.js at root and add `server/`.
- **Chosen option and why:** `client/` + `server/`. Decided by human on 26 Nov 2026 (`PM.md` Section 5).
- **Impact:** Requires updating `DockerFile`, `docker-compose.yml`, and root `README.md` in Phase 1.
- **Status:** `ACCEPTED`
- **How to reverse it:** Move `client/` files back to root with `git mv`.

### D-004 — FastAPI Server in Private Docker Container
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Implement `server/` using **FastAPI**, run in its own Docker container, never exposed publicly.
- **Context:** Next.js needs an authenticated internal API to start multi-agent runs and stream SSE events.
- **Options considered:** (a) FastAPI in private container; (b) Publicly exposed Python API; (c) Next.js-only runtime.
- **Chosen option and why:** FastAPI in a private container. Decided by human on 26 Nov 2026 (`PM.md` Section 5).
- **Impact:** All browser traffic goes through Next.js API routes using a shared secret + Clerk user ID.
- **Status:** `ACCEPTED`
- **How to reverse it:** Expose or replace the FastAPI service.

### D-005 — Shared Project State in SQLite
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Persist shared project state as **Pydantic models stored in SQLite** (a database file on a Docker named volume). Neon Postgres is NOT used.
- **Context:** Originally considered Neon Postgres, but changed to SQLite on 26 Nov 2026 to fit CrewAI Flow persistence and eliminate external DB dependencies.
- **Options considered:** (a) SQLite on Docker named volume; (b) Neon Postgres; (c) JSON files in `.project-state/`.
- **Chosen option and why:** SQLite on a named volume. Decided by human on 26 Nov 2026 (`PM.md` v1.1).
- **Impact:** No database container needed in `docker-compose.yml`; SQLite write concurrency must be configured with short transactions and wait-on-contention.
- **Status:** `ACCEPTED`
- **How to reverse it:** Swap SQLAlchemy dialect/connection string in `server/app/state/` and Alembic config.

### D-006 — LLM Provider Modes
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Support three LLM modes via environment variables: Groq (`fast` / short tasks), Ollama on Google Colab via ngrok (`local`, demo only, optional), and Gemini (optional fallback).
- **Context:** Multi-agent runs make many LLM calls and need to respect free-tier rate/token limits.
- **Options considered:** (a) Single provider; (b) Configurable multi-provider routing (`auto`, `fast`, `local`) with fallback.
- **Chosen option and why:** Multi-provider routing. Decided by human on 26 Nov 2026 (`PM.md` Section 5).
- **Impact:** Requires `server/app/llm/` routing, health checks, throttling, and fallback reporting.
- **Status:** `ACCEPTED`
- **How to reverse it:** Simplify `server/app/llm/` to a single provider.

### D-007 — Deterministic Retry Cap
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Enforce retry counting and the cap of `3` per task in **deterministic Python code**, never inside LLM prompts.
- **Context:** LLMs cannot reliably track or enforce hard iteration limits.
- **Options considered:** (a) Deterministic code counter persisted before fix attempt; (b) LLM-managed retry loop.
- **Chosen option and why:** Deterministic code. Decided by human on 26 Nov 2026 (`PM.md` Section 5).
- **Impact:** Flow `Decide` step reads/increments SQLite `retry_counters` before invoking any fix.
- **Status:** `ACCEPTED`
- **How to reverse it:** Change `MAX_RETRIES` constant in deterministic flow code.

### D-008 — Additive Changes to Existing UI
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Keep the existing BlinkBuild UI intact; all UI changes are strictly additive.
- **Context:** Existing landing page, Clerk auth, `/generate` workspace, Monaco, and WebContainers preview already work.
- **Options considered:** (a) Additive UI updates; (b) Full UI rewrite.
- **Chosen option and why:** Additive only. Decided by human on 26 Nov 2026 (`PM.md` Section 5).
- **Impact:** Preserves all existing routes, components, and COOP/COEP headers.
- **Status:** `ACCEPTED`
- **How to reverse it:** Refactor `/generate` UI components later.

### D-009 — Remove Unused `/api/gemini` Route
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Delete `app/api/gemini/route.ts`.
- **Context:** Confirmed unused streaming endpoint in the repository.
- **Options considered:** (a) Delete it; (b) Keep unused code.
- **Chosen option and why:** Delete it. Decided by human on 26 Nov 2026 (`PM.md` Section 5).
- **Impact:** Removes dead Edge route in Phase 1 (`P1-T2`).
- **Status:** `ACCEPTED`
- **How to reverse it:** Restore `app/api/gemini/route.ts` from git history.

### D-010 — Retain `/api/chat` as Legacy/Baseline Path
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Keep `POST /api/chat` (and `POST /api/template`) as the legacy single-call baseline and fallback path.
- **Context:** Needed for Phase 13 evaluation comparison and as a fast/reliable fallback.
- **Options considered:** (a) Keep legacy path; (b) Delete `/api/chat`.
- **Chosen option and why:** Keep it. Decided by human on 26 Nov 2026 (`PM.md` Section 5).
- **Impact:** Client `/generate` maintains a toggle/path to run the legacy single-call flow.
- **Status:** `ACCEPTED`
- **How to reverse it:** Remove `/api/chat` and `/api/template` once legacy path is retired.

### D-011 — Dependency Governance
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Do not add any new dependency without a `docs/decisions.md` entry (and human approval at Checkpoint H2 if not listed in `PM.md` Section 7).
- **Context:** Prevents unverified or bloated dependencies.
- **Options considered:** (a) Strict logged approval; (b) Ad-hoc installs.
- **Chosen option and why:** Strict logged approval. Decided by human on 26 Nov 2026 (`PM.md` Section 5).
- **Impact:** Every package addition requires a `D-xxx` entry.
- **Status:** `ACCEPTED`
- **How to reverse it:** N/A (process rule).

### D-012 — QA Sandbox via Hardened Sibling Containers
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Run QA checks in **hardened sibling Docker containers** (not Docker-in-Docker), copying files in/out via Docker's archive API with no host bind mounts.
- **Context:** Untrusted generated code must be isolated without running privileged Docker-in-Docker.
- **Options considered:** (a) Sibling containers via Docker archive API; (b) Docker-in-Docker; (c) In-container execution.
- **Chosen option and why:** Sibling containers. Decided by human on 26 Nov 2026 (`PM.md` v1.1).
- **Impact:** Implemented in `server/app/sandbox/` in Phase 8.
- **Status:** `ACCEPTED`
- **How to reverse it:** Replace `server/app/sandbox/` runner implementation.

### D-013 — Docker Socket Proxy (Local Dev) vs. Rootless Docker (Public Hosting)
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** For local development, `server` may access Docker through a **socket proxy** with the hardened container template fixed in code. Before any public hosting, a **rootless Docker daemon** (or an evaluated proxy that inspects container-create bodies) is required.
- **Context:** A socket proxy restricts API endpoints (e.g., no exec, no builds) but does NOT inspect container-create request bodies, so it cannot block privileged flags or host mounts if the server process were compromised.
- **Options considered:** (a) Socket proxy locally + rootless Docker before public hosting; (b) Direct Docker socket mount; (c) Rootless Docker from day 1.
- **Chosen option and why:** Socket proxy locally, rootless Docker before public hosting. Decided by human on 26 Nov 2026 (`PM.md` v1.1).
- **Impact:** Residual risk documented; Checkpoint H3 enforces rootless Docker before any public exposure.
- **Status:** `ACCEPTED`
- **How to reverse it:** Switch `DOCKER_HOST` to a rootless Docker daemon locally as well.

### D-014 — Follow-Up Chat Stays on Legacy Path
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Follow-up chat messages in `/generate` stay on the legacy single-call `/api/chat` path in this release.
- **Context:** Keeps multi-turn refinement simple while the multi-agent engine handles initial generation.
- **Options considered:** (a) Legacy single-call path for follow-ups; (b) Full multi-agent loop for every follow-up.
- **Chosen option and why:** Legacy path. Decided by human on 26 Nov 2026 (`PM.md` v1.1).
- **Impact:** UI must clearly indicate which path a message uses (`P10-T6`).
- **Status:** `ACCEPTED`
- **How to reverse it:** Route follow-up prompts to `POST /runs` in a future release.

### D-015 — ngrok Browser-Warning Header
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** Use the exact header `ngrok-skip-browser-warning` on requests to the Colab Ollama ngrok tunnel.
- **Context:** Free ngrok tiers serve an HTML interstitial warning page unless this header is sent.
- **Options considered:** (a) `ngrok-skip-browser-warning`; (b) Paid ngrok static domain.
- **Chosen option and why:** `ngrok-skip-browser-warning` confirmed by human on 26 Nov 2026 (`PM.md` v1.1).
- **Impact:** Included in `server/app/llm/` Ollama client in Phase 11.
- **Status:** `ACCEPTED`
- **How to reverse it:** Remove header if switching away from ngrok.

### D-016 — Deferred Model Strings and Limits
- **Date and task ID:** 2026-11-26 | P0-T2
- **Decision:** LiteLLM model strings, Groq/Ollama/Gemini model names, provider rate limits, and per-run limits (calls, tokens, time) are **deferred** to the human. The Builder Agent must not choose, guess, or hard-code any of them.
- **Context:** Human will supply real model strings/keys at Phase 4 (H4) and tune per-run limits after measuring real runs.
- **Options considered:** (a) Hard-code defaults; (b) Environment-driven mechanism with clear startup/warning behavior and no hard-coded model strings or limits.
- **Chosen option and why:** Deferred to human. Decided by human on 26 Nov 2026 (`PM.md` v1.1).
- **Impact:** Phase 4 builds the config/throttling/limit mechanism and tests it with stubs until H4 values are supplied.
- **Status:** `ACCEPTED`
- **How to reverse it:** Supply values via `.env` at Checkpoint H4.

### D-017 — Working Branch & QA Commit Handling (Checkpoint H1)
- **Date and task ID:** 2026-11-26 | P0-T3 / H1
- **Decision:** Revert commit `f4318df` on `qa` first, then create the working branch `feat/multi-agent-engine` from `qa` (and commit `docs/` first per `PM.md` Section 4.1).
- **Context:** `PM.md` `P0-T3` requires not working on `main` and proposing the branch name in `decisions.md`. Currently `HEAD` is on `qa` (`f4318df`), while `main` is at `65de19a`.
- **Options considered:** (a) Branch `feat/multi-agent-engine` directly from `65de19a`; (b) Branch from `qa` (`f4318df`) and `git revert f4318df` in `P1-T1`; (c) Revert `f4318df` on `qa` first, then create `feat/multi-agent-engine` from `qa`.
- **Chosen option and why:** Option (c) — chosen by human at Checkpoint H1 on 26 Nov 2026.
- **Impact:** Keeps `qa` history explicit with a revert commit before branching `feat/multi-agent-engine` for Phase 1.
- **Status:** `ACCEPTED`
- **How to reverse it:** Recreate or rebase `feat/multi-agent-engine` from `65de19a`.
