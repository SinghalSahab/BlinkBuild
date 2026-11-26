# BlinkBuild: Project Architecture Before the Last Commit & What the Last Commit Does

This document provides a comprehensive, detailed breakdown of **BlinkBuild** as it existed immediately before the latest commit (`f4318df` on branch `qa`), followed by an in-depth explanation of everything introduced in that latest commit.

---

## Part 1: What the Project Was and How It Worked Before the Last Commit

Before commit `f4318df`, the repository state stood at commit `65de19a` (`main` / `origin/main` — `"clerk authentication done"`). Across 18 commits starting from `befdb79` (`"Initial commit from Create Next App"`), the project was built into **BlinkBuild**: an AI-powered, browser-based website generator inspired by Bolt.new.

BlinkBuild allowed a user to enter a natural-language prompt, automatically classify the target stack (React vs. Node.js), generate a full project codebase via **Google Gemini 2.5 Flash**, inspect the generated files in an integrated **Monaco Editor** and **File Explorer**, run and live-preview the generated application directly inside the browser using **WebContainers**, and iteratively refine the generated app through follow-up chat messages.

### 1.1 Evolution Leading Up to `65de19a`

The git history before `f4318df` shows the incremental construction of BlinkBuild:

1. `befdb79` — Initial Next.js App Router scaffold.
2. `edfcc7a` — File Explorer UI component.
3. `f5f6f84` — In-browser WebContainer integration.
4. `a51ecc8` → `40f05f8` → `3ba37bb` → `2c2e8cd` → `3aff66b` → `a452b2f` — Next.js version/ESLint fixes, step ID deduplication (`nextId` counter), and iterative stabilization.
5. `572fd65` — Multi-turn follow-up chat fix ("send new message in same chat").
6. `318e7b7` — Landing page UI (`app/page.tsx`).
7. `1beb3ea` & `7d71559` — `/generate` workspace UI and visual refinements.
8. `989fe50` & `4bbc451` — Multi-stage Dockerization (`DockerFile` + `docker-compose.yml`).
9. `b31d8a4` — Comprehensive `README.md`.
10. `fed844b` & `65de19a` — Clerk authentication integration (`@clerk/nextjs`, `proxy.ts`, `/sign-in`, `/sign-up`).

---

### 1.2 Tech Stack (at `65de19a`)

| Layer | Technology | Version / Details |
| :--- | :--- | :--- |
| **Framework** | Next.js (App Router + Turbopack) | `^16.1.6` (`output: "standalone"`) |
| **UI Library** | React & React DOM | `^19.2.4` |
| **Language** | TypeScript | `^5` |
| **Styling** | Tailwind CSS + `tw-animate-css` | `^4` |
| **UI Primitives** | shadcn/ui + Radix UI + Lucide Icons | `lucide-react ^0.525.0`, Radix `label`, `progress`, `scroll-area`, `slot`, `tabs` |
| **Authentication** | Clerk | `@clerk/nextjs ^7.4.2`, `@clerk/ui ^1.15.0` |
| **AI Generation** | Google Generative AI SDK | `@google/generative-ai ^0.24.1` (`gemini-2.5-flash`) |
| **In-Browser Runtime** | StackBlitz WebContainers API | `@webcontainer/api ^1.6.1` |
| **Code Editor** | Monaco Editor (React wrapper) | `@monaco-editor/react ^4.7.0` |
| **HTTP Client** | Axios (in dependencies; UI uses `fetch`) | `^1.13.6` |
| **Containerization** | Docker & Docker Compose | `node:20-alpine` 3-stage build |

---

### 1.3 Authentication & Request Protection

Authentication was added in the commit immediately preceding `f4318df` (`65de19a`):

- **Root Provider (`app/layout.tsx`)**: Wraps the entire application in `<ClerkProvider appearance={{ theme: shadcn }}>` alongside `Geist` and `Geist_Mono` Google Fonts.
- **Route Protection (`proxy.ts`)**: Uses `clerkMiddleware` and `createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])`. Any request not matching `/sign-in` or `/sign-up` is protected via `await auth.protect()`.
- **Auth Pages**:
  - `app/sign-in/[[...sign-in]]/page.tsx` renders Clerk's `<SignIn />` centered on screen.
  - `app/sign-up/[[...sign-up]]/page.tsx` renders Clerk's `<SignUp />` centered on screen.
- **Header Auth Controls (`app/page.tsx`)**: Uses Clerk's `<Show when="signed-out">` (rendering modal `<SignInButton>` and `<SignUpButton>`) and `<Show when="signed-in">` (rendering `<UserButton />`).

---

### 1.4 Landing Page & Prompt Submission (`app/page.tsx` & `app/actions.ts`)

- **Visual Design**: Dark-mode glassmorphism theme (`#050508` background) using the `Manrope` font, three animated floating gradient orbs (`.orb-1`, `.orb-2`, `.orb-3`), a subtle 64px indigo grid overlay (`.grid-bg`), and a sticky blurred navigation bar (`.nav-glass`).
- **Prompt Form**: A gradient-bordered card containing a native `<form action={generateWebsite}>` and a plain `<textarea id="prompt" name="prompt" required />` (explicitly kept as a native `<textarea>` to avoid component wrapper focus/pointer issues).
- **Server Action (`app/actions.ts`)**: `generateWebsite(formData)` extracts `prompt` from the submitted `FormData`, serializes it into `URLSearchParams`, and calls `redirect('/generate?prompt=...')`.
- **Marketing & Navigation Sections**: Includes `#features` (3 glass cards: *AI-Powered*, *Lightning Fast*, *Production Ready*), `#how-it-works` (3 steps: *Describe*, *Generate*, *Deploy*), a bottom CTA banner with smooth scroll-to-top, and a 4-column `#contact` footer.

---

### 1.5 AI Prompting, Templates, and API Routes

BlinkBuild's AI pipeline is powered by `process.env.API_KEY` and `gemini-2.5-flash` across three API routes and a set of shared prompt utilities:

#### A. Template Classification (`POST /api/template` — `app/api/template/route.ts`)
1. Receives `{ prompt }` in the request body.
2. Calls `gemini-2.5-flash` (configured with `systemInstruction: BASE_PROMPT`) asking it to return a single word: either `"react"` or `"node"`.
3. Depending on the answer:
   - **`"react"`**: Returns `prompts` (`[BASE_PROMPT, <project files context with reactBasePrompt>]`) and `uiPrompts: [reactBasePrompt]`.
   - **`"node"`**: Returns `prompts` (project files context) and `uiPrompts: [nodeBasePrompt]`. *(Note: in `route.ts` line 58, the `"node"` branch's `prompts` array still interpolated `reactBasePrompt` while `uiPrompts` returned `nodeBasePrompt`.)*
   - Any other response returns HTTP `403`.

#### B. Starter Scaffolds (`app/lib/defaults/`)
- **`react.ts`**: Contains `basePrompt` wrapped in `<boltArtifact id="project-import" title="Project Files">` defining a complete Vite + React 18 (`^18.3.1`) + TypeScript (`^5.5.3`) + Tailwind CSS 3 (`^3.4.1`) + `lucide-react` (`^0.344.0`) starter (`index.html`, `package.json`, `vite.config.ts`, `tsconfig*.json`, `tailwind.config.js`, `postcss.config.js`, `eslint.config.js`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`).
- **`node.ts`**: Contains `basePrompt` with a minimal `index.js` and `package.json` (`node-starter`).

#### C. Multi-Turn Code Generation (`POST /api/chat` — `app/api/chat/route.ts`)
1. Initializes `gemini-2.5-flash` with `systemInstruction: getSystemPrompt()`.
2. Accepts `{ messages }` (array of `{ role, content }`), converts them into Gemini's `{ role, parts: [{ text }] }` format, and invokes `model.generateContent({ contents })`.
3. Returns `{ response: output }`, where `output` contains `<boltArtifact>` XML blocks.

#### D. Streaming Endpoint (`POST /api/gemini` — `app/api/gemini/route.ts`)
- Configured with `export const runtime = "edge"`.
- Accepts `{ prompt }`, calls `model.generateContentStream`, buffers incoming text chunks, and streams complete lines back as `text/plain; charset=utf-8`. *(Note: `/generate` uses `/api/template` and `/api/chat` rather than `/api/gemini`.)*

#### E. System Prompt & XML Parser (`app/lib/prompt.ts`, `app/lib/steps.ts`, `app/lib/constants.ts`)
- **`constants.ts`**: Defines `WORK_DIR = '/home/project'`, `MODIFICATIONS_TAG_NAME = 'bolt_file_modifications'`, and `allowedHTMLElements`.
- **`prompt.ts`**:
  - `BASE_PROMPT`: Instructs Gemini to produce beautiful, production-worthy designs using JSX, Tailwind CSS, React hooks, `lucide-react` icons, and valid Unsplash URLs.
  - `getSystemPrompt()`: Detailed system instructions constraining the AI to **WebContainer** rules (in-browser Node.js, no native binaries, no `pip`, no `g++`, no `git`, prefer Vite and Node.js scripts over shell scripts) and requiring a single `<boltArtifact>` with `<boltAction type="file" filePath="...">` and `<boltAction type="shell">` tags.
- **`steps.ts`**:
  - `parseXml(response)`: Extracts `<boltArtifact>` content, creates an initial `StepType.CreateFolder` step for the artifact title, and iterates over every `<boltAction>` to emit `StepType.CreateFile` (with `path` and trimmed `code`) or `StepType.RunScript` steps.

---

### 1.6 The Generation Workspace (`/generate`)

`app/generate/page.tsx` wraps `GenerationContent` (`app/generate/generation-content.tsx`) in a `<Suspense>` boundary.

#### End-to-End Execution Flow
1. **Initial Generation (`backendPrompt`)**:
   - Reads `?prompt=...` from `useSearchParams()`.
   - Calls `POST /api/template` with `{ prompt }`.
   - Parses `data.uiPrompts[0]` via `parseXml()`, assigns unique monotonic IDs (`nextId()`), sets `steps` and `templateDone = true`, and enqueues them into `revealQueueRef` (which reveals steps one-by-one every `350ms` for smooth UI feedback).
   - Builds `messages` combining `data.prompts`, `data.uiPrompts`, and the user's `prompt`, then calls `POST /api/chat`.
   - Parses the returned `chatResponse` via `parseXml()`, appends those steps, saves the full conversation to `llmMessages` (for follow-up edits), sets `chatDone = true`, `loading = false`, and after `800ms` displays a `"Your site is ready!"` modal overlay.
2. **File Tree Construction**:
   - A `useEffect` watches `steps` for `"pending"` items. For each `StepType.CreateFile`, it walks the slash-delimited `step.path` and builds/updates a nested `FileItem[]` tree (`files` state), then marks all `steps` and `visibleSteps` as `"completed"`.
3. **WebContainer Mounting (`hooks/useWebcontainers.ts`)**:
   - `useWebContainer()` boots a singleton `WebContainer` instance (`WebContainer.boot()`) guarded by `webcontainerInstance` and `isBooting`.
   - Whenever `files` or `webcontainer` updates, `GenerationContent` transforms `FileItem[]` into WebContainer's nested `{ directory: ... }` / `{ file: { contents } }` structure and calls `webcontainer.mount(mountStructure)`.
4. **Workspace UI Layout**:
   - **Header**: Back link to `/`, dynamic status text (`"Analyzing your prompt..."` → `"Building your website..."` → `"Your website is ready!"`), `Download` button, and `Share` button (re-opens the Ready overlay).
     - *Download (`downloadFilesAsZip`)*: Flattens all `FileItem`s into a single plain-text bundle (`blinkbuild-project.txt`) with `FILE: <path>` headers and triggers a browser download without needing `JSZip`.
   - **Left Panel (280px)**:
     - Phase pills (`Template`, `AI Generation`).
     - Progress bar (capped at 85% until `chatDone` is true, then 100%).
     - Scrollable animated list of revealed steps (`CheckCircle`, `Clock`, `Circle`).
     - Follow-up chat `<textarea>` (`"Ask for changes..."`) + `Send →` button, which appends the new user message to `llmMessages`, calls `POST /api/chat`, parses new `<boltArtifact>` steps, and updates the file tree and WebContainer.
   - **Right Panel (`Code` / `Preview` Tabs)**:
     - **Code Tab**: Split view with `FileExplorer` (`components/FileExplorer.tsx`, collapsible folder tree) on the left and `CodeEditor` (`components/CodeEditor.tsx`, read-only Monaco Editor with `vs-dark` theme) on the right.
     - **Preview Tab**: Displays a dark loading state while `loading || !webcontainer`, then renders `PreviewFrame` (`components/PreviewFrame.tsx`), which spawns `npm install` followed by `npm run dev` inside the WebContainer, listens for the `server-ready` event (or localhost URL in stdout), and mounts the live app inside an `<iframe>`.

---

### 1.7 Deployment & Security Configuration

Because WebContainers rely on `SharedArrayBuffer`, cross-origin isolation headers are configured in both Next.js and Vercel:

- **`next.config.ts`**: Sets `output: "standalone"` and applies `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` on `/(.*)`.
- **`vercel.json`**: Mirrors the same COOP/COEP headers for Vercel deployments.
- **`DockerFile` & `docker-compose.yml`**:
  - 3-stage `node:20-alpine` build (`deps` → `builder` → `runner` running as non-root `nextjs:nodejs` on port `3000` with `CMD ["node", "server.js"]`).
  - Compose service `nextjs_prod` passes `API_KEY`, caps resources at `1G` memory and `1.0` CPU, and configures `json-file` log rotation.

---

## Part 2: What the Last Commit (`f4318df`) Does

**Commit:** `f4318df` (`HEAD -> qa`, `origin/qa`)  
**Author:** Pranav Sharma (`pranavsharma2595@gmail.com`)  
**Date:** Fri Nov 13 23:12:47 2026 +0530  
**Message:** `feat(agents): add QA Agent, Copilot definitions, Shared Project State, and defect loop`

### High-Level Summary

Commit `f4318df` is **100% additive** (19 new files, 1,190 insertions, 0 modifications or deletions to any existing BlinkBuild file). It introduces a **Multi-Agent Software Engineering & QA Verification System** modeled on an *AI Software Engineering Manager Architecture Proposal* (MAST Taxonomy Layers 01–05, SRS requirements `FR-5`, `FR-7`, `FR-8`, `FR-9`, `FR-10`, `FR-11`, `NFR-3`, `NFR-4`).

It does **not** yet alter BlinkBuild's existing website-generation UI (`/`, `/generate`, `/api/template`, `/api/chat`). Instead, it lays down an autonomous multi-agent orchestration framework, persistent shared state, Copilot agent definitions, a Next.js API endpoint, and a CLI simulation script.

---

### Detailed Breakdown of All 19 Added Files

#### 1. GitHub Copilot Custom Agent Definitions (`.github/agents/*.agent.md`)
Defines 5 specialized agents (all configured with `model: gpt-4o`) for the GitHub Copilot agent framework:

- **`.github/agents/manager.agent.md` (*AI Software Engineering Manager* — Layer 02)**:
  - Central routing and orchestration layer; explicitly forbidden from writing production code itself.
  - Defines the **7-Step Control Loop**: `Understand` → `Analyze` → `Identify` → `Select` (dynamic activation) → `Execute` → `Observe` → `Validate` (always via `@qa-agent`).
  - Defines the **Defect Loop & Bounded Retries**: routes QA failures back to the responsible specialist up to `3` retries; if `retry_counter >= 3`, halts autonomous execution, logs to `.project-state/audit.log`, and escalates to a human developer.
- **`.github/agents/architect.agent.md` (*Architect Agent* — Layer 03)**:
  - Produces ADRs, API contracts, data schemas, module boundaries, and security policies in `.project-state/requirements.json`; escalates unresolved technical trade-offs to humans (`FR-10`).
- **`.github/agents/backend.agent.md` (*Backend Agent* — Layer 03)**:
  - Implements server-side APIs/logic from `.project-state/tasks.json`, coordinates with `@database-agent`, and fixes defects (`DEF-XXX`) by reading `.project-state/defects.json`, running reproduction commands, patching code, and marking tasks `fix_applied`.
- **`.github/agents/frontend.agent.md` (*Frontend Agent* — Layer 03)**:
  - Implements UI components, styling, and client routing from `tasks.json`, and resolves UI defects logged by `@qa-agent`.
- **`.github/agents/qa.agent.md` (*QA Agent* — Layer 03)**:
  - Strictly responsible for verification, validation, edge-case testing, and defect detection (never mutates application code).
  - Synthesizes tests covering Happy Path, Negative/Edge Cases, Security/Authorization, and Regression; updates `.project-state/test-results.json` and `.project-state/defects.json`; and enforces **never mocking real business logic**.

#### 2. Persistent Shared Project State (`.project-state/`)
A file-backed JSON + log directory serving as the single source of truth for inter-agent communication:

- **`.project-state/requirements.json`**: Seeded with `REQ-001` (*"Employee Authentication & Role-Based Access Control"*) containing 4 acceptance criteria (`AC-1` through `AC-4`) and activated capabilities `["backend", "database", "qa"]`.
- **`.project-state/tasks.json`**: Seeded with `TASK-DB-01` (`completed`), `TASK-BE-01` (`implementation_complete`), and `TASK-QA-01` (`in_progress`).
- **`.project-state/agent-status.json`**: Tracks manager state/step, per-role states (`architect`, `frontend`, `backend`, `database`, `qa`, `devops`), `retry_counters`, `max_retries_per_task: 3`, and `escalated: false`.
- **`.project-state/test-results.json`**: Initialized in `pending` state with zeroed summary counts.
- **`.project-state/defects.json`**: Initialized with `{ "defects": [] }`.
- **`.project-state/audit.log`**: Seeded with 7 chronological routing/activation/completion log entries for `REQ-001`.

#### 3. TypeScript Multi-Agent Runtime (`lib/agents/`)
Implements the orchestration, QA validation, and state management engine in TypeScript:

- **`lib/agents/types.ts`**: Defines `AgentRole`, `TaskStatus`, `DefectStatus`, `Requirement`, `Task`, `TestCase`, `TestSuite`, `TestRunResult`, `Defect`, and `AgentStatusTracker`.
- **`lib/agents/state/SharedProjectState.ts`**: File-system state manager for `.project-state/`. Provides CRUD and state transitions for requirements, tasks, agent role states, retry counters (`getRetryCount`, `incrementRetry`, `canRetry`), human escalation (`setEscalated`), test results (`recordTestResults`), defects (`logDefect`, `resolveDefect`), and timestamped `appendAuditLog`.
- **`lib/agents/qa/QAAgent.ts`**:
  - `validateTask(req)`: Reads the task and requirement from `SharedProjectState`, synthesizes `TestCase`s for each acceptance criterion, supports an optional `seededFailureTrigger` to simulate test failures for gate verification, records `TestRunResult` in `test-results.json`, and either marks the task `validated` (resolving any targeted defect) or marks it `failed` and logs structured `Defect`s in `defects.json`.
  - `runRegressionForDefect(defectId, fixResolutionSucceeds)`: Re-runs `validateTask` in `regression` mode for a specific defect.
- **`lib/agents/specialists/BackendAgent.ts`**:
  - `implementTask(taskId)` and `fixDefect(defect)`: Simulates specialist execution by transitioning task status (`in_progress` → `implementation_complete`, or `fix_applied`), updating agent state (`active` → `waiting_validation`), and appending audit logs.
- **`lib/agents/manager/ManagerAgent.ts`**:
  - `orchestrateRequirement(req, options)`: Executes the full 7-step control loop (`Understand` → `Analyze` → `Identify` → `Select` → `Execute` → `Observe` → `Validate`) and the bounded defect loop:
    - Creates a backend task and invokes `BackendAgent.implementTask()`.
    - Hands off to `QAAgent.validateTask()`.
    - While validation fails: checks `state.canRetry(taskId)` (max 3). If exhausted, triggers `state.setEscalated()` and returns `ESCALATED_TO_HUMAN`. Otherwise increments retry count, calls `BackendAgent.fixDefect()`, and runs `QAAgent.runRegressionForDefect()`.
    - On pass, returns `SUCCESS_PR_READY` with completed tasks, retry history, resolved defects, and an audit trail.
- **`lib/agents/index.ts`**: Barrel file re-exporting all agent modules and types.

#### 4. Multi-Agent Orchestration API (`app/api/agents/qa/route.ts`)
Exposes the TypeScript agent runtime over HTTP:

- **`GET /api/agents/qa`**: Returns a live JSON snapshot of `requirements`, `tasks`, `agentStatus`, `testResults`, and `defects` from `SharedProjectState`.
- **`POST /api/agents/qa`**: Accepts `{ mode, requirementId, title, description, acceptanceCriteria }` and runs `ManagerAgent.orchestrateRequirement()` in one of three modes:
  1. `standard`: Happy path — implementation passes QA on first try (`SUCCESS_PR_READY`).
  2. `seeded_defect`: Seeds a failure on the `'admin'` criterion (`AC-3`), triggers the defect loop, applies a backend fix, and passes QA regression (`SUCCESS_PR_READY`).
  3. `unfixable_escalation`: Simulates an unfixable bug across 3 retry attempts until the bounded-retry safeguard triggers (`ESCALATED_TO_HUMAN`).

#### 5. Standalone Verification Simulation (`scripts/run-qa-simulation.mjs`)
An executable Node.js script that resets `.project-state/agent-status.json` and `defects.json` and walks through console-formatted simulations of all three scenarios (Standard Validation, Defect Recovery Loop, and Bounded Retries & Human Escalation) to verify the 4 Phase 3 Delivery Gates (`FR-7`, `FR-8`, `FR-9`/`NFR-3`, `FR-5`/`NFR-4`).
