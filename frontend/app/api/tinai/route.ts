import { NextRequest, NextResponse } from "next/server";
import { handleRequest } from "@/lib/tinaiCore";

// AWS SDK calls (Bedrock, DynamoDB) need the Node.js runtime, not Edge.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: true, message: "invalid JSON body" }, { status: 400 });
  }

  const { statusCode, payload } = await handleRequest(body);
  return NextResponse.json(payload, { status: statusCode });
}
