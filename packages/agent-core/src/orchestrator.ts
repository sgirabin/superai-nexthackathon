import type { AgentIntent, AgentRequest, AgentResponse, AgentTraceStep, PickCard, PickCategory } from "./types";
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

function hasPreviousCards(cards?: PickCard[]): cards is PickCard[] {
  return Array.isArray(cards) && cards.length > 0;
}

function hasReferentialLanguage(message: string): boolean {
  return /\b(these|those|this|that|them|above|previous|prior|same|displayed|shown|results?|cards?|options?|picks?|list|first|second|third|1st|2nd|3rd|#\d+)\b/i.test(message);
}

function hasComparisonOrFilterAsk(message: string): boolean {
  return /\b(compare|compared|comparison|which|rank|sort|better|best|cheapest|closest|nearer|distance|price|value|open now|opening hours?|still open|worth it|choose|pick)\b/i.test(message);
}

function hasFreshDomainSignal(message: string): boolean {
  return /\b(event|events|activity|activities|weekend|kids|family|things to do|beer|bar|pub|pint|drink|cocktail|wine|happy hour|eat|food|lunch|dinner|breakfast|hawker|restaurant|coffee|meal|deal|promo|promotion|discount|grocery|supermarket|offer|lobang|sale|rain|rainy|indoor|weather|shower|visit|visitor|tourist|itinerary|plan|explore|merchant|business|campaign|stripe|publish)\b/i.test(message);
}

function categoriesForIntent(intent: AgentIntent): PickCategory[] {
  switch (intent) {
    case "food_discovery":
      return ["food"];
    case "event_discovery":
      return ["event"];
    case "deal_discovery":
      return ["deal", "promotion", "grocery"];
    case "rainy_day_plan":
      return ["weather", "event", "food", "other"];
    case "merchant_promotion":
      return ["promotion", "deal"];
    case "visitor_plan":
    case "general_discovery":
      return ["event", "food", "deal", "promotion", "transport", "other"];
    default:
      return ["other"];
  }
}

function previousCardsMatchIntent(intent: AgentIntent, cards: PickCard[]): boolean {
  const allowed = new Set(categoriesForIntent(intent));
  return cards.some((card) => allowed.has(card.category));
}

function shouldReusePreviousCards(message: string, intent: AgentIntent, previousCards?: PickCard[]): previousCards is PickCard[] {
  if (!hasPreviousCards(previousCards)) return false;

  const referential = hasReferentialLanguage(message);
  const comparisonOrFilter = hasComparisonOrFilterAsk(message);
  const freshDomain = hasFreshDomainSignal(message);
  const compatible = previousCardsMatchIntent(intent, previousCards);

  if (freshDomain && !compatible) return false;
  if (referential && compatible) return true;
  if (comparisonOrFilter && !freshDomain) return true;
  if (comparisonOrFilter && compatible) return true;

  return false;
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
  const reusedPreviousCards = shouldReusePreviousCards(request.message, intent, request.previousCards);
  const traces: AgentTraceStep[] = [
    trace("Classify request", "success", `Intent classified as ${intent}.`, "orchestrator"),
    reusedPreviousCards
      ? trace("Create tool plan", "success", "Plan: reuse displayed cards because the follow-up refers to the same result set, compare trade-offs, then generate a contextual answer.", "orchestrator")
      : trace("Create tool plan", "success", `Plan: use Exa search, ranking engine, then safe answer generation. Query: ${query}`, "orchestrator")
  ];

  let ranked: PickCard[];
  let fallbackUsed = false;

  if (reusedPreviousCards) {
    ranked = rankCards(request.previousCards, request.context, 5);
    traces.push(trace("Reuse previous candidates", "success", `Reused ${request.previousCards.length} displayed cards because the follow-up stayed relevant to the current result set.`, "orchestrator"));
  } else {
    if (hasPreviousCards(request.previousCards)) {
      traces.push(trace("Ignore previous candidates", "skipped", "Previous cards were present, but the new message appears to change topic or category, so a fresh Exa search was used.", "orchestrator"));
    }

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
