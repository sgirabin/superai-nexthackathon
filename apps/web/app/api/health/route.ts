import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "goaround-web",
    timestamp: new Date().toISOString(),
    exaConfigured: Boolean(process.env.EXA_API_KEY)
  });
}
