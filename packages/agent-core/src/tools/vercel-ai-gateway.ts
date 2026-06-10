import type { AgentRequest, AgentResponse, AgentTraceStep } from "../types";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GatewaySummary = {
  answer?: string;
  followUps?: unknown;
};

function nowIso(): string {
  return new Date().toISOString();
}

function gatewayTrace(status: AgentTraceStep["status"], detail: string, startedAt: string): AgentTraceStep {
  return {
    step: "Generate model explanation",
    status,
    detail,
    tool: "ai-gateway",
    startedAt,
    completedAt: nowIso()
  };
}

function getGatewayConfig() {
  return {
    apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY ?? process.env.AI_GATEWAY_API_KEY,
    baseUrl: process.env.VERCEL_AI_GATEWAY_BASE_URL ?? process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1",
    model: process.env.VERCEL_AI_GATEWAY_MODEL ?? process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4"
  };
}

function parseGatewaySummary(content: string): { answer: string; followUps?: string[] } {
  try {
    const parsed = JSON.parse(content) as GatewaySummary;
    const answer = parsed.answer?.trim();
    const followUps = Array.isArray(parsed.followUps)
      ? parsed.followUps.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 4)
      : undefined;

    if (answer) return { answer, followUps };
  } catch {
    // Some gateway models may return plain text despite the JSON instruction.
  }

  return { answer: content };
}

export async function summarizeWithVercelAiGateway(request: AgentRequest, response: AgentResponse): Promise<AgentResponse> {
  const { apiKey, baseUrl, model } = getGatewayConfig();
  const startedAt = nowIso();

  if (!apiKey) {
    return {
      ...response,
      trace: [...response.trace, gatewayTrace("skipped", "AI Gateway API key is not configured.", startedAt)]
    };
  }

  try {
    const gatewayResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are GoAround SG, a local decision engine. Return only valid JSON with keys answer and followUps. Use the ranked Exa cards as the source of truth. Prioritize practical decision details from card descriptions and metadata: priceSignals, addressSignals, openingSignals, sourceSnippet, sourceName, and sourceUrl. Do not invent opening hours, prices, ratings, review counts, dietary info, or availability. If a detail is not visible, say check source or not shown in snippet. Answer format: first line should name the best recommendation and why; then 2-4 compact bullets comparing price/value, address/location, opening/time signal, and verification needed. For price-sensitive queries, explicitly mention which cards show matching price signals and which do not. Use conversationHistory to resolve follow-up questions. followUps must be exactly 4 short next questions tailored to the ranked cards."
          },
          {
            role: "user",
            content: JSON.stringify({
              message: request.message,
              locationName: request.context.locationName,
              fallbackUsed: response.fallbackUsed,
              conversationHistory: request.conversationHistory?.slice(-8),
              cards: response.cards.map((card) => ({
                title: card.title,
                description: card.description,
                category: card.category,
                sourceName: card.sourceName,
                sourceUrl: card.sourceUrl,
                score: card.score,
                whyShown: card.whyShown,
                tags: card.tags,
                metadata: card.metadata
              }))
            })
          }
        ],
        temperature: 0.2,
        stream: false
      })
    });

    if (!gatewayResponse.ok) {
      throw new Error(`Vercel AI Gateway returned HTTP ${gatewayResponse.status}`);
    }

    const payload = (await gatewayResponse.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return {
        ...response,
        trace: [...response.trace, gatewayTrace("failed", "Vercel AI Gateway returned no explanation content.", startedAt)]
      };
    }

    const summary = parseGatewaySummary(content);

    return {
      ...response,
      answer: summary.answer,
      followUps: summary.followUps,
      trace: [
        ...response.trace,
        gatewayTrace(
          "success",
          summary.followUps?.length
            ? `Vercel AI Gateway generated the final explanation and ${summary.followUps.length} follow-ups with ${model}.`
            : `Vercel AI Gateway generated the final explanation with ${model}.`,
          startedAt
        )
      ]
    };
  } catch (error) {
    return {
      ...response,
      trace: [
        ...response.trace,
        gatewayTrace(error instanceof Error ? "failed" : "failed", error instanceof Error ? error.message : "Unknown Vercel AI Gateway error.", startedAt)
      ]
    };
  }
}
