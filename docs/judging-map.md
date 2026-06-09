# Judging Criteria Map

## Agent Overview

Agentic GoAround SG includes:

1. **Discovery Agent** — helps users find source-backed nearby food, events, deals, rainy-day options, and short plans.
2. **Merchant Promotion Agent** — helps businesses draft, review, pay for, and publish local promotions.
3. **Orchestrator Agent** — routes requests, selects tools, coordinates fallback, and returns agent trace.

## Autonomy & Decision-Making

The orchestrator:

1. Receives user message and context.
2. Classifies intent.
3. Builds a search/tool plan.
4. Chooses Exa or fallback.
5. Normalizes source results into PickCards.
6. Ranks results by local context.
7. Produces a safe, source-backed answer.

The UI displays an agent trace so judges can see decision steps.

## Actions & Tool Use

| Tool / environment | Purpose |
|---|---|
| Vercel Next.js | Frontend and current API route MVP |
| Vercel AI Gateway | Planned LLM response generation |
| Exa | Live source-backed web search and retrieval |
| Stripe | Planned paid promotion checkout and monetization flow |
| AWS Lambda | Planned Top 5 agent runtime deployment |
| AWS DynamoDB | Planned agent run and promotion state storage |

## Orchestration

The current orchestration is implemented in:

```text
packages/agent-core/src/orchestrator.ts
```

Flow:

```text
request -> classify intent -> build query -> call Exa -> rank cards -> answer + trace
```

Future merchant flow:

```text
promotion draft -> validate -> human approval -> Stripe checkout -> webhook -> publish
```

## Human-in-the-Loop

Human approval is required before real-world actions:

- User must open source before acting on recommendations.
- Merchant must approve promotion draft before payment.
- Merchant must complete Stripe checkout before publishing.

## Failure Handling

| Failure | Recovery |
|---|---|
| Missing Exa key | Mock fallback cards |
| Exa API error | Mock fallback cards and failed trace step |
| Empty request | Helper prompt |
| No source found | Ask user to widen or change query |
| Stripe failure | Keep promotion as draft |
| AWS unavailable | Vercel MVP route remains usable |

## Demo & Presentation

Suggested demo flow:

1. Open Vercel app.
2. Show User mode and area context.
3. Ask: "Where can I eat cheap near me?"
4. Show live Exa result or fallback trace.
5. Show ranked Today's Picks and why shown.
6. Switch to Business mode.
7. Show promotion draft and preview.
8. Explain planned Stripe checkout and AWS Lambda runtime.

## Prize strategy

### Top 5 Overall

Required before final submission:

- Deploy frontend on Vercel.
- Deploy agent backend on AWS Lambda/API Gateway.
- Store at least agent runs or promotions in DynamoDB.
- Use Vercel AI Gateway or AI SDK.

### Best use of Exa

Make Exa visible:

- Show source-backed results.
- Show Exa tool trace.
- Show source verification and why shown.

### Best use of Stripe

Make Stripe meaningful:

- Merchant payment for promotion publishing.
- Webhook updates promotion state.
- Paid promotion appears in Today's Picks.
