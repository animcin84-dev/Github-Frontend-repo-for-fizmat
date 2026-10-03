import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SupportError } from "@/server/errors";
import { GMAIL_SCOPES } from "@/server/integrations/gmail/types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

function required(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_URI") {
  const value = process.env[name];
  if (!value) throw new SupportError("configuration_missing", `${name} is not configured`, { status: 500 });
  return value;
}

function stateSecret() {
  const value = process.env.GMAIL_OAUTH_STATE_SECRET ?? process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new SupportError("configuration_missing", "GMAIL_OAUTH_STATE_SECRET is not configured", { status: 500 });
  return value;
}

interface OAuthStatePayload {
  flow: "gmail-connect";
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

function sign(encoded: string) {
  return createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
}

export function createOAuthState(now = Date.now()) {
  const payload: OAuthStatePayload = {
    flow: "gmail-connect",
    nonce: randomBytes(24).toString("base64url"),
    issuedAt: now,
    expiresAt: now + 10 * 60_000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function validateOAuthState(state: string, cookieState: string | undefined, now = Date.now()) {
  if (!cookieState || cookieState.length !== state.length) {
    throw new SupportError("validation_failed", "OAuth state cookie is missing or does not match", { status: 400 });
  }
  const stateBuffer = Buffer.from(state);
  const cookieBuffer = Buffer.from(cookieState);
  if (!timingSafeEqual(stateBuffer, cookieBuffer)) {
    throw new SupportError("validation_failed", "OAuth state does not match the initiated flow", { status: 400 });
  }
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw new SupportError("validation_failed", "OAuth state is malformed", { status: 400 });
  const expected = sign(encoded);
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
    throw new SupportError("validation_failed", "OAuth state signature is invalid", { status: 400 });
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch (error) {
    throw new SupportError("validation_failed", "OAuth state payload is invalid", { status: 400, cause: error });
  }
  if (payload.flow !== "gmail-connect" || payload.expiresAt < now || payload.issuedAt > now + 30_000) {
    throw new SupportError("validation_failed", "OAuth state is expired or invalid", { status: 400 });
  }
  return payload;
}

export function buildOAuthAuthorizationUrl(state: string) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", required("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", required("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await response.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    const code = json.error === "invalid_grant" ? "oauth_expired" : "gmail_unavailable";
    throw new SupportError(code, json.error_description ?? "Google OAuth token exchange failed", {
      status: response.status || 502,
      retryable: response.status >= 500,
    });
  }
  return json;
}

export async function exchangeAuthorizationCode(code: string) {
  return tokenRequest(new URLSearchParams({
    code,
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    redirect_uri: required("GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code",
  }));
}

export async function refreshAccessToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  }));
}

export async function revokeGoogleToken(refreshToken: string) {
  const response = await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
    cache: "no-store",
  });
  return response.ok;
}

export async function fetchGmailProfileWithAccessToken(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  });
  const json = await response.json() as { emailAddress?: string; historyId?: string; messagesTotal?: number; threadsTotal?: number; error?: { message?: string } };
  if (!response.ok || !json.emailAddress || !json.historyId) {
    throw new SupportError("gmail_unavailable", json.error?.message ?? "Could not read Gmail profile", { status: response.status || 502 });
  }
  return {
    emailAddress: json.emailAddress,
    historyId: json.historyId,
    messagesTotal: json.messagesTotal,
    threadsTotal: json.threadsTotal,
  };
}
