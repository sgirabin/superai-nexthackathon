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

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

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
    const loggedResponse = await logRun(request, localResponse, event);

    return json(200, loggedResponse);
  } catch (error) {
    return json(500, {
      error: "agent_runtime_failed",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
