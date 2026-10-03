import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { integrationSettingsSchema } from "@/server/contracts";
import { getGmailIntegrationStatus, updateActiveGmailSettings } from "@/server/services/integration-service";

export async function GET() {
  try {
    return NextResponse.json(await getGmailIntegrationStatus(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const input = integrationSettingsSchema.parse(await request.json());
    return NextResponse.json(await updateActiveGmailSettings(input));
  } catch (error) {
    return apiError(error);
  }
}
