# PRD: BlinkBuild Multi-Agent Engine (Manager, Frontend, Backend, QA)

Version: 1.1 | Date: 26 Nov 2026 | Owner: Pranav Sharma | Status: Approved for build
v1.1 changes: shared state moved from Neon Postgres to SQLite; sandbox approach decided (hardened sibling containers); follow-up chat stays on the legacy path; model names, provider limits and per-run limits deferred to the human. `PM.md` v1.1 holds the full detail.
Companion document: `PM.md` (the step-by-step execution plan for AI agents). This PRD says WHAT and WHY. `PM.md` says HOW and IN WHAT ORDER.

---

## 1. Overview

BlinkBuild is an existing AI website generator (similar to Bolt.new). A user types a prompt, the app generates a project with one Gemini call, shows the files in Monaco, and runs a live preview inside the browser with WebContainers.

This project replaces that single LLM call with a **multi-agent engine built on CrewAI**. A Manager agent plans the work, a Frontend agent and a Backend agent write the code, and a QA agent tests it in a sandbox. Failed tests are sent back to the responsible agent, with a hard limit of 3 retries before the run is escalated to the human.

The existing BlinkBuild UI (landing page, auth, `/generate` workspace, File Explorer, Monaco, WebContainers preview) is kept. The agent engine sits behind it.

## 2. Problem

1. A single LLM call has no planning, no verification and no recovery. Output that looks right but does not run is common.
2. Multi-agent systems fail for structural reasons: vague roles, agents losing shared context, and missing verification (the MAST study cited in the project report). Simply adding agents does not fix this.
3. Free LLM tiers have strict request and token limits, and a multi-agent run makes many calls.

## 3. Goals

| ID | Goal |
| :--- | :--- |
| G1 | Generate working Frontend and Backend code through role-scoped agents coordinated by a Manager. |
| G2 | Verify every generated project with real tests (build, lint, type-check, unit, browser smoke) before calling it done. |
| G3 | Recover from failures with a bounded defect loop (max 3 retries per task) that always ends in success or human escalation. |
| G4 | Keep one shared, persistent project state (SQLite) that all agents read and write. |
| G5 | Work within LLM limits using Groq for short/fast tasks, a demo-only Ollama-on-Colab mode for long generation, and Gemini as an optional fallback. |
| G6 | Keep every existing BlinkBuild feature working. |
| G7 | Produce a full audit trail of agent decisions and actions. |

## 4. Non-goals (do NOT build)

- Architect, Database, DevOps, Code Review/Security agents. (Future work.)
- Anything related to GitHub Copilot or `.agent.md` files. That approach is abandoned.
- Production deployment of generated sites (the existing "Download" stays as is).
- A dashboard, role-based access control beyond Clerk sign-in, or billing.
- Fine-tuning or training any model.
- Rewriting BlinkBuild's own UI. Only additive changes are allowed.

## 5. Users

| Persona | Need |
| :--- | :--- |
| **End user** (signed in via Clerk) | Type a prompt, watch agents work, get a tested project, and ask for changes. |
| **Developer/owner** (Pranav) | Switch LLM modes, see why an agent did something, see failures and escalations. |
| **Evaluators** (project review) | See measurable results and a clear architecture. |

## 6. Baseline: what already exists (facts, not to be rebuilt)

Source: `PROJECT_HISTORY_AND_QA_COMMIT.md`, Part 1. State at commit `65de19a`.

- Next.js `^16.1.6` (App Router, Turbopack, `output: "standalone"`), React `^19.2.4`, TypeScript `^5`, Tailwind CSS `^4`, shadcn/ui, Radix, Lucide.
- Clerk auth (`@clerk/nextjs ^7.4.2`). `proxy.ts` protects all routes except `/sign-in` and `/sign-up`.
- Landing page (`app/page.tsx`) with a native `<textarea>` prompt form and the server action `generateWebsite` (`app/actions.ts`) which redirects to `/generate?prompt=...`.
- `POST /api/template` classifies the prompt as `react` or `node` and returns starter prompts.
- `POST /api/chat` makes one Gemini 2.5 Flash call and returns XML containing `<boltArtifact>` blocks.
- `app/lib/steps.ts` `parseXml()` converts `<boltArtifact>` into steps (`CreateFolder`, `CreateFile`, `RunScript`).
- `/generate` workspace: progress steps, follow-up chat, file tree, read-only Monaco editor, WebContainer boot (`hooks/useWebcontainers.ts`), `PreviewFrame` running `npm install` then `npm run dev`.
- COOP/COEP headers in `next.config.ts` and `vercel.json` (required by WebContainers). Docker 3-stage build and Compose.

**Known defects to fix during cleanup:**
1. In `/api/template`, the `node` branch builds `prompts` with `reactBasePrompt` while `uiPrompts` uses `nodeBasePrompt`.
2. `axios` is installed but unused.
3. `/api/gemini` is unused and must be deleted.

## 7. Scope: what the new system adds

### 7.1 Runtime agents (these are CrewAI agents that run inside the product)

| Agent | Purpose | Never does |
| :--- | :--- | :--- |
| **Manager** | Reads the prompt, decides which agents to activate, defines the API contract between Frontend and Backend, routes QA defects to the right agent. | Writes application code. Counts retries (code does that). |
| **Frontend** | Writes UI code (components, styles, client routing) for the generated project. | Writes server code. Edits files owned by Backend. |
| **Backend** | Writes server code (APIs, logic, data handling) for the generated project. | Writes UI code. Edits files owned by Frontend. |
| **QA** | Writes tests from acceptance criteria, runs them in a sandbox, logs defects. | Edits application code. Mocks real business logic. |

### 7.2 Services

- `client/` (Next.js, existing app moved here) and `server/` (Python, FastAPI + CrewAI), in one monorepo.
- SQLite (a file on a Docker volume) for shared project state.
- Hardened Docker sandbox containers for running generated code during QA.

## 8. Functional requirements

IDs are stable. The Builder Agent must reference them in `docs/activity-log.md`.

### 8.1 Run intake
- **FR-01** The user submits a prompt from the existing landing page. The flow to `/generate` is unchanged.
- **FR-02** `/generate` can start a run in one of three LLM modes: `auto`, `fast`, `local`.
- **FR-03** The client calls a Next.js API route which forwards to the Python server. The browser never calls the Python server directly.
- **FR-04** Every run has a unique run ID, the Clerk user ID, the prompt, the mode, a status, and timestamps.

### 8.2 Manager
- **FR-05** The Manager produces a structured plan: which agents to activate, the task list, acceptance criteria per task, and (for full-stack prompts) the API contract.
- **FR-06** Selective activation: a UI-only prompt activates Frontend (then QA). A backend-only prompt activates Backend (then QA). A full-stack prompt activates both, then QA. QA is always activated.
- **FR-07** The API contract lists routes, methods, request and response shapes, and file ownership per path. Frontend and Backend must both follow it.
- **FR-08** On a QA failure, the Manager decides which agent owns the defect. Its answer is validated against an allowed list (`frontend`, `backend`). An invalid answer is rejected and re-asked once, then escalated.

### 8.3 Frontend and Backend agents
- **FR-09** Each agent receives only the context it needs: the task, the contract, and the files it owns.
- **FR-10** Each agent returns file contents in the structured format defined in `PM.md` section 11. The server merges them into one `<boltArtifact>` compatible with the existing `parseXml()`.
- **FR-11** If two agents write the same path, the merge is rejected and logged as a defect against the Manager's contract.
- **FR-12** Generated projects must work inside WebContainers (no native binaries, no Python, no git). This constraint comes from the existing system prompt and must be given to both agents.

### 8.4 QA agent and sandbox
- **FR-13** QA derives test cases from the acceptance criteria in the plan. Categories: happy path, negative/edge, security/authorization (when the prompt involves auth), regression.
- **FR-14** The server runs checks in isolated, hardened sibling Docker containers (not Docker-in-Docker): install, build, lint, type-check, unit tests, and a browser smoke test. Files are copied in and out without host bind mounts, and each check runs as its own short-lived container.
- **FR-15** QA records results and defects in shared state. A defect has an ID, the failing check, the evidence (command output, trimmed), the suspected owner, and a status.
- **FR-16** QA never edits application code and never mocks the business logic it is testing.
- **FR-17** The sandbox has CPU, memory, process-count, and time limits, runs as a non-root user with dropped capabilities, and has no access to the host, the server, the Docker socket, or secrets. Network access exists only during the install phase and only to an allow-listed package source. Build, test and browser phases have no network. Container settings are fixed in server code and never come from agent output.
- **FR-17a** Only the sandbox runner module may talk to Docker. Agents get no Docker access.
- **FR-17b** For local development a Docker socket proxy may be used, with the residual risk documented: the proxy limits API endpoints but does not inspect container-create contents. Before any public hosting, a rootless Docker daemon (or an evaluated proxy that inspects create-request bodies) is required.

### 8.5 Defect loop
- **FR-18** Retry counting and the cap of 3 per task are enforced by deterministic code, not by an LLM.
- **FR-19** The loop is: QA fails, Manager routes, owner fixes, QA re-runs only what failed plus a regression pass. Success ends the run as `succeeded`.
- **FR-20** After 3 failed retries on a task the run stops with status `escalated`. The user sees an escalation report (what failed, what was tried, the evidence).
- **FR-21** There is no code path that retries without incrementing the counter.

### 8.6 Shared project state
- **FR-22** Pydantic models define runs, plans, tasks, contracts, files, test results, defects, agent status, retry counters, LLM usage, and audit entries.
- **FR-23** These are persisted in SQLite, in a database file on a Docker named volume so data survives container restarts. Every agent reads from and writes to this single source of truth.
- **FR-24** Flow state is persisted so an interrupted run can resume.
- **FR-25** Writes are validated by the Pydantic models. Invalid writes are rejected, not stored.

### 8.7 LLM routing
- **FR-26** Every agent's model comes from configuration (environment variables), not code. The actual model names and model strings are supplied by the human later and are not part of this release's code.
- **FR-27** `fast` mode uses Groq. `local` mode uses Ollama through a tunnel (Colab, demo only). `auto` lets the Manager's plan choose per task: short tasks to Groq, large multi-file generation to Local if healthy.
- **FR-28** If the chosen provider is unreachable or rate-limited, the server falls back along a configured chain (Groq, then Gemini if a key exists) and tells the UI.
- **FR-29** Per-run limits exist for LLM calls, tokens, and wall-clock time. Reaching a limit stops the run as `escalated` with the reason.
- **FR-30** Requests per minute are throttled per provider so provider limits are not exceeded.

### 8.8 Client experience
- **FR-31** `/generate` shows live agent activity (who is working, on what, current state) through Server-Sent Events.
- **FR-32** The existing steps list, file tree, Monaco, and Preview continue to work with agent output.
- **FR-33** The user sees test results, defects, retry counts, and the escalation report when relevant.
- **FR-34** The existing single-call generation remains available as a "legacy/fast baseline" path for comparison and as a fallback.
- **FR-35** Follow-up chat messages continue to work and stay on the legacy single-call path in this release. The UI makes clear which path a message uses.

### 8.9 Documentation and audit
- **FR-36** The Builder Agent creates and maintains `docs/flow.md`, `docs/decisions.md`, and `docs/activity-log.md` as defined in `PM.md` section 4.
- **FR-37** The runtime system writes an audit entry for each routing decision, activation, retry, escalation, and LLM fallback.

## 9. Non-functional requirements

| ID | Requirement |
| :--- | :--- |
| NFR-01 | Security: the Python server is never public. Requests need a shared secret plus the Clerk user ID forwarded by Next.js. |
| NFR-02 | Secrets only in environment files and never committed. `client/.env.local` and `server/.env` hold only what each side needs. |
| NFR-03 | Generated code is untrusted. It runs only in the sandbox. |
| NFR-04 | Reliability: SQLite handles one writer at a time. Write transactions are short, contention waits instead of failing, and data persists across restarts through a Docker volume. |
| NFR-05 | Performance: a multi-agent run is allowed to take minutes. The UI must show progress throughout. A run must never hang silently. |
| NFR-06 | Observability: each run is traceable from prompt to result through audit entries and the three docs. |
| NFR-07 | Compatibility: no regression in existing routes, auth, WebContainers headers, or Docker build (updated for the new layout). |
| NFR-08 | Typed boundary: the server's OpenAPI schema is the source for TypeScript types used by the client. |
| NFR-09 | Pinned dependencies. No new package without a recorded reason in `decisions.md`. |

## 10. Key user flows

**Flow A: successful run**
1. User enters a prompt and is redirected to `/generate`.
2. The client creates a run (mode `auto`).
3. Manager plans. The UI shows the plan and the active agents.
4. Agents generate files. The file tree fills in.
5. QA runs checks in the sandbox. All pass.
6. Run is `succeeded`. Preview works. "Your site is ready!" appears.

**Flow B: defect recovered**
1. QA fails a check. A defect is logged.
2. Manager routes it to the owning agent. Retry counter goes 0 to 1.
3. The agent fixes the files. QA re-runs the failed check and a regression pass. All pass.
4. Run succeeds. The UI shows "1 defect fixed".

**Flow C: escalation**
1. The same task fails 3 times.
2. The run stops as `escalated`. The UI shows an escalation report. The user can edit the prompt and start a new run.

**Flow D: provider failure**
1. Local (Colab) is unreachable. The server falls back to Groq. The UI shows "Local unavailable, using Groq".

## 11. Success metrics and evaluation

Measured on a fixed set of at least 10 prompts (mix of UI-only, backend-only, full-stack, auth-related), run with the agent engine and with the legacy single-call path.

| Metric | Definition |
| :--- | :--- |
| Task success rate | Share of runs where the generated project builds, passes QA, and previews correctly. |
| Defect recovery rate | Share of failed first attempts fixed within the retry cap. |
| Retry compliance | Number of runs that exceeded the cap. Must be 0. |
| Escalation rate | Escalations per run, with reasons. |
| Time to result | Wall-clock from prompt to final status. |
| LLM cost/usage | Calls and tokens per run, by provider. |
| Routing accuracy | Share of defects routed to the correct agent (checked manually on seeded defects). |

No numeric targets are fixed until the baseline is measured. Do not invent target numbers.

## 12. Risks

| Risk | Mitigation |
| :--- | :--- |
| LLM free-tier rate limits | Throttling, fallback chain, per-run limits, optional paid Gemini. |
| Small local models produce invalid structured output | Strict output validation, one re-ask, then fallback; Local is demo-only. |
| Colab disconnects or is terminated | Local mode is optional. Auto fallback. Run state persisted. |
| Public tunnel exposure | Bearer token in front of Ollama, short sessions, no secrets in prompts. |
| Agents contradict each other | Manager-defined contract, file ownership, merge conflict detection. |
| Generated code harms the host | Sandbox isolation, limits, no secrets. |
| SQLite allows one writer at a time | Short transactions, wait-on-contention setting, no transaction held during LLM or sandbox calls. Fine at this project's scale. |
| Docker access from the Python container is a security risk | Only the sandbox runner talks to Docker, container settings are fixed in code, the socket proxy is used for local development only with its limits documented, and rootless Docker is required before public hosting. |
| QA passes in a full Node container but the preview runs in WebContainers, a different runtime | Documented as a known limitation. Mismatches found during evaluation are recorded. |
| Hosting: Vercel cannot run the Python service | Client on Vercel, server on a Docker-capable host (open question). |

## 13. Decisions made and items still open

**Settled (26 Nov 2026):**
- Shared state is SQLite (replacing Neon Postgres).
- Sandbox: hardened sibling containers. Socket proxy allowed for local development with documented residual risk. Rootless Docker required before public hosting.
- Follow-up chat stays on the legacy single-call path.
- The ngrok header that skips the browser warning page is `ngrok-skip-browser-warning`.

**Deferred to the human (the Builder Agent must not choose or invent these):**
1. LiteLLM model strings, and the Groq, Ollama and Gemini model names.
2. Provider rate limits used for throttling.
3. Per-run limits for LLM calls, tokens, and wall-clock time. The human plans to set these after measuring real runs.

**Still open:**
4. Whether CrewAI's flow persistence and our shared state use one SQLite file or two (decided during the build after reading CrewAI's behavior).
5. How the sandbox install phase reaches packages (a mirror or filtering proxy). Needs human approval because it is a new dependency.
6. Where the server will be hosted for any deployment. Local Docker Compose only for now.

## 14. Glossary

- **Builder Agent**: the AI coding assistant that executes `PM.md` to build this project.
- **Runtime agents**: the CrewAI Manager, Frontend, Backend, QA agents that run inside the product.
- **Shared project state**: the Pydantic models persisted in SQLite.
- **Run**: one end-to-end execution from a prompt to a final status.
- **Defect**: a recorded failed check with evidence and an owner.
- **Escalation**: stopping autonomous work and handing the decision to a human.
- **Contract**: the Manager's definition of the routes, data shapes, and file ownership shared by Frontend and Backend.
