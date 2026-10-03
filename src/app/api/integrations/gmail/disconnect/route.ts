import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { disconnectActiveGmail } from "@/server/services/integration-service";

export async function POST() {
  try {
    return NextResponse.json(await disconnectActiveGmail());
  } catch (error) {
    return apiError(error);
  }
}
