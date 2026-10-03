import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { renewActiveGmailWatch } from "@/server/services/integration-service";

export async function POST() {
  try {
    return NextResponse.json(await renewActiveGmailWatch());
  } catch (error) {
    return apiError(error);
  }
}
