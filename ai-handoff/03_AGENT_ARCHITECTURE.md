# Agent Architecture

## Summary

Agentic GoAround SG uses a contract-first agent architecture. The current MVP runs the agent through the Vercel/Next.js API route for fast development and Exa validation. The Top 5 extension moves the same agent core into AWS Lambda, backed by API Gateway and DynamoDB.

## MVP runtime architecture

```text
Browser
  -> Vercel Next.js app
  -> Next.js API route `/api/agent/chat`
  -> packages/agent-core orchestrator
  -> Exa Search API
  -> ranking + fallback
  -> response cards + agent trace
```

## Top 5 runtime architecture

```text
Browser
  -> Vercel Next.js app
  -> AWS API Gateway
  -> AWS Lambda running packages/agent-core
  -> Exa Search API
  -> Vercel AI Gateway
  -> DynamoDB for agent runs and promotion state
  -> Stripe Checkout and webhook
```

## Agents / modules

### Orchestrator Agent

The orchestrator receives a user message and decides the workflow.

Responsibilities:

- Validate request.
- Classify intent.
- Build a tool plan.
- Call Exa or fallback tools.
- Rank cards.
- Return answer, cards, and trace.

Implementation:

- `packages/agent-core/src/orchestrator.ts`

### Discovery Agent

Handles food, events, deals, rainy-day, visitor plans, and general discovery.

Responsibilities:

- Convert intent into search query.
- Use Exa for source-backed results.
- Normalize results into `PickCard[]`.

Implementation:

- `packages/agent-core/src/intent.ts`
- `packages/agent-core/src/tools/exa.ts`

### Ranking Agent

Scores cards by:

- distance,
- interest match,
- time of day,
- source verification,
- card freshness/quality,
- weather relevance.

Implementation:

- `packages/agent-core/src/ranking.ts`

### Merchant Promotion Agent

Planned next phase.

Responsibilities:

- Validate merchant promotion draft.
- Require human approval.
- Create Stripe checkout session.
- Publish after payment success.

Planned files:

- `packages/agent-core/src/promotions.ts`
- `packages/agent-core/src/tools/stripe.ts`

## Agent trace

Every agent response must include trace steps so judges can see autonomy and tool usage.

Example:

```json
[
  {
    "step": "Classify request",
    "status": "success",
    "detail": "Intent classified as food_discovery.",
    "tool": "orchestrator"
  },
  {
    "step": "Search live sources",
    "status": "success",
    "detail": "Exa returned 8 candidate cards.",
    "tool": "exa"
  },
  {
    "step": "Rank candidate cards",
    "status": "success",
    "detail": "Ranked cards by distance, interest, time, source, freshness, and weather.",
    "tool": "ranking"
  }
]
```

## Failure handling

| Failure | Required behavior |
|---|---|
| No Exa key | Use mock cards and mark fallback used |
| Exa error | Use mock cards and record failed trace step |
| Empty user message | Return helper prompt |
| No reliable source | Ask user to widen radius or change query |
| Stripe checkout failure | Keep promotion as draft |
| AWS unavailable | Keep Vercel MVP route working |

## Contract-first rule

All components must use the types in:

```text
packages/agent-core/src/types.ts
```

Do not change these types casually. If a type must change, update UI, API routes, docs, and mock data in the same PR.
