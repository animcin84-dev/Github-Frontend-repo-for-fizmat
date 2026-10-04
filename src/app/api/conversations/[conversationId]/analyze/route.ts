import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { analyzeConversation } from "@/server/services/analysis-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const { conversationId } = await params;
    // The request cannot select a provider/model, inject facts, or trigger a send.
    return NextResponse.json(await analyzeConversation(conversationId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
