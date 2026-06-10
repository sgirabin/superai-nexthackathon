import { NextRequest, NextResponse } from "next/server";
import { defaultUserContext, runAgent, type AgentRequest } from "@goaround/agent-core";

export const runtime = "nodejs";

async function forwardToAws(agentRequest: AgentRequest) {
  const url = process.env.AWS_AGENT_API_URL;
  if (!url) {
    return NextResponse.json(
      {
        error: "aws_agent_api_not_configured",
        message: "NEXT_PUBLIC_AGENT_API_MODE is aws, but AWS_AGENT_API_URL is not configured."
      },
      { status: 500 }
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (process.env.AWS_AGENT_API_KEY) {
    headers["x-api-key"] = process.env.AWS_AGENT_API_KEY;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(agentRequest)
  });

  const data = await response.json().catch(() => ({
    error: "aws_agent_invalid_response",
    message: "AWS agent runtime returned a non-JSON response."
  }));

  return NextResponse.json(data, { status: response.status });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AgentRequest>;
    const agentRequest: AgentRequest = {
      sessionId: body.sessionId ?? "web-session-demo",
      message: body.message ?? "",
      context: body.context ?? defaultUserContext,
      conversationHistory: body.conversationHistory
    };

    if (process.env.NEXT_PUBLIC_AGENT_API_MODE === "aws") {
      return await forwardToAws(agentRequest);
    }

    const result = await runAgent(agentRequest);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "agent_chat_failed",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
