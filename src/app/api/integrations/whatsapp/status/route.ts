import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { getWhatsAppIntegrationStatus } from "@/server/services/whatsapp-service";

export async function GET() {
  try {
    return NextResponse.json(await getWhatsAppIntegrationStatus(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
