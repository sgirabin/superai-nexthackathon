import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { defaultUserContext, runAgent, type AgentRequest, type AgentResponse } from "@goaround/agent-core";

type ApiGatewayEvent = {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  requestContext?: {
    requestId?: string;
    http?: {
      method?: string;
      sourceIp?: string;
    };
  };
};

type ApiResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const corsHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-api-key"
};

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}

function getHeader(headers: ApiGatewayEvent["headers"], key: string): string | undefined {
  const entry = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === key.toLowerCase());
  return entry?.[1];
}

function authorize(event: ApiGatewayEvent): boolean {
  const expected = process.env.AGENT_API_KEY;
  if (!expected) return true;
  return getHeader(event.headers, "x-api-key") === expected;
}

async function explainWithAiGateway(request: AgentRequest, response: AgentResponse): Promise<AgentResponse> {
  const apiKey = process.env.VERCEL_AI_GATEWAY_API_KEY;
  if (!apiKey) {
    response.trace.push({
      step: "Generate model explanation",
      status: "skipped",
      detail: "VERCEL_AI_GATEWAY_API_KEY is not configured.",
      tool: "ai-gateway",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
    return response;
  }

  const startedAt = new Date().toISOString();
  try {
    const aiResponse = await fetch(`${process.env.VERCEL_AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.VERCEL_AI_GATEWAY_MODEL ?? "openai/gpt-5.4",
        messages: [
          {
            role: "system",
            content: "Write a concise local recommendation explanation. Mention that source links should be checked for prices, hours, and availability."
          },
          {
            role: "user",
            content: JSON.stringify({
              userMessage: request.message,
              locationName: request.context.locationName,
              cards: response.cards.map((card) => ({
                title: card.title,
                description: card.description,
                sourceName: card.sourceName,
                category: card.category
              }))
            })
          }
        ],
        temperature: 0.2
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`Vercel AI Gateway returned HTTP ${aiResponse.status}`);
    }

    const payload = (await aiResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    response.trace.push({
      step: "Generate model explanation",
      status: answer ? "success" : "failed",
      detail: answer ? "Vercel AI Gateway generated the final explanation." : "Vercel AI Gateway returned no explanation content.",
      tool: "ai-gateway",
      startedAt,
      completedAt: new Date().toISOString()
    });

    return answer ? { ...response, answer } : response;
  } catch (error) {
    response.trace.push({
      step: "Generate model explanation",
      status: "failed",
      detail: error instanceof Error ? error.message : "Unknown Vercel AI Gateway error.",
      tool: "ai-gateway",
      startedAt,
      completedAt: new Date().toISOString()
    });
    return response;
  }
}

async function logRun(request: AgentRequest, response: AgentResponse, event: ApiGatewayEvent): Promise<AgentResponse> {
  const tableName = process.env.AGENT_RUNS_TABLE;
  if (!tableName) return response;

  const startedAt = new Date().toISOString();
  try {
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          runId: response.runId,
          sessionId: request.sessionId,
          message: request.message,
          intent: response.intent,
          fallbackUsed: response.fallbackUsed,
          cardsCount: response.cards.length,
          requestId: event.requestContext?.requestId,
          sourceIp: event.requestContext?.http?.sourceIp,
          createdAt: startedAt,
          response
        }
      })
    );

    response.trace.push({
      step: "Log agent run",
      status: "success",
      detail: `Logged run to DynamoDB table ${tableName}.`,
      tool: "storage",
      startedAt,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    response.trace.push({
      step: "Log agent run",
      status: "failed",
      detail: error instanceof Error ? error.message : "Unknown DynamoDB logging error.",
      tool: "storage",
      startedAt,
      completedAt: new Date().toISOString()
    });
  }

  return response;
}

export async function handler(event: ApiGatewayEvent): Promise<ApiResponse> {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return json(204, {});
  }

  if (!authorize(event)) {
    return json(401, { error: "unauthorized" });
  }

  try {
    const body = event.body ? (JSON.parse(event.body) as Partial<AgentRequest>) : {};
    const request: AgentRequest = {
      sessionId: body.sessionId ?? "aws-session-demo",
      message: body.message ?? "",
      context: body.context ?? defaultUserContext
    };

    const localResponse = await runAgent(request);
    const explainedResponse = await explainWithAiGateway(request, localResponse);
    const loggedResponse = await logRun(request, explainedResponse, event);

    return json(200, loggedResponse);
  } catch (error) {
    return json(500, {
      error: "agent_runtime_failed",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
