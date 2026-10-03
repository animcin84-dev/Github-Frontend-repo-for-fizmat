import { NextResponse } from "next/server";
import { sendReplyRequestSchema } from "@/server/contracts";
import { apiError } from "@/server/http";
import { sendManualReply } from "@/server/services/conversation-service";
import { supportDataMode } from "@/server/services/integration-service";
import { SupportError } from "@/server/errors";

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    if (supportDataMode() !== "database") {
      throw new SupportError("validation_failed", "Real sending is disabled in mock mode", { status: 409 });
    }
    const { conversationId } = await params;
    const input = sendReplyRequestSchema.parse(await request.json());
    const result = await sendManualReply({ conversationId, ...input });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
