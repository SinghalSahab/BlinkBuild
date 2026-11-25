# BlinkBuild

An AI-powered, browser-based website generator that turns natural-language prompts into live-previewed web applications using **Next.js 16**, **Google Gemini 2.5 Flash**, **Clerk**, and **WebContainers**.

## Repository Structure

```text
BlinkBuild/
├── client/               # Next.js 16 frontend & API routes (WebContainers, Monaco, Clerk)
├── docs/                 # Living architecture, decision, and activity documentation
├── docker-compose.yml    # Container orchestration
├── .env.example          # Required environment variable names (no values)
├── PRD.md                # Product Requirements Document
└── PM.md                 # Project Plan
```

## Getting Started (Local Development)

### Prerequisites
- Node.js `>= 20.x` (verified with `v22.20.0`)
- npm `>= 9.x` (verified with `11.13.0`)
- A Google Gemini API key (`API_KEY`)
- Clerk application keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)

### 1. Install Dependencies

```bash
cd client
npm ci
```

### 2. Configure Environment Variables

Copy `.env.example` to `client/.env.local` and fill in your values:

```bash
cp .env.example client/.env.local
```

### 3. Build & Run

```bash
cd client
npm run dev      # Development server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server
```

### Docker

```bash
docker compose up -d --build
```
