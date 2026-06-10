import type { AgentRequest, AgentResponse, AgentTraceStep, PickCard } from "./types";
import { mockAgentResponse } from "./mock-data";
import { classifyIntent, buildSearchQuery } from "./intent";
import { rankCards } from "./ranking";
import { searchWithExa } from "./tools/exa";
import { summarizeWithVercelAiGateway } from "./tools/vercel-ai-gateway";

function nowIso(): string {
  return new Date().toISOString();
}

function trace(step: string, status: AgentTraceStep["status"], detail: string, tool: AgentTraceStep["tool"]): AgentTraceStep {
  const timestamp = nowIso();
  return { step, status, detail, tool, startedAt: timestamp, completedAt: timestamp };
}

function buildAnswer(request: AgentRequest, cardsCount: number, fallbackUsed: boolean, reusedPreviousCards: boolean): string {
  if (reusedPreviousCards) {
    return `I compared the same ${cardsCount} ranked picks from your previous result near ${request.context.locationName}. I reused the prior candidates instead of starting a new search, so the comparison stays consistent.`;
  }
  const fallbackNote = fallbackUsed ? " I used safe fallback cards because live search was unavailable or returned no reliable results." : " I used live Exa search results and ranked them for your context.";
  return `I found ${cardsCount} source-backed picks near ${request.context.locationName}.${fallbackNote} Open the source before acting, especially for prices, timings, or promotion validity.`;
}

function isComparisonFollowUp(message: string): boolean {
  return /\b(compare|compared|comparison|which|rank|sort|same|these|those|price|distance|closest|cheapest|value|open now|nearer|better)\b/i.test(message);
}

function hasPreviousCards(cards?: PickCard[]): cards is PickCard[] {
  return Array.isArray(cards) && cards.length > 0;
}

export async function runAgent(request: AgentRequest): Promise<AgentResponse> {
  if (!request.message.trim()) {
    return {
      ...mockAgentResponse,
      runId: `run-${crypto.randomUUID()}`,
      answer: "Ask GoAround what to eat, what to do, nearby deals, rainy-day ideas, or a short visitor plan.",
      trace: [trace("Validate request", "skipped", "Empty user message, returned helper prompt.", "orchestrator")]
    };
  }

  const runId = `run-${crypto.randomUUID()}`;
  const intent = classifyIntent(request.message);
  const query = buildSearchQuery(intent, request.message, request.context.locationName);
  const previousCards = hasPreviousCards(request.previousCards) ? request.previousCards : undefined;
  const reusedPreviousCards = isComparisonFollowUp(request.message) && Boolean(previousCards);
  const traces: AgentTraceStep[] = [
    trace("Classify request", "success", `Intent classified as ${intent}.`, "orchestrator"),
    reusedPreviousCards
      ? trace("Create tool plan", "success", "Plan: reuse previous ranked cards, compare trade-offs, then generate a contextual answer.", "orchestrator")
      : trace("Create tool plan", "success", `Plan: use Exa search, ranking engine, then safe answer generation. Query: ${query}`, "orchestrator")
  ];

  let ranked: PickCard[];
  let fallbackUsed = false;

  if (reusedPreviousCards && previousCards) {
    ranked = rankCards(previousCards, request.context, 5);
    traces.push(trace("Reuse previous candidates", "success", `Reused ${previousCards.length} prior cards from the conversation instead of calling Exa again.`, "orchestrator"));
  } else {
    const searchResult = await searchWithExa({ query, context: request.context, intent });
    fallbackUsed = searchResult.fallbackUsed;
    traces.push(
      trace(
        "Search live sources",
        searchResult.fallbackUsed ? "failed" : "success",
        searchResult.fallbackUsed ? "Exa unavailable or insufficient. Mock fallback cards were used." : `Exa returned ${searchResult.cards.length} candidate cards.`,
        "exa"
      )
    );
    ranked = rankCards(searchResult.cards, request.context, 5);
  }

  traces.push(trace("Rank candidate cards", "success", `Ranked ${ranked.length} cards by distance, interest, time, source, freshness, and weather.`, "ranking"));

  const response: AgentResponse = {
    runId,
    intent,
    answer: buildAnswer(request, ranked.length, fallbackUsed, reusedPreviousCards),
    cards: ranked,
    trace: traces,
    fallbackUsed
  };

  return summarizeWithVercelAiGateway(request, response);
}
