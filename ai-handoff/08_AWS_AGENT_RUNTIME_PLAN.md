# AWS Agent Runtime Plan

## Decision

GoAround will use Vercel for the frontend and AWS for the core agent runtime. The agent runs in AWS Lambda behind AWS API Gateway. DynamoDB stores agent run logs and traceability data. Exa provides live search and retrieval. Vercel AI Gateway is used as the required Vercel product integration for model-based explanation. Stripe is added later for merchant promotion and payment actions.

## Target Architecture

```text
User
  -> Vercel Frontend
  -> Vercel Next.js API Route / Thin Proxy
  -> AWS API Gateway
  -> AWS Lambda Agent Runtime
  -> Agent Tools: Exa Search, Vercel AI Gateway, DynamoDB, Stripe later
```

## Important Clarification

Vercel AI Gateway is not a general API gateway for routing application traffic to AWS. It is for LLM or model calls. The normal app request path is:

```text
Frontend on Vercel -> Vercel API Route -> AWS API Gateway -> AWS Lambda Agent Runtime
```

The AWS Lambda agent may call Vercel AI Gateway as a model tool:

```text
AWS Lambda Agent -> Vercel AI Gateway -> model-generated explanation
```

## Judging Alignment

| Requirement / Criteria | Implementation |
|---|---|
| Vercel deployment | Frontend hosted on Vercel |
| Vercel product integration | Vercel AI Gateway for final explanation and model reasoning |
| Direct AWS infrastructure | API Gateway, Lambda, and DynamoDB |
| Agent running on AWS | Core agent orchestration runs inside AWS Lambda |
| Exa usage | Exa provides live local search and retrieval |
| Stripe usage | Merchant promotion and payment flow after AWS agent runtime is stable |
| Autonomy and decision-making | Agent classifies intent, plans tools, executes search, deduplicates, ranks, and explains |
| Actions and tool use | Exa search, AI Gateway summary, DynamoDB logging, Stripe later |
| Orchestration | Lambda coordinates planner, tools, ranking, memory, and response |
| Human-in-the-loop | User chooses recommendation; merchant approves promotion later |
| Failure handling | Exa failure returns fallback cards; AI Gateway failure returns deterministic explanation |
| Demo and presentation | UI shows agent trace, tool calls, fallback status, and AWS run ID |

## Implementation Branch

Use:

```bash
git checkout feature/aws-agent-runtime
```

Base should come from the deployable baseline after `feature/vercel-deployment-fix` is merged and synchronized.

## Phase 1: AWS Agent Runtime

Create AWS infrastructure under:

```text
infra/aws/
  template.yaml or cdk/
  src/agent-handler.ts
  scripts/deploy-agent-api.sh
```

AWS services:

```text
API Gateway: POST /agent/chat
Lambda: agent runtime endpoint
DynamoDB: GoAroundAgentRuns table
```

Lambda responsibilities:

```text
1. Receive user request.
2. Call packages/agent-core orchestrator.
3. Call Exa for live search.
4. Call Vercel AI Gateway for final explanation.
5. Log run to DynamoDB.
6. Return answer, cards, trace, tool calls, and follow-up suggestions.
```

## Phase 2: Agent-Core Orchestration V2

Add or update:

```text
packages/agent-core/
  src/orchestrator-v2.ts
  src/planner.ts
  src/tool-registry.ts
  src/tools/exa.ts
  src/tools/vercel-ai-gateway.ts
  src/tools/dynamodb-log.ts
```

Agent flow:

```text
User Message
  -> classify intent
  -> build plan
  -> select tools
  -> execute Exa search
  -> deduplicate results
  -> rank cards
  -> generate explanation with Vercel AI Gateway
  -> fallback if AI Gateway fails
  -> log run to DynamoDB
  -> return response
```

Returned response shape:

```ts
{
  answer: string;
  cards: PickCard[];
  trace: AgentTraceStep[];
  toolCalls: ToolCallSummary[];
  followUps: string[];
  confidence: number;
  fallbackUsed: boolean;
  runId?: string;
}
```

## Phase 3: Vercel Frontend Proxy

Update:

```text
apps/web/app/api/agent/chat/route.ts
```

Behavior:

```text
If NEXT_PUBLIC_AGENT_API_MODE=aws:
  forward request to AWS_AGENT_API_URL
Else:
  use local agent-core fallback
```

Environment variables:

```bash
NEXT_PUBLIC_AGENT_API_MODE=aws
AWS_AGENT_API_URL=https://xxxx.execute-api.ap-southeast-1.amazonaws.com/prod/agent/chat
AWS_AGENT_API_KEY=optional-if-we-use-api-key
```

## Phase 4: Vercel AI Gateway Integration

Inside AWS Lambda agent runtime, call Vercel AI Gateway as an agent tool.

Tool name:

```text
vercel.ai_gateway.summarize
```

Purpose:

```text
Convert ranked Exa results and trace into a short, helpful explanation.
```

Environment variables:

```bash
VERCEL_AI_GATEWAY_API_KEY=...
VERCEL_AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
VERCEL_AI_GATEWAY_MODEL=...
```

Fallback behavior:

```text
If AI Gateway fails:
  return deterministic explanation from agent-core
  mark trace step as fallback_used
```

## Phase 5: UI Trace Upgrade

Update chat UI to show:

```text
Agent Plan
Tool Calls
Why these results?
AWS Run ID
Fallback status
```

Example trace:

```text
1. Classified intent: food_discovery
2. Planned tools: Exa Search -> Dedupe -> Rank -> Vercel AI Gateway
3. Called Exa: 12 results
4. Deduplicated: 12 -> 7
5. Ranked by location, relevance, freshness, and source trust
6. Called Vercel AI Gateway for explanation
7. Logged run to DynamoDB: run_abc123
```

## Phase 6: Stripe Later

After AWS agent runtime works:

```text
Merchant creates promotion
-> Agent reviews promotion quality
-> Human approves
-> Stripe checkout
-> Promotion appears in Today's Picks
-> Agent logs promotion action
```

## Immediate Build Order

1. Use `feature/aws-agent-runtime`.
2. Add AWS API Gateway, Lambda, and DynamoDB deployment script.
3. Move `/agent/chat` execution to AWS Lambda.
4. Make Vercel frontend call AWS endpoint through a thin proxy.
5. Add DynamoDB logging.
6. Add Vercel AI Gateway summary tool.
7. Improve trace UI.
8. Add Stripe promotion flow only after the above works.

## Demo Story

```text
GoAround is an agentic local decision-making app.
Vercel hosts the user-facing experience.
AWS runs the backend agent workflow through API Gateway, Lambda, and DynamoDB.
Exa gives the agent live web intelligence.
Vercel AI Gateway generates model-based explanation.
Stripe powers merchant promotion and payment actions.
```
