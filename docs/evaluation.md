# BlinkBuild Evaluation Report

Date: 2026-11-26 | Task: `P13-T1`–`P13-T4`

## 1. Evaluation Setup

- **Prompt Set:** `docs/evaluation-prompts.json` (`10` prompts: `3` UI-only, `3` backend-only, `4` full-stack, including `3` involving authentication/login).
- **Paths Compared:**
  1. Multi-agent engine (`POST /runs`, CrewAI Manager/Frontend/Backend/QA + sibling Docker sandbox).
  2. Legacy single-call baseline (`POST /api/chat` with Gemini 2.5 Flash).

## 2. Current Measurement Status & Blockers

Live end-to-end runs across the 10-prompt set are **not measured** in this commit due to three environment/checkpoint blockers (recorded honestly per `PM.md` Section 3.4 & 13):

1. **Checkpoint H4 (`D-016`):** LiteLLM model strings (`LLM_MODEL_*`), provider API keys (`GROQ_API_KEY`, `GEMINI_API_KEY`, `OLLAMA_BASE_URL`), and throttling/per-run limits have not yet been supplied by the human.
2. **Legacy Baseline Key:** `API_KEY` and Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) are not present in `.env.local`.
3. **Docker Desktop:** The Docker daemon is not running on the build host, so live sibling-container sandbox execution (`install`, `build`, `lint`, `typecheck`, `unit_tests`, `browser_smoke`) and `install` mirror/proxy (`H2`) are blocked.

## 3. Metrics Table (`PRD.md` Section 11)

| Metric | Multi-Agent Engine | Legacy Single-Call | Notes |
| :--- | :--- | :--- | :--- |
| **Task success rate** | not measured | not measured | Blocked on H4 keys/models & Docker daemon |
| **Defect recovery rate** | not measured | N/A | Deterministic 1-retry recovery verified in `test_flow_defect_recovery_fixes_on_retry_1` (mocked sandbox) |
| **Retry compliance** | 0 violations (in unit/flow tests) | N/A | Hard cap of `3` enforced in `StateRepository.increment_retry()` & `BlinkBuildOrchestrator` (`test_flow_unfixable_escalates_at_exactly_3_retries`); live runs not measured |
| **Escalation rate** | not measured | N/A | Escalation at 3 retries & low `RUN_MAX_LLM_CALLS` verified in tests |
| **Time to result** | not measured | not measured | Blocked on H4 keys/models & Docker daemon |
| **LLM cost/usage** | not measured | not measured | `LlmUsage`, `providers_used`, `total_tokens`, `duration_ms` tracking implemented & tested |
| **Routing accuracy** | not measured | N/A | Blocked on live LLM calls (H4) |

## 4. Next Steps to Run Live Evaluation

Once you supply `.env` / `client/.env.local` values (Checkpoint H4) and start Docker Desktop:
1. Build the sandbox image: `docker build -f server/sandbox.Dockerfile -t blinkbuild-sandbox:latest server/`
2. Start the stack: `docker compose up -d --build`
3. Run each prompt in `docs/evaluation-prompts.json` through both `Mode: Auto (CrewAI)` and `Mode: Legacy Single-Call`, and update Section 3 with the observed numbers and failure analysis.
