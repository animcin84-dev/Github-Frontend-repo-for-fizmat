import { NextResponse } from "next/server";
import { buildOAuthAuthorizationUrl, createOAuthState } from "@/server/integrations/gmail/oauth";
import { apiError } from "@/server/http";
import { supportDataMode } from "@/server/services/integration-service";
import { SupportError } from "@/server/errors";

export async function GET() {
  try {
    if (supportDataMode() !== "database") {
      throw new SupportError("configuration_missing", "Set SUPPORT_DATA_MODE=database before connecting a real Gmail account", { status: 409 });
    }
    const state = createOAuthState();
    const response = NextResponse.redirect(buildOAuthAuthorizationUrl(state));
    response.cookies.set("gmail_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/integrations/gmail/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
