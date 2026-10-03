import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { getConversationDetailForCurrentMode } from "@/server/services/conversation-service";

export async function GET(_: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const { conversationId } = await params;
    const detail = await getConversationDetailForCurrentMode(conversationId);
    if (!detail) return NextResponse.json({ error: "not_found", message: "Conversation not found" }, { status: 404 });
    return NextResponse.json(detail, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
