# AI Coding Agent Instructions

Use this file when handing the project to Codex, ChatGPT, Claude Code, Cursor, or another coding agent.

## Mission

Build Agentic GoAround SG: a source-backed local discovery and merchant promotion agent for Singapore.

The app must support:

- User discovery chat.
- Exa-powered live source search.
- Ranked Today's Picks.
- Agent trace for autonomy/tool-use visibility.
- Merchant promotion flow.
- Stripe payment flow later.
- AWS Lambda deployment later for Top 5 qualification.

## Mandatory repository rules

- Work on `feature/agentic-goaround-mvp` or a branch created from it.
- Do not commit to `main`.
- Do not commit secrets.
- Do not change shared contracts without updating all consumers.
- Keep UI working with mock fallback data.
- Keep Exa integration optional through `EXA_API_KEY`.

## Setup

Use Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

The web app runs from:

```text
apps/web
```

The agent core package is:

```text
packages/agent-core
```

## Environment variables

Minimum for live Exa:

```bash
EXA_API_KEY=...
EXA_API_BASE_URL=https://api.exa.ai
```

Optional later:

```bash
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

## Contract-first rule

Shared types live in:

```text
packages/agent-core/src/types.ts
```

Important types:

- `UserContext`
- `PickCard`
- `AgentRequest`
- `AgentResponse`
- `AgentTraceStep`
- `PromotionDraft`

UI and backend must use these types.

## Current files and responsibilities

```text
packages/agent-core/src/types.ts
  Shared contracts.

packages/agent-core/src/mock-data.ts
  Mock cards, default context, mock response, mock promotion.

packages/agent-core/src/intent.ts
  Deterministic intent classifier and search query builder.

packages/agent-core/src/ranking.ts
  Ranking engine.

packages/agent-core/src/tools/exa.ts
  Exa adapter and fallback logic.

packages/agent-core/src/orchestrator.ts
  Main agent workflow.

apps/web/app/api/agent/chat/route.ts
  Vercel/Next.js API route calling the agent.

apps/web/app/page.tsx
  Simplified UI shell.
```

## Acceptance criteria before a PR is ready

Run:

```bash
pnpm typecheck
pnpm build
```

Then verify:

- App loads locally.
- Chat works with no API keys.
- Chat works with Exa key if available.
- No secret values are committed.
- Agent response contains cards and trace.
- UI does not break when `fallbackUsed=true`.

## Coding style

- TypeScript-first.
- Keep agent core pure and framework-independent.
- Keep API integrations isolated under `tools/`.
- Prefer deterministic fallback over throwing errors to the UI.
- Show failure state clearly in `AgentTraceStep`.

## Do not overbuild

Avoid:

- Authentication.
- Full admin dashboard.
- Complex database schema.
- Mobile app.
- Too many pages.
- Overly complex agent framework before MVP works.

## Demo priorities

1. Ask GoAround with user location and interests.
2. Show Exa live source results.
3. Show ranked picks and why shown.
4. Show agent trace.
5. Show merchant promotion preview.
6. Later: show Stripe checkout and AWS Lambda deployment proof.
