import { pubsubDataSchema, pubsubEnvelopeSchema } from "@/server/contracts";
import { SupportError } from "@/server/errors";
import { GmailRestClient } from "@/server/integrations/gmail/gmail-client";
import type { GmailClient } from "@/server/integrations/gmail/types";
import { runIncrementalGmailSync } from "@/server/integrations/gmail/sync";
import {
  getGmailIntegrationByEmail,
  getIntegrationById,
  updateWatchState,
} from "@/server/repositories/integrations";
import {
  markPubSubProcessed,
  registerPubSubNotification,
} from "@/server/repositories/sync";

export async function renewGmailWatch(integrationId: string, clientOverride?: GmailClient) {
  const account = await getIntegrationById(integrationId);
  if (!account || account.status !== "connected") throw new SupportError("not_found", "Connected Gmail integration was not found", { status: 404 });
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) throw new SupportError("configuration_missing", "GMAIL_PUBSUB_TOPIC is not configured", { status: 400 });

  const labelIds = (process.env.GMAIL_WATCH_LABEL_IDS ?? "INBOX")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const response = await (clientOverride ?? new GmailRestClient(account)).watch(topic, labelIds);
  const expiration = new Date(Number(response.expiration));
  await updateWatchState(account.id, expiration);
  return { historyId: response.historyId, expiration: expiration.toISOString() };
}

async function verifyOidcIfConfigured(request: Request) {
  const audience = process.env.GMAIL_PUBSUB_AUDIENCE;
  if (!audience) return { configured: false };
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new SupportError("pubsub_invalid", "Authenticated Pub/Sub push token is missing", { status: 401 });

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, { cache: "no-store" });
  const info = await response.json() as { aud?: string; email?: string; email_verified?: string; exp?: string; error_description?: string };
  const expectedEmail = process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL;
  const valid = response.ok &&
    info.aud === audience &&
    info.email_verified === "true" &&
    Number(info.exp ?? 0) * 1000 > Date.now() &&
    (!expectedEmail || info.email === expectedEmail);
  if (!valid) throw new SupportError("pubsub_invalid", "Pub/Sub OIDC token validation failed", { status: 401 });
  return { configured: true, email: info.email };
}

export async function handleGmailPubSub(request: Request, payload: unknown) {
  await verifyOidcIfConfigured(request);
  const envelope = pubsubEnvelopeSchema.parse(payload);
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(envelope.message.data, "base64url").toString("utf8"));
  } catch (error) {
    throw new SupportError("pubsub_invalid", "Pub/Sub message.data is not valid Base64URL JSON", { status: 400, cause: error });
  }
  const data = pubsubDataSchema.parse(decoded);
  const account = await getGmailIntegrationByEmail(data.emailAddress.toLowerCase());
  if (!account || account.status !== "connected") {
    throw new SupportError("pubsub_invalid", "No connected Gmail integration matches the notification email", { status: 404 });
  }
  const notification = await registerPubSubNotification({
    messageId: envelope.message.messageId,
    emailAddress: data.emailAddress.toLowerCase(),
    historyId: data.historyId,
  });
  if (!notification.isNew && notification.processed) return { duplicate: true, synced: false };

  // Push is only a trigger. Gmail history remains the incremental source of truth.
  // If synchronization fails before processedAt is recorded, a Pub/Sub retry may safely try again.
  const sync = await runIncrementalGmailSync({ integrationId: account.id, kind: "incremental" });
  await markPubSubProcessed(envelope.message.messageId);
  return { duplicate: !notification.isNew, synced: true, sync };
}
