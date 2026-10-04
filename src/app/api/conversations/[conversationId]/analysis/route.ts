import { NextResponse } from "next/server";
import { SupportError } from "@/server/errors";
import { apiError } from "@/server/http";
import { getConversationAnalysis } from "@/server/services/analysis-service";
import { supportDataMode } from "@/server/services/integration-service";

export async function GET(_: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    if (supportDataMode() !== "database") throw new SupportError("validation_failed", "Real analysis requires database mode", { status: 409 });
    const { conversationId } = await params;
    return NextResponse.json(await getConversationAnalysis(conversationId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
