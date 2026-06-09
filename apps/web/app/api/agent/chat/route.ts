import { NextRequest, NextResponse } from "next/server";
import { defaultUserContext, runAgent, type AgentRequest } from "@goaround/agent-core";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AgentRequest>;
    const agentRequest: AgentRequest = {
      sessionId: body.sessionId ?? "web-session-demo",
      message: body.message ?? "",
      context: body.context ?? defaultUserContext
    };

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
