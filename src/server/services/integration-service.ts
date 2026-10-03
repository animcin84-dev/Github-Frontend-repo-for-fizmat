import { encryptToken, decryptToken } from "@/server/crypto/token-encryption";
import type { IntegrationStatusDTO } from "@/server/contracts";
import { SupportError } from "@/server/errors";
import { GmailRestClient } from "@/server/integrations/gmail/gmail-client";
import {
  exchangeAuthorizationCode,
  fetchGmailProfileWithAccessToken,
  revokeGoogleToken,
} from "@/server/integrations/gmail/oauth";
import { runFullGmailSync, runIncrementalGmailSync } from "@/server/integrations/gmail/sync";
import { GMAIL_SCOPES } from "@/server/integrations/gmail/types";
import { renewGmailWatch } from "@/server/integrations/gmail/watch";
import {
  disconnectIntegration,
  getActiveGmailIntegration,
  getGmailIntegrationByEmail,
  getIntegrationDataCounts,
  getLatestSyncRun,
  upsertGmailIntegration,
  updateIntegrationSettings,
} from "@/server/repositories/integrations";

export function supportDataMode(): "mock" | "database" {
  return process.env.SUPPORT_DATA_MODE === "database" ? "database" : "mock";
}

export async function connectGmailFromCode(code: string) {
  const token = await exchangeAuthorizationCode(code);
  const profile = await fetchGmailProfileWithAccessToken(token.access_token);
  const existing = await getGmailIntegrationByEmail(profile.emailAddress.toLowerCase());
  const encryptedRefreshToken = token.refresh_token
    ? encryptToken(token.refresh_token)
    : existing?.encryptedRefreshToken;

  if (!encryptedRefreshToken) {
    throw new SupportError("oauth_expired", "Google did not return a refresh token. Reconnect with consent and verify this account is an OAuth test user.", { status: 400 });
  }

  const scopes = token.scope?.split(" ").filter(Boolean) ?? [...GMAIL_SCOPES];
  const configuredBackfill = Number(process.env.GMAIL_BACKFILL_DAYS ?? 30);
  const backfillDays = Number.isFinite(configuredBackfill)
    ? Math.min(365, Math.max(1, Math.trunc(configuredBackfill)))
    : 30;
  const syncQuery = process.env.GMAIL_SYNC_QUERY?.trim() || `in:inbox newer_than:${backfillDays}d`;
  const account = await upsertGmailIntegration({
    providerAccountId: profile.emailAddress.toLowerCase(),
    emailAddress: profile.emailAddress,
    encryptedRefreshToken,
    grantedScopes: scopes,
    // Do not advance the sync cursor until the initial backfill has completed successfully.
    lastHistoryId: null,
    syncQuery,
    backfillDays,
  });

  const sync = await runFullGmailSync({ integrationId: account.id, kind: "initial" });
  return { account, sync };
}

export async function getGmailIntegrationStatus(): Promise<IntegrationStatusDTO> {
  const mode = supportDataMode();
  if (mode === "mock") return { mode, connected: false, watchConfigured: Boolean(process.env.GMAIL_PUBSUB_TOPIC) };

  const account = await getActiveGmailIntegration();
  if (!account) return { mode, connected: false, watchConfigured: Boolean(process.env.GMAIL_PUBSUB_TOPIC) };
  const [latest, counts] = await Promise.all([getLatestSyncRun(account.id), getIntegrationDataCounts(account.id)]);
  return {
    mode,
    connected: true,
    id: account.id,
    provider: "gmail",
    mailbox: account.emailAddress,
    status: account.status as "connected",
    scopes: account.grantedScopes,
    syncState: account.syncState,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastHistoryId: account.lastHistoryId,
    watchExpiration: account.watchExpiration?.toISOString() ?? null,
    watchConfigured: Boolean(process.env.GMAIL_PUBSUB_TOPIC),
    syncQuery: account.syncQuery,
    backfillDays: account.backfillDays,
    storedThreads: counts.threads,
    storedMessages: counts.messages,
    latestSync: latest ? {
      id: latest.id,
      kind: latest.kind,
      status: latest.status,
      messagesFound: latest.messagesFound,
      messagesInserted: latest.messagesInserted,
      messagesSkipped: latest.messagesSkipped,
      threadsFound: latest.threadsFound,
      errorCode: latest.errorCode,
      errorMessage: latest.errorMessage,
    } : null,
  };
}

export async function manualGmailSync() {
  const account = await getActiveGmailIntegration();
  if (!account) throw new SupportError("not_found", "No connected Gmail account", { status: 404 });
  return account.lastHistoryId
    ? runIncrementalGmailSync({ integrationId: account.id, kind: "manual" })
    : runFullGmailSync({ integrationId: account.id, kind: "manual" });
}

export async function renewActiveGmailWatch() {
  const account = await getActiveGmailIntegration();
  if (!account) throw new SupportError("not_found", "No connected Gmail account", { status: 404 });
  return renewGmailWatch(account.id);
}

export async function disconnectActiveGmail() {
  const account = await getActiveGmailIntegration();
  if (!account) throw new SupportError("not_found", "No connected Gmail account", { status: 404 });
  let watchStopped = false;
  let providerRevoked = false;
  try {
    await new GmailRestClient(account).stop();
    watchStopped = true;
  } catch {
    watchStopped = false;
  }
  if (process.env.GMAIL_REVOKE_ON_DISCONNECT === "true" && account.encryptedRefreshToken) {
    try {
      providerRevoked = await revokeGoogleToken(decryptToken(account.encryptedRefreshToken));
    } catch {
      providerRevoked = false;
    }
  }
  await disconnectIntegration(account.id);
  return {
    disconnected: true,
    watchStopped,
    providerRevoked,
    historicalConversationsRemainAvailable: true,
  };
}

export async function updateActiveGmailSettings(input: { syncQuery?: string; backfillDays?: number }) {
  const account = await getActiveGmailIntegration();
  if (!account) throw new SupportError("not_found", "No connected Gmail account", { status: 404 });
  const row = await updateIntegrationSettings(account.id, input);
  if (!row) throw new SupportError("database_failed", "Could not update Gmail integration settings");
  return {
    id: row.id,
    syncQuery: row.syncQuery,
    backfillDays: row.backfillDays,
  };
}
