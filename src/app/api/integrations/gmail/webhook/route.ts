import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { handleGmailPubSub } from "@/server/integrations/gmail/watch";
import { supportDataMode } from "@/server/services/integration-service";
import { SupportError } from "@/server/errors";

export async function POST(request: Request) {
  try {
    if (supportDataMode() !== "database") {
      throw new SupportError("configuration_missing", "Gmail webhook requires SUPPORT_DATA_MODE=database", { status: 409 });
    }
    const payload = await request.json();
    const result = await handleGmailPubSub(request, payload);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
