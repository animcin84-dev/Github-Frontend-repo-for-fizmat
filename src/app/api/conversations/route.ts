import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { getConversationListForCurrentMode } from "@/server/services/conversation-service";

export async function GET() {
  try {
    return NextResponse.json(await getConversationListForCurrentMode(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
