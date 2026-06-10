import type { AgentRequest, AgentResponse, AgentTraceStep } from "../types";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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
              "You are GoAround SG. Write one concise, practical recommendation explanation using the ranked source-backed cards. Do not invent details. Remind the user to check source links for hours, prices, and availability."
          },
          {
            role: "user",
            content: JSON.stringify({
              message: request.message,
              locationName: request.context.locationName,
              fallbackUsed: response.fallbackUsed,
              cards: response.cards.map((card) => ({
                title: card.title,
                description: card.description,
                category: card.category,
                sourceName: card.sourceName,
                tags: card.tags
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
    const answer = payload.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return {
        ...response,
        trace: [...response.trace, gatewayTrace("failed", "Vercel AI Gateway returned no explanation content.", startedAt)]
      };
    }

    return {
      ...response,
      answer,
      trace: [...response.trace, gatewayTrace("success", `Vercel AI Gateway generated the final explanation with ${model}.`, startedAt)]
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
