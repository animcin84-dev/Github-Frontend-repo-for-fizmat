import { GmailHttpError, GmailRestClient } from "@/server/integrations/gmail/gmail-client";
import { normalizeGmailMessage } from "@/server/integrations/gmail/parser";
import type { GmailClient } from "@/server/integrations/gmail/types";
import { SupportError, toSupportError } from "@/server/errors";
import { serverErrorLog, serverLog } from "@/server/logging";
import {
  getIntegrationById,
  asGmailIntegration,
  type GmailIntegrationAccountRow,
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

function clientFor(account: GmailIntegrationAccountRow, override?: GmailClient) {
  return override ?? new GmailRestClient(account);
}

async function persistRawMessage(
  account: GmailIntegrationAccountRow,
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

async function listEligibleThreadIds(client: GmailClient, query: string) {
  const eligible = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await client.listThreads({ q: query, pageToken, maxResults: 100 });
    for (const thread of page.threads ?? []) eligible.add(thread.id);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return eligible;
}


export async function runFullGmailSync(input: {
  integrationId: string;
  kind?: "initial" | "manual" | "recovery";
  client?: GmailClient;
}) {
  const account = asGmailIntegration(await getIntegrationById(input.integrationId));
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
  const startedAt = Date.now();
  serverLog("gmail_sync_started", { integrationId: account.id, syncRunId: run.id, kind: input.kind ?? "initial" });

  try {
    await updateIntegrationSyncState(account.id, "syncing");
    const client = clientFor(account, input.client);
    // Keep arrivals during backfill available to the next incremental sync.
    const { historyId: baselineHistoryId } = await client.getProfile();
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

    await updateIntegrationCursor(account.id, baselineHistoryId);
    await finishSyncRun(run.id, {
      status: "succeeded",
      ...counts,
      historyIdAfter: baselineHistoryId,
    });
    serverLog("gmail_sync_completed", { integrationId: account.id, syncRunId: run.id, kind: input.kind ?? "initial", messagesFound: counts.messagesFound, messagesInserted: counts.messagesInserted, messagesSkipped: counts.messagesSkipped, threadsFound: counts.threadsFound, latencyMs: Date.now() - startedAt });
    return { runId: run.id, ...counts, historyIdAfter: baselineHistoryId, recovered: input.kind === "recovery" };
  } catch (error) {
    const normalized = toSupportError(error);
    await updateIntegrationSyncState(account.id, "error", normalized.code);
    await finishSyncRun(run.id, {
      status: "failed",
      ...counts,
      errorCode: normalized.code,
      errorMessage: normalized.message,
    });
    serverErrorLog("gmail_sync_failed", { integrationId: account.id, syncRunId: run.id, kind: input.kind ?? "initial", errorCategory: normalized.code, latencyMs: Date.now() - startedAt });
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
  const account = asGmailIntegration(await getIntegrationById(input.integrationId));
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
  const startedAt = Date.now();
  let recoveryRequired = false;
  serverLog("gmail_sync_started", { integrationId: account.id, syncRunId: run.id, kind: input.kind ?? "incremental" });

  try {
    await updateIntegrationSyncState(account.id, "syncing");
    const client = clientFor(account, input.client);
    let pageToken: string | undefined;
    let historyIdAfter = account.lastHistoryId;
    const candidateMessages = new Map<string, string>();

    do {
      const page = await client.listHistory({ startHistoryId: account.lastHistoryId, pageToken });
      for (const history of page.history ?? []) {
        for (const added of history.messagesAdded ?? []) {
          candidateMessages.set(added.message.id, added.message.threadId);
        }
      }
      if (page.historyId) historyIdAfter = page.historyId;
      pageToken = page.nextPageToken;
    } while (pageToken);

    // Gmail history has no arbitrary q= filter. Re-evaluate the configured Gmail
    // query server-side through threads.list so incremental sync cannot silently
    // widen a dedicated-support scope to unrelated mailbox traffic.
    const eligibleThreadIds = candidateMessages.size
      ? await listEligibleThreadIds(client, account.syncQuery)
      : new Set<string>();

    for (const [messageId, threadId] of candidateMessages) {
      if (!eligibleThreadIds.has(threadId)) continue;
      await persistRawMessage(account, client, messageId, counts);
    }

    await updateIntegrationCursor(account.id, historyIdAfter);
    await finishSyncRun(run.id, {
      status: "succeeded",
      ...counts,
      historyIdAfter,
    });
    serverLog("gmail_sync_completed", { integrationId: account.id, syncRunId: run.id, kind: input.kind ?? "incremental", messagesFound: counts.messagesFound, messagesInserted: counts.messagesInserted, messagesSkipped: counts.messagesSkipped, latencyMs: Date.now() - startedAt });
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
      serverErrorLog("gmail_history_expired", { integrationId: account.id, syncRunId: run.id, errorCategory: "history_expired", latencyMs: Date.now() - startedAt });
    } else {
      const normalized = toSupportError(error);
      await updateIntegrationSyncState(account.id, "error", normalized.code);
      await finishSyncRun(run.id, {
        status: "failed",
        ...counts,
        errorCode: normalized.code,
        errorMessage: normalized.message,
      });
      serverErrorLog("gmail_sync_failed", { integrationId: account.id, syncRunId: run.id, kind: input.kind ?? "incremental", errorCategory: normalized.code, latencyMs: Date.now() - startedAt });
      throw normalized;
    }
  } finally {
    await releaseSyncLock(account.id);
  }

  if (recoveryRequired) return runFullGmailSync({ integrationId: account.id, kind: "recovery", client: input.client });
  throw new SupportError("unknown", "Incremental synchronization ended unexpectedly");
}
