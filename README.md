# [SuperAI] Next Hackathon 

# Agentic GoAround SG

Agentic GoAround SG is a hackathon MVP for an autonomous local discovery and merchant promotion agent.

The product helps residents, workers, visitors, and local businesses in Singapore discover what to eat, what to do, what deals are nearby, and how businesses can publish paid local promotions.

## Hackathon stack

- **Vercel**: Next.js web app and Vercel AI Gateway integration.
- **Exa**: live web search and retrieval for source-backed local discovery.
- **Stripe**: merchant promotion checkout and payment workflow.
- **AWS**: Top 5 extension path for Lambda/API Gateway/DynamoDB deployment.

## Current repository status

This branch contains the contract-first project skeleton so multiple coding agents can work in parallel:

- `apps/web` — Next.js UI and API route skeleton for Vercel deployment.
- `packages/agent-core` — shared TypeScript agent contracts, orchestrator, ranking, Exa adapter, AI Gateway adapter, and mock fallbacks.
- `ai-handoff` — persistent AI handoff docs for Codex/ChatGPT/other coding agents.
- `infra/aws` — AWS extension notes for Top 5 qualification.
- `docs` — judging map and pitch/demo references.

## Local development

Use Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

The web app runs from `apps/web` and defaults to mock fallback data when API keys are not configured.

## Environment variables

Copy `.env.example` to `.env.local` or configure the same variables in Vercel.

```bash
cp .env.example .env.local
```

Minimum for live Exa testing:

```bash
EXA_API_KEY=...
```

Optional for Vercel AI Gateway response generation:

```bash
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=openai/gpt-5.4
```

Optional for Stripe checkout later:

```bash
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

## Vercel deployment

Deploy the repo root as a Vercel project. The root `vercel.json` builds the web app using:

```bash
pnpm --filter @goaround/web build
```

## Important rules

- Do not commit secrets.
- Do not commit to `main` during hackathon development.
- Use `feature/agentic-goaround-mvp` as the integration branch.
- Keep shared API contracts in `packages/agent-core/src/types.ts` stable.
- UI should work against mock data before real Exa/Stripe/AWS integration is complete.
