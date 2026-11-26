# PM: Project Plan for the Builder Agent (BlinkBuild Multi-Agent Engine)

Version: 1.1 | Date: 26 Nov 2026 | Companion: `PRD.md`
Audience: an AI coding agent (the **Builder Agent**) that will build this project step by step.
Read this whole file before doing anything. If anything here conflicts with your assumptions, this file wins. If this file is silent or unclear, STOP and ask the human (see section 16). Do not guess.

**Version 1.1 changes (decided by the human on 26 Nov 2026):**
1. Shared project state moves from Neon Postgres to **SQLite** (D-005). Neon is no longer used anywhere.
2. Sandbox approach is decided: **hardened sibling containers**, with different safeguards for local development and for any public hosting (D-012, D-013, Phase 8).
3. Follow-up chat stays on the legacy single-call path (D-014).
4. The ngrok header name is confirmed: `ngrok-skip-browser-warning` (D-015).
5. LiteLLM model strings, Groq and Ollama model names, provider rate limits, and per-run limits are **deferred**: the human will supply them later (D-016). Do not choose or invent them.

**`PRD.md` was updated to version 1.1 with the same decisions.** If the two files ever disagree, this file wins. Log the mismatch in `docs/decisions.md` and do not edit the PRD unless asked.

---

## 0. How to use this document

1. Read `PRD.md` and this `PM.md` completely.
2. Do Phase 0 first. It creates the three mandatory documentation files (section 4).
3. Execute phases in order. Do not start a phase until the previous phase's exit gate is met and logged.
4. Work in small tasks. After each task: verify, log, then move on.
5. Never claim something works unless you ran it and saw the result. Record the evidence.
6. Stop at every **Human Checkpoint** (section 16) and wait for approval.

## 1. Terminology (use these exact words)

| Term | Meaning |
| :--- | :--- |
| **Builder Agent** | You. The AI assistant executing this plan and writing the repository's code. |
| **Runtime agents** | The CrewAI agents (Manager, Frontend, Backend, QA) that run inside the finished product and generate websites for end users. |
| **client** | The Next.js app (`client/`). |
| **server** | The Python FastAPI + CrewAI service (`server/`). |
| **Run** | One execution from a user prompt to a final status. |
| **Generated project** | The website code produced by the runtime agents for an end user. It is NOT this repository's code. |

Common confusion to avoid: the Frontend and Backend **runtime agents** do not edit BlinkBuild's own source code. They write the generated project that BlinkBuild displays.

## 2. Ground truth about the existing repository

Treat these as facts from `PROJECT_HISTORY_AND_QA_COMMIT.md` Part 1. Before relying on any of them, confirm it by reading the actual file in the repo, because the repo may have changed. If reality differs from this list, log the difference in `docs/decisions.md` and ask the human if it affects the plan.

**Must keep working (do not break, do not rewrite):**
- Landing page and form (`app/page.tsx`, `app/actions.ts`), Clerk auth (`app/layout.tsx`, `proxy.ts`, sign-in/up pages).
- `/generate` workspace (`app/generate/page.tsx`, `app/generate/generation-content.tsx`).
- `components/FileExplorer.tsx`, `components/CodeEditor.tsx` (Monaco, read-only, `vs-dark`), `components/PreviewFrame.tsx`.
- `hooks/useWebcontainers.ts` (singleton WebContainer boot).
- `app/lib/steps.ts` with `parseXml()` and the `StepType` values (`CreateFolder`, `CreateFile`, `RunScript`), `app/lib/prompt.ts`, `app/lib/constants.ts`, `app/lib/defaults/react.ts` and `node.ts`.
- `POST /api/template` and `POST /api/chat` (kept as the legacy single-call path).
- `next.config.ts` and `vercel.json` COOP/COEP headers. Without them WebContainers fail. Never remove them.
- The step reveal behavior (a queue that reveals steps about every 350 ms) and the Ready overlay.

**Must remove or fix:**
1. Delete `app/api/gemini/route.ts` (unused streaming route).
2. Fix the `node` branch in `app/api/template/route.ts` so `prompts` uses `nodeBasePrompt` consistent with `uiPrompts`. Verify by reading the file first.
3. Remove `axios` from dependencies if nothing imports it. Search the whole client before removing.
4. Revert/discard the QA commit's additions: `.github/agents/*.agent.md`, `.project-state/`, `lib/agents/`, `app/api/agents/qa/route.ts`, `scripts/run-qa-simulation.mjs`. Check with the human whether to use `git revert`, delete the `qa` branch work, or start a new branch from `65de19a` (Checkpoint H1).

## 3. Anti-hallucination rules (mandatory)

1. **Never invent** file paths, package names, package versions, function names, API parameters, environment variable names, CrewAI/LiteLLM/Docker/ngrok options, or command-line flags. If you have not read it in this repo or in the official documentation during this session, treat it as unknown.
2. **Verify against sources before use.** For any third-party library (CrewAI, LiteLLM, FastAPI, SQLAlchemy, Alembic, Pydantic, Playwright, Docker and its SDK, Ollama, Groq, ngrok), read the current official documentation or installed package source for the version you pin. Record the doc URL and version in `docs/decisions.md`. Items marked **[VERIFY]** in this plan are known to need this.
3. **Read before you edit.** Open the file and read it before changing it. Never edit from memory of what a file "probably" contains.
4. **No fake results.** Never write placeholder implementations that pretend to work (for example, hard-coded pass results, simulated QA, mocked agent output). The previous QA commit simulated results. That is explicitly forbidden here. If something cannot be done yet, say so and log it as a blocker.
5. **Never claim success without evidence.** Run the command, read the output, and log the command and the outcome in `docs/activity-log.md`. "Should work" is not a result.
6. **Do not add features, files, or dependencies that are not in this plan.** If you believe one is needed, record the proposal and reason in `docs/decisions.md` as `PROPOSED` and wait for approval if it affects scope, cost, or security.
7. **Do not change settled decisions** (section 5). To change one, ask the human.
8. **If two sources disagree** (for example this plan versus the real repo, or docs versus installed behavior), log both, choose the one you can verify by running it, and say why.
9. **Unknowns go in the open list**: write them under "Open questions" in `docs/decisions.md` and ask at the next checkpoint. Never fill a gap with a plausible guess.
10. **Keep changes small and reversible.** One task per commit. Commit messages name the task ID.
11. **Secrets**: never print, log, commit, or hard-code keys, tokens, or URLs that contain tokens. Only reference environment variable names.
12. **Do not weaken tests or limits** to make something pass (retry cap, sandbox limits, auth checks).

## 4. Mandatory documentation files

The Builder Agent creates and maintains three files in `docs/` at the repository root. They are part of the deliverable and part of the definition of done.

### 4.1 When to create them

At the very start (Phase 0, before touching any code), create all three. Create them in this order:
1. `docs/flow.md`
2. `docs/decisions.md`
3. `docs/activity-log.md`

Create the `docs/` folder if it does not exist. Commit them first, as the first commit of the work, named `docs: add flow, decisions, activity log`.

### 4.2 `docs/flow.md` (the basic flow and how it works)

**Purpose:** a plain-language description of how the whole system works, so a new reader (human or agent) understands it without reading code.

**Write it at the start** from the PRD and this plan, then **update it whenever the real behavior changes**. Add a "Last updated" line with the date and the task ID that changed it.

**Required sections:**
1. One-paragraph summary of what BlinkBuild does now.
2. The two codebases (`client`, `server`) and what each is responsible for.
3. Step-by-step flow of a run, from the user typing a prompt to a final status (use a numbered list; add a simple Mermaid or ASCII diagram if helpful).
4. The runtime agents, one short paragraph each: purpose, inputs, outputs, what it never does.
5. The control loop and the retry cap, in plain words.
6. LLM routing: the modes (`auto`, `fast`, `local`), the fallback chain, and where models are configured.
7. Where shared state lives and what is in it.
8. How the client displays results (SSE events, file tree, Monaco, WebContainers preview).
9. How to run everything locally (commands as they actually exist after you have verified them).
10. Known limitations.

Rule: if `flow.md` says something, it must be true of the code as it exists today. Do not describe features that are not built yet, except under a clearly labeled "Planned" heading.

### 4.3 `docs/decisions.md` (every decision and why)

**Purpose:** a record of every decision the Builder Agent makes, with the reasoning, so the human can audit and reverse choices.

**Rule:** write an entry BEFORE or at the moment you act on the decision, never later from memory. A decision is anything where you chose between alternatives, picked a version, named a file or endpoint, added a dependency, skipped something, deviated from this plan, or resolved an ambiguity.

**Entry format (one per decision, newest at the bottom):**
- **ID:** `D-001`, `D-002`, ... (never reuse)
- **Date and task ID** (for example `P3-T2`)
- **Decision:** one sentence
- **Context:** what problem or question led to it
- **Options considered:** each with a short pro and con
- **Chosen option and why:** the reasoning, with evidence (file read, doc URL and version, command output)
- **Impact:** what it affects (files, behavior, cost, security)
- **Status:** `PROPOSED`, `ACCEPTED`, `NEEDS HUMAN APPROVAL`, `SUPERSEDED by D-xxx`, or `REVERSED`
- **How to reverse it** (one line)

The file also has an **"Open questions"** section at the top for unresolved items, each with an ID `Q-001...`, the question, why it blocks or matters, and a proposed default if any. Move an item into a decision entry once the human answers.

Seed it with the settled decisions in section 5 as `ACCEPTED` entries (D-001 onward), citing "Decided by human on 26 Nov 2026".

### 4.4 `docs/activity-log.md` (everything the agent is doing)

**Purpose:** a chronological, append-only journal of everything the Builder Agent does in the project.

**Rules:**
- Append an entry for every meaningful action: file created, modified, moved, or deleted; dependency added or removed; command run; test run; error encountered; fix attempted; checkpoint reached; question asked to the human.
- Never edit or delete old entries. If an earlier entry was wrong, add a correction entry that references it.
- Write the entry right after the action, not in a batch later.
- Do not paste secrets or full large outputs. Trim long outputs to the relevant lines and say they were trimmed.

**Entry format:**
- **Time and sequence number** (`#0001`...)
- **Task ID** and **requirement IDs** (for example `P5-T3`, `FR-10`)
- **Action:** what you did, in one or two sentences
- **Files touched:** list of paths with created/modified/deleted
- **Commands run:** exact commands
- **Result:** what you observed (pass/fail, key output lines) and the evidence
- **Next step:** what you will do next
- **Linked decisions:** `D-xxx` if any

### 4.5 Relationship between the three files

- `flow.md` = how it works (kept accurate).
- `decisions.md` = why it was built that way (every choice).
- `activity-log.md` = what happened and when (every action).

Each phase's exit gate (section 8) requires all three to be up to date. A phase is not done if any file is stale.

## 5. Settled decisions (do not re-litigate; seed these into `decisions.md`)

| ID | Decision |
| :--- | :--- |
| D-001 | Agent framework is **CrewAI**. No GitHub Copilot agent files. |
| D-002 | Runtime agents in scope: **Manager, Frontend, Backend, QA** only. |
| D-003 | Monorepo with `client/` (Next.js, existing app moved) and `server/` (Python). |
| D-004 | Server is **FastAPI**, run in its own Docker container, never public. |
| D-005 | Shared project state is **Pydantic models stored in SQLite** (a database file on a Docker named volume). Changed from Neon Postgres on 26 Nov 2026, to fit CrewAI Flow persistence (to be confirmed by reading the current CrewAI docs). Neon is NOT used. |
| D-006 | LLM modes: Groq for short/fast, Ollama on Google Colab through ngrok for long generation (demo only, optional), Gemini as optional fallback. All set per agent through environment variables. |
| D-007 | Retry counting and the cap of 3 live in deterministic code, not in the LLM. |
| D-008 | Existing BlinkBuild UI is kept. Changes to it are additive. |
| D-009 | `/api/gemini` is removed. |
| D-010 | The existing single-call generation (`/api/chat`) stays as a legacy/baseline path. |
| D-011 | No new dependency without a `decisions.md` entry. |
| D-012 | QA sandbox uses **sibling containers** (not Docker-in-Docker). Generated files are copied in and results copied out through Docker's archive API. No host bind mounts. |
| D-013 | For local development the server may reach Docker through a **socket proxy** with the hardened container template fixed in code. The proxy limits which API endpoints are allowed but does NOT inspect the contents of a container-create request, so it cannot stop a host mount or privileged flag. This residual risk must be written in `decisions.md`. Before any public hosting, a **rootless Docker daemon** (or a proxy that inspects create-request bodies, after evaluation) is required. |
| D-014 | Follow-up chat messages stay on the legacy single-call path in this release. |
| D-015 | The ngrok header that skips the browser warning page is `ngrok-skip-browser-warning` (confirmed by the human). |
| D-016 | **Deferred, human will supply later:** LiteLLM model strings, Groq and Ollama model names, provider rate limits, and per-run limits (calls, tokens, time). The Builder Agent must not choose, guess, or hard-code any of these. |

## 6. Target repository structure

Create exactly this layout. Anything else needs a decision entry.

- Repository root: `client/`, `server/`, `docs/`, `docker-compose.yml`, `.env.example`, `README.md`, `PRD.md`, `PM.md`.
- `client/`: the whole existing Next.js project (its own `package.json`, `next.config.ts`, `proxy.ts`, `vercel.json`, Dockerfile, `app/`, `components/`, `hooks/`). Move with `git mv` so history is kept.
- `client/` additions: one Next.js API route that forwards run requests to the server and streams events back, an agent-activity panel and mode selector in the `/generate` workspace, and generated TypeScript types for the server API.
- `server/app/`: `main` (FastAPI entry), `api/` (routes and SSE), `agents/` (manager, frontend, backend, qa), `flows/` (control loop), `state/` (Pydantic models, database access), `llm/` (provider routing, fallback, throttling, usage tracking), `sandbox/` (test runner), `tools/` (agent tools), `config/` (settings from environment).
- `server/`: `alembic/` migrations, `pyproject.toml`, Dockerfile, `colab/` (the Ollama demo notebook), `tests/`.
- `docs/`: `flow.md`, `decisions.md`, `activity-log.md`.

## 7. Technology stack

| Area | Choice | Notes |
| :--- | :--- | :--- |
| Client | Existing stack (Next.js 16, React 19, TS 5, Tailwind 4, shadcn/ui, Clerk, Monaco, WebContainers) | Unchanged versions unless a task says otherwise. |
| Server language | Python 3.11 or newer | Confirm the version CrewAI supports. **[VERIFY]** |
| API framework | FastAPI | Generates an OpenAPI schema used to produce client types. |
| Agent framework | CrewAI (Crews for agents, Flows for the control loop) | **[VERIFY]** how Flow state persistence works and where it stores data (expected to use SQLite), hierarchical process, per-agent LLM config, `max_rpm`. |
| LLM access | CrewAI's LLM layer (LiteLLM) | Model strings **DEFERRED (D-016)**. Build the config so they come from environment variables and fail with a clear message if missing. |
| Schemas | Pydantic | Single source of truth for state shapes. |
| Database | SQLite (single file on a Docker named volume) | One writer at a time is acceptable for this project. The file must survive container restarts. |
| DB access | SQLAlchemy 2.x with the built-in SQLite driver, Alembic migrations | Alembic needs SQLite's batch mode for schema changes **[VERIFY]**. Alternative: SQLModel. Record the choice in `decisions.md`. |
| Streaming | Server-Sent Events | Server to Next.js to browser. |
| Sandbox | Hardened sibling Docker containers, one per check, started and removed by the server's runner code | Decided in D-012 and D-013. See Phase 8. Docker SDK for Python is expected; log the choice. **[VERIFY]** |
| QA tools | ESLint, TypeScript compiler, Vitest (JS unit), Playwright (browser smoke) | Run inside the sandbox against the generated project. **[VERIFY]** |
| Tunnel (demo) | ngrok | Header `ngrok-skip-browser-warning` is confirmed (D-015). **[VERIFY]** the free-tier URL behavior. |
| Orchestration | Docker Compose with `client` and `server` services (plus the socket proxy for local development, see Phase 8) | No database container. SQLite file lives on a named volume. |

## 8. Phases, tasks, and exit gates

Task ID format: `P<phase>-T<number>`. For every task: do the steps, verify the acceptance criteria, update the three docs, commit.

### Phase 0: Preflight and documentation

**Goal:** understand the real repo, create the three docs, and get approval to proceed.

- **P0-T1 Inspect the repository.** List the actual files and folders. Compare with section 2. Open `package.json`, `next.config.ts`, `proxy.ts`, `app/api/template/route.ts`, `app/api/chat/route.ts`, `app/lib/steps.ts`, `app/generate/generation-content.tsx`. Note differences.
  - Accept: a written list of confirmed facts and discrepancies in `activity-log.md`.
- **P0-T2 Create `docs/flow.md`, `docs/decisions.md`, `docs/activity-log.md`** as defined in section 4. Seed `decisions.md` with D-001 to D-016 and the open questions listed in section 16.5 of this file (not the older list in `PRD.md` section 13, which is partly answered).
  - Accept: all three files exist, follow the formats, and are committed first.
- **P0-T3 Create a working branch** (name proposed in `decisions.md`). Do not work on `main`.
- **P0-T4 Confirm the existing app runs** before any change: install, build, start. Record exact commands and outcome.
  - Accept: the build result is logged. If it fails at baseline, log the failure and ask the human before changing anything.

**Exit gate:** human approves (Checkpoint H1). Three docs are current.

### Phase 1: Cleanup and monorepo move

**Goal:** a clean base in the new layout with no behavior change.

- **P1-T1 Handle the QA commit** according to the human's answer at H1. Ensure the 19 files from the QA commit are not present in the working tree afterward.
- **P1-T2 Delete `/api/gemini`.** Search for imports and references first.
- **P1-T3 Fix the `node` branch bug** in `/api/template`.
- **P1-T4 Remove unused `axios`** after confirming no imports.
- **P1-T5 Move the app into `client/`** with `git mv`. Update paths in the Dockerfile, `docker-compose.yml`, and any config that assumes the old root. Keep `next.config.ts` and `vercel.json` headers identical.
- **P1-T6 Add root files:** `.env.example` (names only, no values), root `README.md` with accurate run instructions.
- **P1-T7 Smoke test** from `client/`: build, start, sign-in page loads, a prompt still generates a site through the legacy path, preview works.

**Acceptance:** behavior identical to Phase 0 baseline. Evidence logged.
**Exit gate:** docs updated, `flow.md` describes the two-folder layout.

### Phase 2: Server skeleton

**Goal:** a running Python service the client can reach, with no agents yet.

- **P2-T1 Create `server/`** with project config, dependency pinning, and a Dockerfile (non-root user).
- **P2-T2 FastAPI app** with `GET /health` returning status and version.
- **P2-T3 Settings loading** from environment variables only. Fail fast with a clear error if a required variable is missing. Never log values.
- **P2-T4 Shared-secret authentication** on every route except `/health`. Requests must carry the shared secret and the forwarded Clerk user ID. Reject otherwise with a clear status code.
- **P2-T5 Add the `server` service to `docker-compose.yml`.** Do not publish its port to the host beyond what local development needs; document this choice. Add a **named volume** for the SQLite data directory and mount it into the server container so data survives restarts.
- **P2-T6 Test:** health works; protected route without the secret is rejected; with the secret is accepted.

**Exit gate:** `docker compose up` starts both services. Tests logged.

### Phase 3: Shared project state (Pydantic + SQLite)

**Goal:** the single source of truth, persisted in a SQLite file.

- **P3-T1 Define Pydantic models** (names and fields are proposals; log final names in `decisions.md`): Run, Plan, Task, Contract (routes, shapes, file ownership), GeneratedFile, TestCase, TestResult, Defect, AgentStatus, RetryCounter, LlmUsage, AuditEntry.
  - Required fields to include: IDs, run ID, timestamps, status enums, owner (`frontend`/`backend`/`manager`/`qa`), requirement references, evidence text for defects, retry count per task, provider and model per LLM call.
  - Status enums must match section 10 exactly.
- **P3-T2 Decide the database file layout.** First read what CrewAI's Flow persistence writes and where (**[VERIFY]**). Then decide and log: (a) one SQLite file shared by CrewAI's persistence and our shared state, or (b) two separate files. Prefer the option that is simplest and does not let CrewAI's tables and ours interfere. The database path comes from an environment variable and points into the named volume.
- **P3-T3 Database layer and migrations** (Alembic, SQLite batch mode **[VERIFY]**). Use JSON columns for structured lists (criteria, test cases, file lists). Turn on foreign key enforcement for SQLite connections (it is off by default; confirm this in the SQLAlchemy/SQLite docs).
- **P3-T4 Repository functions** to create and read runs and to update tasks, record test results, log defects, increment retries, and append audit entries. Every write validates through the Pydantic models.
- **P3-T5 Concurrency handling:** SQLite allows one writer at a time. Configure the connection so short write contention waits instead of failing (**[VERIFY]** the right setting for the chosen driver), and keep write transactions short. Never hold a transaction open during an LLM call or sandbox run.
- **P3-T6 Tests** against a temporary SQLite file: create a run, update status, log a defect, read it back, reject an invalid write, and confirm data survives a restart of the server container (volume test).

**Exit gate:** migrations apply on a clean file; tests pass; restart persistence confirmed; evidence logged.

### Phase 4: LLM layer

**Goal:** one place that decides which model answers, with limits. **Model names, model strings, provider rate limits, and per-run limits are deferred (D-016). Build the mechanism, not the values.**

- **P4-T1 Provider configuration** from environment: a model string per agent (Manager, Frontend, Backend, QA), the provider for each mode, and credentials. Do not write any model name or model string in code or in committed defaults. If a required value is missing, fail at startup with a clear message that names the variable. Add every variable name to `.env.example` with no value.
- **P4-T2 Modes:** `fast` (Groq), `local` (Ollama through the tunnel URL), `auto` (decided per task from the Manager's plan: short tasks to Groq, large multi-file generation to Local if healthy).
- **P4-T3 Health checks** for Local (reach the tunnel, run a tiny request) and Groq. Expose `GET /llm/status` (authenticated).
- **P4-T4 Fallback chain** (configurable): Local then Groq then Gemini (only if a key exists). On a rate-limit or connection error, move to the next provider, write an audit entry, and report it to the UI.
- **P4-T5 Throttling:** a per-provider requests-per-minute setting read from environment. Provider limits change and are deferred, so do not hard-code any number. If the setting is missing, throttling is off and this is logged as a warning.
- **P4-T6 Usage tracking:** record provider, model, tokens in/out (when the provider returns them), and latency for every call in `LlmUsage`.
- **P4-T7 Per-run limits:** max LLM calls, max tokens, max wall-clock time, each read from environment. No default values are invented. If a limit is not set, the run is allowed but a warning is written to the audit log. When a limit is set and reached, the run ends as `escalated` with the reason. The human will choose the values after measuring real runs.
- **P4-T8 Tests** with a stubbed provider server (allowed for testing the routing layer only, never for QA verdicts): confirm fallback, throttling when configured, and limit enforcement when configured.

**Exit gate:** the mechanism works under test. A real call against Groq, Local, or Gemini is attempted only after the human supplies the model names and keys, and is otherwise logged as "not tested, waiting for D-016 values".

### Phase 5: Backend runtime agent (first agent, end to end)

**Goal:** one real agent producing real files, proving the pipeline.

- **P5-T1 Define the agent** (role, goal, backstory) following the spec in section 9. Keep it short and strict.
- **P5-T2 Define its input** (task, contract, existing owned files, WebContainer constraints, base template type) and **output** (a structured list of files with path and full contents, plus a short notes field). Validate output with Pydantic. Invalid output gets one re-ask, then the task fails with a logged reason.
- **P5-T3 Constraints in the prompt:** the WebContainer rules from `app/lib/prompt.ts` (no native binaries, no Python, no git; Node.js-only). Read that file and carry the rules over accurately. Do not paraphrase from memory.
- **P5-T4 Merge step:** convert agent output into the `<boltArtifact>` format that `parseXml()` accepts. Read `steps.ts` first and match its expectations exactly (artifact title, file actions, shell actions).
- **P5-T5 Test** with a "backend-only" prompt. Confirm the existing client parser can read the merged artifact (use the existing parser in a small test, or load it in `/generate` manually).

**Exit gate:** a Backend-only run produces files that appear in the existing file tree and Monaco. Evidence logged.

### Phase 6: Frontend runtime agent and the contract

**Goal:** two agents that agree.

- **P6-T1 Define the Frontend agent** per section 9.
- **P6-T2 Define the Contract model** and rules: routes, methods, request/response shapes, and **file ownership by path prefix**. The Manager writes it; both agents receive it.
- **P6-T3 File-conflict detection** in the merge step: same path from two agents is a defect against the contract.
- **P6-T4 Context minimization:** each agent receives only the task, contract, and the files it owns or must read. Not the full conversation.
- **P6-T5 Test** with a UI-only prompt and a full-stack prompt. Confirm both agents' files merge cleanly.

**Exit gate:** full-stack prompt produces merged files and previews in WebContainers.

### Phase 7: Manager runtime agent

**Goal:** planning and routing.

- **P7-T1 Define the Manager** per section 9.
- **P7-T2 Plan output model:** which agents to activate, task list, acceptance criteria per task, contract (when both agents are active), and a per-task size hint (`short` or `long`) used by `auto` mode.
- **P7-T3 Selective activation rules** exactly as FR-06. QA is always on.
- **P7-T4 Defect routing:** given a defect, return one owner from `frontend` or `backend`. Validate against the allowed list. Invalid answer: re-ask once, then escalate.
- **P7-T5 Tests** on at least 6 prompts (2 UI-only, 2 backend-only, 2 full-stack). Check that activation matches FR-06. Record misroutes honestly.

**Exit gate:** activation is correct on the test prompts, or failures are logged with analysis.

### Phase 8: QA runtime agent and sandbox

**Goal:** real verification, with a sandbox that limits what generated code can do.

**Decided approach (D-012, D-013):** sibling containers started by the server's runner code. Not Docker-in-Docker.

**Why the safeguards differ by environment (write this into `decisions.md`):**
- Generated code runs inside the sandbox container and never has access to Docker.
- The real risk is the server process being compromised or misused, because it can ask Docker to create containers. A socket proxy limits which API endpoints are reachable (for example no exec, no image builds), but it does **not** inspect the contents of a create request, so it cannot stop a privileged container or a host mount. Do not describe the proxy as preventing those.
- Local development on the human's own machine: socket proxy plus the fixed hardened template is acceptable, with the residual risk documented.
- Before any public hosting: use a **rootless Docker daemon** (or a proxy that inspects create-request bodies, only after evaluating it). This requires human approval (H3).

- **P8-T1 Document and implement Docker access.**
  - Add a socket proxy service to Docker Compose for local development, allowing only the endpoint families the runner needs (containers, and write methods). Keep exec, builds, networks, volumes and other families off unless a task proves they are needed and the human approves.
  - Only the sandbox runner module in `server/app/sandbox/` may talk to Docker. Agents and agent tools get no Docker access of any kind.
  - Write the residual-risk statement and the "before public hosting" requirement into `decisions.md` (D-013).
- **P8-T2 Hardened container template, fixed in code.** The runner builds container options itself. Nothing from agent output, user prompts, or generated files may influence these options. The template includes: all Linux capabilities dropped, no-new-privileges, non-root user, read-only root filesystem with small writable temporary areas, a process-count limit, CPU limit, memory limit, no privileged mode, no host network, no host bind mounts, no mounted Docker socket, and a label that marks it as a BlinkBuild sandbox. **[VERIFY]** each option name in the Docker SDK documentation.
  - **Memory:** a temporary in-memory area counts against the container's memory limit, and npm, a build, and a browser together use a lot. Do not pick a small number from memory. Start with a generous value, measure real runs, and record the measurements before settling the limit.
- **P8-T3 No host paths, no exec.** Copy generated files into the container and results out through Docker's archive API (tar streams in memory). Run each check as its own short-lived container whose command is set at creation. Do not use exec.
- **P8-T4 Network in two phases.**
  - Install phase: the container may reach only a package source that is allow-listed (a package mirror or filtering proxy). A Docker internal network blocks all outbound traffic, including package downloads, so it cannot be used by itself for this phase.
  - Build, test, and browser phases: no network at all.
  - Choosing the mirror or proxy is a new dependency decision. Record options and ask the human (H2) before adding it. Until it is decided, the install phase is blocked and must be logged as blocked.
- **P8-T5 Pre-built sandbox image** with Node and the browser tooling already installed, so browser binaries are not downloaded on every run. Check the browser tool's current Docker guidance for required flags and the base image (**[VERIFY]**). If hardening options conflict with the browser's needs, log the specific conflict and the exact trade-off. Do not silently weaken the template.
- **P8-T6 Install scripts.** Evaluate running package installs with lifecycle scripts disabled to reduce risk from malicious packages, and test that the generated React and Node templates still build. Record the result (**[VERIFY]**).
- **P8-T7 Timeouts and cleanup.** Every check has a hard time limit. Container removal happens in a cleanup block that always runs, even on errors. On server start, a cleanup routine removes any leftover sandbox containers found by their label.
- **P8-T8 Check sequence** in order: install, build, lint, type-check, unit tests, browser smoke test. Capture trimmed output for each.
- **P8-T9 QA agent:** from the acceptance criteria, produce test cases and test files for the generated project (categories in FR-13). QA writes tests only. It must not change application files and must not mock the logic under test.
- **P8-T10 Result recording:** store each check's outcome. For each failure create a `Defect` with the failing check, trimmed evidence, and suspected owner (initially "unassigned", the Manager assigns).
- **P8-T11 Honest pass/fail:** a run passes only if every required check passed in the sandbox. A skipped or blocked check is recorded as skipped or blocked, never as passed.
- **P8-T12 Tests:**
  1. A known-good generated project passes.
  2. A known-bad project (for example a deliberate syntax error) fails with the right defect.
  3. Hardening check: from inside a sandbox container, confirm it cannot reach the host network, the server container, the Docker socket, or any secret, and that it cannot write outside its allowed areas. Log the exact commands and results.
  4. A hung process is killed at the timeout and the container is removed.
  5. Leftover containers are removed on restart.

**Known limitation (write into `flow.md`):** QA runs the generated project in a full Node container. The live preview runs in WebContainers, which is a different runtime. A project can pass QA and still fail in the preview. Record any such case found during evaluation.

**Exit gate:** QA catches a deliberately broken project and passes a good one using real execution, and the hardening checks in P8-T12 pass.

### Phase 9: Control loop (CrewAI Flow)

**Goal:** the full run with bounded retries.

- **P9-T1 Flow steps** in this order: Understand (read prompt), Plan (Manager), Select (activation), Execute (agents generate), Merge, Validate (QA), then Decide.
- **P9-T2 Decide logic (deterministic code):**
  - All checks passed: status `succeeded`.
  - Failures and retry count for that task below 3: ask the Manager to route each defect, increment the counter, call the owner to fix, merge, re-run the failed checks plus a regression pass.
  - Retry count reached 3: status `escalated` with an escalation report.
- **P9-T3 Counters are written to the database before the fix is attempted.** There must be no path that retries without incrementing.
- **P9-T4 Persist flow state** after every step so a crashed run can resume. Use the layout decided in P3-T2. **[VERIFY]** CrewAI's persistence mechanism and what it stores. Test a real resume: stop the server mid-run, restart, and confirm the run continues from the last saved step.
- **P9-T5 Escalation report:** what was requested, what failed, what was tried each retry, trimmed evidence, which provider/model was used, and suggested human next steps.
- **P9-T6 Cancellation:** a run can be cancelled; the sandbox is cleaned up.
- **P9-T7 Tests (real, not simulated):**
  1. A normal prompt succeeds.
  2. A defect recovery: introduce a real fault via a controlled test prompt or test fixture, confirm the loop fixes it and the counter shows the retries used.
  3. An unfixable case: confirm the run stops at exactly 3 retries and escalates.

**Exit gate:** all three scenarios behave as specified, with logs showing retry counts and audit entries.

### Phase 10: Client integration

**Goal:** the user sees it all in the existing UI.

- **P10-T1 Next.js route** that checks the Clerk session, forwards the run request with the shared secret and user ID, and relays SSE events. The browser never sees the secret.
- **P10-T2 Generate TypeScript types** from the server's OpenAPI schema into `client/`. Do not hand-write duplicates.
- **P10-T3 `/generate` changes (additive only):** mode selector (`Auto`, `Fast`, `Local`), agent activity panel (active agent, task, state), test results and defects view, retry counter, escalation report view, and a notice when a fallback happens.
- **P10-T4 Feed results into the existing pipeline:** the merged artifact goes through `parseXml()`, the file tree, Monaco, and WebContainer mount exactly as today.
- **P10-T5 Keep the legacy path** reachable (a clear toggle or setting) for baseline comparison.
- **P10-T6 Follow-up chat:** stays on the legacy single-call path (D-014). Do not route it through the agents. Make it clear in the UI which path a message uses.
- **P10-T7 Reconnect behavior:** if the SSE connection drops, the UI can resume by run ID.
- **P10-T8 Manual end-to-end test** in the browser: sign in, prompt, watch agents, see files, see preview.

**Exit gate:** the full user flow works. Screens or logs recorded as evidence.

### Phase 11: Colab Ollama demo mode

**Goal:** optional Local mode for demonstration.

- **P11-T1 Notebook** in `server/colab/`: install Ollama, start the server, pull the coder model (the model name is supplied by the human later, D-016; read it from a notebook variable and do not hard-code one), warm it with a small prompt, open the ngrok tunnel on the Ollama port, print the public URL. Read the ngrok token from Colab Secrets, never from the notebook text.
- **P11-T2 Access protection:** require a bearer token on requests to the Ollama endpoint (through a small proxy in the notebook or a tunnel setting). **[VERIFY]** which is supported. The server sends the token from its environment.
- **P11-T3 Browser-warning header:** the server sends the header `ngrok-skip-browser-warning` on every request to the tunnel URL (confirmed, D-015). If a response comes back as an HTML page instead of JSON, log it as a defect in this task and do not invent a different header.
- **P11-T4 Docs:** a short "How to run the demo" in `docs/flow.md` (start notebook, copy URL, set `OLLAMA_BASE_URL`, confirm `/llm/status`).
- **P11-T5 Test:** run the same prompt in `local` mode. If Colab is unavailable, log "not tested" and mark the task blocked. Do not claim it works.
- **P11-T6 Failure test:** stop the notebook mid-session and confirm the server falls back and tells the UI.

**Notes:** this mode is for demonstration only. Free Colab may terminate runtimes that expose a web endpoint, so never make it the only provider. Keep usage short.

**Exit gate:** demo works once end to end, or the blocker is logged.

### Phase 12: Audit, limits, and observability

- **P12-T1 Audit entries** for every routing decision, activation, retry, escalation, fallback, and limit hit.
- **P12-T2 Run summary** endpoint: status, tasks, defects, retries, providers used, tokens, duration.
- **P12-T3 Verify limits** from P4-T7 trigger correctly (test with low limits).
- **P12-T4 Sanity check for secrets in logs.** Search logs and the database for key patterns.

### Phase 13: Evaluation

- **P13-T1 Create the prompt set** (at least 10: 3 UI-only, 3 backend-only, 4 full-stack, at least 2 involving login). Save it in the repo with expected acceptance points. Log it in `decisions.md`.
- **P13-T2 Run each prompt** through the agent engine and through the legacy single-call path. Same prompts, same conditions.
- **P13-T3 Record metrics** from `PRD.md` section 11 in a results table. Mark anything not measured as "not measured".
- **P13-T4 Honest report** in `docs/evaluation.md`: the numbers, the failures, and what the failures show. Do not invent targets or round up.

### Phase 14: Finalization

- **P14-T1 Rewrite `README.md`** with accurate setup and run steps that you have executed.
- **P14-T2 Final review of `flow.md`** against the code. Fix every statement that is not true.
- **P14-T3 Check `.env.example`** lists every variable and no values.
- **P14-T4 Run the full test suite and a clean `docker compose up` from scratch.**
- **P14-T5 Final summary** in `activity-log.md` and a "Known issues" list in `flow.md`.

## 9. Runtime agent specifications

Each agent definition must contain: role, goal, constraints, input, output, tools, and a "never" list. Keep prompts short, concrete, and testable. Do not use vague language like "be creative".

### 9.1 Manager
- **Role:** plans work and routes defects. Does not write application code.
- **Input:** user prompt, template type (`react` or `node`), constraints (WebContainer rules).
- **Output:** the plan (see P7-T2), validated by Pydantic.
- **Must:** choose only the agents needed. Define the contract when both Frontend and Backend are active. Give every task acceptance criteria that can be checked by a test.
- **Never:** writes code. Counts retries. Decides to continue after the cap. Activates an agent that the prompt does not need.
- **Routing a defect:** read the defect evidence and the file ownership in the contract. Return exactly one of `frontend` or `backend`, plus a one-sentence reason. If the evidence points to a contract problem (conflicting files, mismatched route shapes), say so and the loop treats it as a Manager-owned correction (the Manager revises the contract once, counted as a retry).

### 9.2 Frontend
- **Role:** writes UI code for the generated project (components, styles, client routing) in the stack of the chosen template.
- **Input:** its task, the contract, files it owns, constraints.
- **Output:** list of files (path and full contents) and short notes. Only paths it owns.
- **Must:** follow the contract's route shapes when calling the backend. Keep to WebContainer-safe dependencies. Produce a complete runnable project in combination with the base template.
- **Never:** writes server code. Edits Backend-owned files. Invents routes not in the contract. Leaves TODO placeholders instead of working code.

### 9.3 Backend
- **Role:** writes server code for the generated project (routes, logic, data handling).
- **Input and output:** same structure as Frontend, limited to server-side paths.
- **Must:** implement every route in the contract with the specified shapes. Validate inputs. Handle errors with proper status codes.
- **Never:** writes UI code. Edits Frontend-owned files. Uses native binaries or anything WebContainers cannot run.

### 9.4 QA
- **Role:** verification only.
- **Input:** acceptance criteria, contract, generated files, sandbox results.
- **Output:** test cases and test files, then test results and defects.
- **Must:** cover happy path, negative/edge cases, security/authorization (if relevant), and regression. Report exactly what the sandbox returned.
- **Never:** edits application code. Mocks the logic being tested. Reports a pass for a check that did not run. Hides or shortens failure evidence beyond trimming length.

## 10. Control loop and status model

**Run statuses:** `queued`, `planning`, `generating`, `validating`, `fixing`, `succeeded`, `escalated`, `failed`, `cancelled`.

**Allowed transitions:**
- `queued` to `planning` to `generating` to `validating`.
- `validating` to `succeeded` (all required checks passed).
- `validating` to `fixing` (failures, retries remain) then back to `validating`.
- `validating` or `fixing` to `escalated` (retry cap reached, limit hit, or unrecoverable agent error).
- Any active status to `cancelled` (user request) or `failed` (system error such as database down).
- Terminal: `succeeded`, `escalated`, `failed`, `cancelled`. No transitions out.

**Task statuses:** `pending`, `in_progress`, `implemented`, `validated`, `failed`, `fix_applied`.

**Rules:**
1. The retry cap is 3 per task. The counter is stored, incremented before each fix, and checked by code.
2. QA always runs after any generation or fix.
3. A fix triggers a re-run of the failed checks plus a regression pass.
4. Hitting any per-run limit (calls, tokens, time) ends the run as `escalated` with the reason.
5. Every transition writes an audit entry.

## 11. Interface definitions (proposals, finalize and log in `decisions.md`)

### 11.1 Server endpoints (all authenticated except health)
| Endpoint | Purpose |
| :--- | :--- |
| `GET /health` | Service status. |
| `GET /llm/status` | Which providers are reachable and which models are configured. |
| `POST /runs` | Create a run. Input: prompt, template type, mode. Output: run ID. |
| `GET /runs/{id}` | Current run summary (status, tasks, defects, retries, usage). |
| `GET /runs/{id}/events` | SSE stream of events. |
| `POST /runs/{id}/cancel` | Cancel an active run. |

### 11.2 SSE event types
`run_status`, `plan_ready`, `agent_started`, `agent_finished`, `files_ready` (contains the merged artifact), `qa_started`, `qa_result`, `defect_logged`, `retry_started`, `provider_fallback`, `limit_reached`, `escalated`, `succeeded`, `error`. Each event includes the run ID, a timestamp, and a short human-readable message.

### 11.3 Agent file output format
A list of entries with: path, full file contents, and a purpose line. The server validates that paths are relative, contain no parent-folder traversal, stay within the allowed ownership, and that contents are non-empty. Invalid output is rejected.

### 11.4 Artifact compatibility
The merged result must be accepted by the existing `parseXml()` and produce `CreateFolder`, `CreateFile`, and `RunScript` steps as today. The base template (react or node) is included the same way the legacy path includes it.

## 12. Environment variables (names only; confirm exact names in `decisions.md`)

- **client:** Clerk keys (existing), `API_KEY` for the legacy Gemini path (existing), server base URL, shared secret.
- **server:** shared secret, the SQLite database file path and data directory (on the named volume), Groq key, Gemini key (optional), `OLLAMA_BASE_URL` and its bearer token (optional), model string per agent (deferred values), per-provider requests-per-minute settings (deferred values), per-run limits for calls, tokens, and seconds (deferred values), sandbox settings (Docker proxy address, sandbox image name, per-check timeouts, memory and CPU limits).
- Provide every name in `.env.example` with no values.

## 13. Security rules

1. The server is reachable only from the client service and local development. It is never exposed publicly.
2. Every non-health route needs the shared secret and the forwarded user ID.
3. Generated code is untrusted and runs only in the sandbox with limits and no secrets.
4. Agents get no tools that touch the host filesystem outside a per-run working directory.
5. Paths in agent output are validated (relative, no traversal).
6. Logs and audit entries never contain secrets. Evidence is trimmed.
7. The Ollama tunnel is protected by a token and used for short sessions.
8. Least privilege everywhere: each agent gets only the tools it needs.
9. Only the sandbox runner module may talk to Docker. Agents get no Docker tool. Container options are built from a fixed template in code and never from agent output.
10. Never state that the socket proxy blocks privileged containers or host mounts. It does not inspect create-request bodies. Before public hosting, require rootless Docker (or an evaluated body-inspecting proxy).
11. The SQLite file and the data volume are not exposed outside the server container.

## 14. Testing strategy

- **Server:** unit tests for models, repositories, routing, limits, fallback, merge, path validation. Integration tests against a temporary SQLite file.
- **Real vs stubbed:** stubs are allowed only to test the LLM routing layer. Agent behavior and QA verdicts must use real model calls and real sandbox execution.
- **Client:** existing behavior must still pass manual smoke tests. Add tests for the new route and the types.
- **End to end:** the three scenarios in P9-T7 plus the evaluation set in Phase 13.
- **Evidence:** every test run is logged with the command and the outcome. Failing tests are not hidden or deleted.

## 15. Definition of done

The project is done only when ALL are true:
1. All phases 0 to 14 have met their exit gates (or have a logged, human-approved exception).
2. A full-stack prompt runs end to end: plan, generate, QA in sandbox, preview.
3. A defect recovery and an escalation at exactly 3 retries have each been demonstrated for real.
4. No run in the evaluation exceeded the retry cap.
5. Existing features (auth, landing page, `/generate`, Monaco, WebContainers preview, legacy path) work.
6. `docs/flow.md`, `docs/decisions.md`, `docs/activity-log.md`, and `docs/evaluation.md` are complete and accurate.
7. `docker compose up` works from a clean checkout with `.env.example` as the guide.
8. No secrets in the repository or logs.
9. The sandbox hardening checks (P8-T12) pass, and the Docker access decision and its residual risk are written in `docs/decisions.md`.

## 16. Human checkpoints (stop and ask)

| ID | When | What to ask |
| :--- | :--- | :--- |
| H1 | End of Phase 0 | Approve the plan and the branch. How to handle the QA commit (revert, drop, or branch from `65de19a`). |
| H2 | Before adding any dependency not listed in section 7 | Approve the dependency and the reason. This includes the package mirror or filtering proxy for the sandbox install phase (P8-T4). |
| H3 | Before any public hosting or exposure of the server | Confirm rootless Docker (or an evaluated body-inspecting proxy) is in place. The local-development approach itself is already decided (D-012, D-013). |
| H4 | When Phase 4 needs real values | Human supplies the LiteLLM model strings, Groq and Ollama model names, provider rate limits, and per-run limits (D-016). |
| H5 | (Retired) | Follow-up chat is settled: legacy path (D-014). |
| H6 | Before any deployment | Hosting choice for the server. |
| H7 | Whenever you hit something this plan does not cover or that contradicts the repo | Describe the gap with evidence and propose options. |

**Stop immediately and ask** if: a secret appears in the repo, a task would remove a COOP/COEP header, a test can only pass by weakening a limit or mocking real logic, or you are about to delete data you did not create.

### 16.5 Open questions and deferred items (seed into `decisions.md` as `Q-` entries)

- **Q-1 (deferred, D-016):** LiteLLM model strings for Groq and Ollama.
- **Q-2 (deferred, D-016):** Groq model names, Ollama coder model name, and Gemini model name if used.
- **Q-3 (deferred, D-016):** provider rate limits for throttling settings.
- **Q-4 (deferred, D-016):** per-run limits for LLM calls, tokens, and wall-clock time. The human plans to set them after measuring real runs.
- **Q-5:** SQLite layout: one shared file or two (decide in P3-T2 after reading CrewAI's persistence behavior).
- **Q-6:** how the sandbox install phase reaches packages (mirror or filtering proxy). Needs approval at H2.
- **Q-7:** server hosting location for any deployment (H6).

Answered and no longer open: sandbox approach (D-012, D-013), follow-up chat (D-014), ngrok header (D-015), database (D-005).

## 17. Per-task working checklist (follow for every task)

1. Re-read the task and its acceptance criteria.
2. Read the files you will touch.
3. Write a `decisions.md` entry if you are choosing between options.
4. Make the smallest change that meets the criteria.
5. Run the relevant tests or commands.
6. Append to `activity-log.md` with the evidence.
7. Update `flow.md` if behavior changed.
8. Commit with the task ID in the message.
9. Only then move to the next task.
