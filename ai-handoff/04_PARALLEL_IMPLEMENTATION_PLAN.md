# Parallel Implementation Plan

## Branching

Integration branch:

```bash
feature/agentic-goaround-mvp
```

Suggested working branches:

```text
feature/ui-shell
feature/agent-core
feature/exa-tool
feature/stripe-flow
feature/aws-agent-api
feature/demo-docs
```

Merge back into `feature/agentic-goaround-mvp`. Do not commit to `main`.

## Track 1 — UI / Vercel Web

Folder:

```text
apps/web
```

Current status:

- Next.js app skeleton exists.
- User/Business toggle exists.
- User mode has chat, quick prompts, Today's Picks, and agent trace.
- Business mode has promotion form and preview.
- `/api/agent/chat` calls local agent core.

Next tasks:

1. Polish UI based on provided template.
2. Add loading and error states.
3. Add source verification badges.
4. Add responsive layout for laptop and mobile.
5. Add `How Agent Works` modal/page.
6. Add environment display for demo: Exa configured / fallback used.

Acceptance criteria:

- `pnpm dev` runs locally.
- `pnpm build` succeeds.
- UI works without Exa API key using mock fallback.
- UI works with Exa API key using live results.

## Track 2 — Agent Core

Folder:

```text
packages/agent-core
```

Current status:

- Shared types exist.
- Mock data exists.
- Ranking engine exists.
- Deterministic intent classifier exists.
- Exa adapter exists.
- Orchestrator exists.

Next tasks:

1. Add tests for `classifyIntent`.
2. Add tests for `rankCards`.
3. Improve answer generation.
4. Add support for Vercel AI Gateway response generation.
5. Add promotion validation flow.

Acceptance criteria:

- Agent core builds with TypeScript.
- Agent core does not depend on React or Next.js.
- Agent core works with mock fallback and real Exa.

## Track 3 — Exa Integration

Folder:

```text
packages/agent-core/src/tools/exa.ts
```

Current status:

- Basic Exa `/search` adapter exists.
- Exa results normalize into `PickCard[]`.
- Missing API key falls back to mock cards.

Next tasks:

1. Verify exact Exa API payload during live test.
2. Improve result extraction using highlights/text.
3. Add Singapore/domain-aware query hints.
4. Add source quality scoring.
5. Add result caching later if needed.

Acceptance criteria:

- With `EXA_API_KEY`, `/api/agent/chat` returns live cards.
- Without `EXA_API_KEY`, `/api/agent/chat` returns mock cards and `fallbackUsed=true`.
- Agent trace clearly shows whether Exa was used.

## Track 4 — Stripe Merchant Flow

Folders:

```text
packages/agent-core/src/tools/stripe.ts
apps/web/app/api/stripe/*
```

Current status:

- UI placeholder exists.
- Promotion contract exists.

Next tasks:

1. Add promotion validation function.
2. Add draft creation API.
3. Add Stripe checkout API route.
4. Add webhook handler.
5. Add promotion status transition: draft -> review_required -> payment_required -> paid -> published.

Acceptance criteria:

- Stripe test checkout can be created.
- Payment success updates promotion status.
- Human approval is required before checkout.

## Track 5 — AWS Top 5 Extension

Folder:

```text
infra/aws
```

Current status:

- Placeholder docs only.

Next tasks:

1. Decide IaC: AWS SAM is simplest for Lambda/API Gateway/DynamoDB.
2. Create Lambda handler importing `@goaround/agent-core`.
3. Add API Gateway route `/agent/chat`.
4. Add DynamoDB table for agent runs.
5. Add CloudWatch logging.
6. Switch frontend API base URL to AWS endpoint when configured.

Acceptance criteria:

- Agent backend runs on AWS Lambda.
- Judges can verify Lambda, API Gateway, and DynamoDB usage.
- Vercel frontend can call AWS backend.

## Track 6 — Docs and Demo

Folders:

```text
ai-handoff
docs
```

Next tasks:

1. Create judging criteria map.
2. Create demo script.
3. Create failure handling script.
4. Create pitch narrative.
5. Create architecture diagram.

Acceptance criteria:

- Judges can understand the architecture in under 60 seconds.
- Demo has a clear flow: user discovery -> Exa search -> ranked picks -> merchant promotion -> Stripe payment.

## Integration order

1. Web UI with mock data.
2. Agent core with mock Exa fallback.
3. Live Exa key test.
4. Vercel deployment.
5. Stripe checkout.
6. AWS Lambda deployment.
7. Final demo polish.
