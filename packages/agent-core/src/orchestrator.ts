import type { AgentRequest, AgentResponse, AgentTraceStep } from "./types";
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

function buildAnswer(request: AgentRequest, cardsCount: number, fallbackUsed: boolean): string {
  const fallbackNote = fallbackUsed ? " I used safe fallback cards because live search was unavailable or returned no reliable results." : " I used live Exa search results and ranked them for your context.";
  return `I found ${cardsCount} source-backed picks near ${request.context.locationName}.${fallbackNote} Open the source before acting, especially for prices, timings, or promotion validity.`;
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
  const traces: AgentTraceStep[] = [
    trace("Classify request", "success", `Intent classified as ${intent}.`, "orchestrator"),
    trace("Create tool plan", "success", `Plan: use Exa search, ranking engine, then safe answer generation. Query: ${query}`, "orchestrator")
  ];

  const searchResult = await searchWithExa({ query, context: request.context, intent });
  traces.push(
    trace(
      "Search live sources",
      searchResult.fallbackUsed ? "failed" : "success",
      searchResult.fallbackUsed ? "Exa unavailable or insufficient. Mock fallback cards were used." : `Exa returned ${searchResult.cards.length} candidate cards.`,
      "exa"
    )
  );

  const ranked = rankCards(searchResult.cards, request.context, 5);
  traces.push(trace("Rank candidate cards", "success", `Ranked ${ranked.length} cards by distance, interest, time, source, freshness, and weather.`, "ranking"));

  const response: AgentResponse = {
    runId,
    intent,
    answer: buildAnswer(request, ranked.length, searchResult.fallbackUsed),
    cards: ranked,
    trace: traces,
    fallbackUsed: searchResult.fallbackUsed
  };

  return summarizeWithVercelAiGateway(request, response);
}
