import { type NextRequest, NextResponse } from "next/server";
import { validateOAuthState } from "@/server/integrations/gmail/oauth";
import { connectGmailFromCode } from "@/server/services/integration-service";
import { toSupportError } from "@/server/errors";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  try {
    if (oauthError) throw new Error(`Google OAuth returned ${oauthError}`);
    if (!code || !state) throw new Error("OAuth callback is missing code or state");
    validateOAuthState(state, request.cookies.get("gmail_oauth_state")?.value);
    const result = await connectGmailFromCode(code);
    const response = NextResponse.redirect(new URL(`/integrations?gmail=connected&syncRun=${encodeURIComponent(result.sync.runId)}`, origin));
    response.cookies.delete("gmail_oauth_state");
    return response;
  } catch (error) {
    const normalized = toSupportError(error);
    const response = NextResponse.redirect(new URL(`/integrations?gmail=error&code=${encodeURIComponent(normalized.code)}`, origin));
    response.cookies.delete("gmail_oauth_state");
    return response;
  }
}
