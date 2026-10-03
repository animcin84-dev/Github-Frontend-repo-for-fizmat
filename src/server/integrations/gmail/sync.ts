import { GmailHttpError, GmailRestClient } from "@/server/integrations/gmail/gmail-client";
import { normalizeGmailMessage } from "@/server/integrations/gmail/parser";
import type { GmailClient } from "@/server/integrations/gmail/types";
import { SupportError, toSupportError } from "@/server/errors";
import {
  getIntegrationById,
  updateIntegrationCursor,
  updateIntegrationSyncState,
} from "@/server/repositories/integrations";
import { persistNormalizedMessage } from "@/server/repositories/conversations";
import {
  acquireSyncLock,
  createSyncRun,
  finishSyncRun,
  releaseSyncLock,
} from "@/server/repositories/sync";

interface SyncCounts {
  messagesFound: number;
  messagesInserted: number;
  messagesSkipped: number;
  threadsFound: number;
}

function clientFor(account: NonNullable<Awaited<ReturnType<typeof getIntegrationById>>>, override?: GmailClient) {
  return override ?? new GmailRestClient(account);
}

async function persistRawMessage(
  account: NonNullable<Awaited<ReturnType<typeof getIntegrationById>>>,
  client: GmailClient,
  messageId: string,
  counts: SyncCounts,
) {
  const raw = await client.getMessage(messageId);
  counts.messagesFound += 1;
  const normalized = await normalizeGmailMessage(raw, account.emailAddress);
  const persisted = await persistNormalizedMessage(account, normalized);
  if (persisted.inserted) counts.messagesInserted += 1;
  else counts.messagesSkipped += 1;
  return raw.historyId;
}

export async function runFullGmailSync(input: {
  integrationId: string;
  kind?: "initial" | "manual" | "recovery";
  client?: GmailClient;
}) {
  const account = await getIntegrationById(input.integrationId);
  if (!account || account.status !== "connected") throw new SupportError("not_found", "Connected Gmail integration was not found", { status: 404 });

  const owner = `full:${crypto.randomUUID()}`;
  if (!await acquireSyncLock(account.id, owner)) {
    throw new SupportError("sync_locked", "A Gmail synchronization is already running", { status: 409, retryable: true });
  }

  const run = await createSyncRun({
    integrationAccountId: account.id,
    kind: input.kind ?? "initial",
    historyIdBefore: account.lastHistoryId,
  });
  const counts: SyncCounts = { messagesFound: 0, messagesInserted: 0, messagesSkipped: 0, threadsFound: 0 };

  try {
    await updateIntegrationSyncState(account.id, "syncing");
    const client = clientFor(account, input.client);
    const maxThreads = Number(process.env.GMAIL_SYNC_MAX_THREADS ?? 0);
    let pageToken: string | undefined;

    do {
      const page = await client.listThreads({ q: account.syncQuery, pageToken, maxResults: 100 });
      const pageThreads = page.threads ?? [];
      for (const thread of pageThreads) {
        if (maxThreads > 0 && counts.threadsFound >= maxThreads) break;
        counts.threadsFound += 1;
        const detail = await client.getThread(thread.id);
        for (const message of detail.messages ?? []) {
          await persistRawMessage(account, client, message.id, counts);
        }
      }
      if (maxThreads > 0 && counts.threadsFound >= maxThreads) break;
      pageToken = page.nextPageToken;
    } while (pageToken);

    const profile = await client.getProfile();
    await updateIntegrationCursor(account.id, profile.historyId);
    await finishSyncRun(run.id, {
      status: "succeeded",
      ...counts,
      historyIdAfter: profile.historyId,
    });
    return { runId: run.id, ...counts, historyIdAfter: profile.historyId, recovered: input.kind === "recovery" };
  } catch (error) {
    const normalized = toSupportError(error);
    await updateIntegrationSyncState(account.id, "error", normalized.code);
    await finishSyncRun(run.id, {
      status: "failed",
      ...counts,
      errorCode: normalized.code,
      errorMessage: normalized.message,
    });
    throw normalized;
  } finally {
    await releaseSyncLock(account.id);
  }
}

export async function runIncrementalGmailSync(input: {
  integrationId: string;
  kind?: "incremental" | "manual";
  client?: GmailClient;
}) {
  const account = await getIntegrationById(input.integrationId);
  if (!account || account.status !== "connected") throw new SupportError("not_found", "Connected Gmail integration was not found", { status: 404 });
  if (!account.lastHistoryId) return runFullGmailSync({ integrationId: account.id, kind: "recovery", client: input.client });

  const owner = `incremental:${crypto.randomUUID()}`;
  if (!await acquireSyncLock(account.id, owner)) {
    throw new SupportError("sync_locked", "A Gmail synchronization is already running", { status: 409, retryable: true });
  }

  const run = await createSyncRun({
    integrationAccountId: account.id,
    kind: input.kind ?? "incremental",
    historyIdBefore: account.lastHistoryId,
  });
  const counts: SyncCounts = { messagesFound: 0, messagesInserted: 0, messagesSkipped: 0, threadsFound: 0 };
  let recoveryRequired = false;

  try {
    await updateIntegrationSyncState(account.id, "syncing");
    const client = clientFor(account, input.client);
    let pageToken: string | undefined;
    let historyIdAfter = account.lastHistoryId;
    const messageIds = new Set<string>();

    do {
      const page = await client.listHistory({ startHistoryId: account.lastHistoryId, pageToken });
      for (const history of page.history ?? []) {
        for (const added of history.messagesAdded ?? []) messageIds.add(added.message.id);
      }
      if (page.historyId) historyIdAfter = page.historyId;
      pageToken = page.nextPageToken;
    } while (pageToken);

    for (const messageId of messageIds) await persistRawMessage(account, client, messageId, counts);

    await updateIntegrationCursor(account.id, historyIdAfter);
    await finishSyncRun(run.id, {
      status: "succeeded",
      ...counts,
      historyIdAfter,
    });
    return { runId: run.id, ...counts, historyIdAfter, recovered: false };
  } catch (error) {
    if (error instanceof GmailHttpError && error.httpStatus === 404) {
      recoveryRequired = true;
      await updateIntegrationSyncState(account.id, "recovery_required", "history_expired");
      await finishSyncRun(run.id, {
        status: "failed",
        ...counts,
        errorCode: "history_expired",
        errorMessage: "Gmail history cursor expired; controlled recent resynchronization required",
      });
    } else {
      const normalized = toSupportError(error);
      await updateIntegrationSyncState(account.id, "error", normalized.code);
      await finishSyncRun(run.id, {
        status: "failed",
        ...counts,
        errorCode: normalized.code,
        errorMessage: normalized.message,
      });
      throw normalized;
    }
  } finally {
    await releaseSyncLock(account.id);
  }

  if (recoveryRequired) return runFullGmailSync({ integrationId: account.id, kind: "recovery", client: input.client });
  throw new SupportError("unknown", "Incremental synchronization ended unexpectedly");
}
