import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { safeErrorResponse, SupportError } from "@/server/errors";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({
      error: "validation_failed",
      message: error.issues.map((issue) => issue.message).join("; "),
      retryable: false,
    }, { status: 400 });
  }
  const body = safeErrorResponse(error);
  const status = error instanceof SupportError ? error.status : 500;
  return NextResponse.json(body, { status });
}
