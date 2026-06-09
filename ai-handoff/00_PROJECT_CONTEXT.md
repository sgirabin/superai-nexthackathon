# Agentic GoAround SG — Project Context

## Goal

Build **Agentic GoAround SG** for the SuperAI Next Hackathon: a source-backed local discovery and merchant promotion agent for Singapore.

The product helps users answer questions such as:

- What can I eat near me now?
- What can I do with kids this weekend?
- What grocery or food deals are nearby?
- What indoor options are good if it rains?

It also helps merchants create and publish paid local promotions.

## Hackathon prize requirements

### Top 5 Overall

To qualify for Top 5, the final product must demonstrate:

- A live deployed product.
- Direct AWS infrastructure deployment using the provisioned AWS sandbox account.
- At least one Vercel product: AI Gateway, AI SDK Sandbox, or AI SDK Workflows.

### Additional prize targets

- **Best use of Exa:** make Exa central to live source-backed search and agent intelligence.
- **Best use of Stripe:** demonstrate merchant checkout, monetisation, and paid promotion publishing.

## Current MVP strategy

Build the project in layers:

1. **Vercel-first web app** for UI and fast deployment.
2. **Agent core TypeScript package** with contracts, ranking, Exa adapter, fallback, and orchestrator.
3. **Exa integration** through the API route and agent core.
4. **Stripe integration** after the discovery flow is stable.
5. **AWS Lambda/API Gateway/DynamoDB extension** for Top 5 qualification.

## Design direction

Use the provided GoAround SG UI templates as reference, but simplify for MVP:

- Left context panel.
- Center Ask GoAround chat.
- Right Today's Picks card list.
- User/Business toggle.
- Business promotion form and preview.

Avoid overbuilding extra pages.

## Important development rules

- Do not commit secrets.
- Do not commit to `main`.
- Use `feature/agentic-goaround-mvp` as the integration branch.
- Keep shared contracts in `packages/agent-core/src/types.ts` stable.
- UI must work with mock data even when Exa, Stripe, or AWS is not configured.
