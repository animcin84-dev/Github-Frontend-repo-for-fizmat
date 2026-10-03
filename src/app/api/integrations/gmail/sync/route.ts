import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { manualGmailSync } from "@/server/services/integration-service";

export async function POST() {
  try {
    return NextResponse.json(await manualGmailSync());
  } catch (error) {
    return apiError(error);
  }
}
