import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  outboundOperations,
  pubsubNotifications,
  syncLocks,
  syncRuns,
} from "@/server/db/schema";

export async function acquireSyncLock(integrationAccountId: string, owner: string) {
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  await getDb().delete(syncLocks).where(and(
    eq(syncLocks.integrationAccountId, integrationAccountId),
    lt(syncLocks.acquiredAt, staleBefore),
  ));
  const [row] = await getDb()
    .insert(syncLocks)
    .values({ integrationAccountId, owner })
    .onConflictDoNothing({ target: syncLocks.integrationAccountId })
    .returning();
  return Boolean(row);
}

export async function releaseSyncLock(integrationAccountId: string) {
  await getDb().delete(syncLocks).where(eq(syncLocks.integrationAccountId, integrationAccountId));
}

export async function createSyncRun(input: {
  integrationAccountId: string;
  kind: "initial" | "incremental" | "manual" | "recovery";
  historyIdBefore?: string | null;
}) {
  const [row] = await getDb().insert(syncRuns).values({
    integrationAccountId: input.integrationAccountId,
    kind: input.kind,
    status: "running",
    startedAt: new Date(),
    historyIdBefore: input.historyIdBefore ?? null,
  }).returning();
  return row;
}

export async function finishSyncRun(id: string, input: {
  status: "succeeded" | "failed";
  messagesFound?: number;
  messagesInserted?: number;
  messagesSkipped?: number;
  threadsFound?: number;
  historyIdAfter?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  await getDb().update(syncRuns).set({
    status: input.status,
    finishedAt: new Date(),
    messagesFound: input.messagesFound ?? 0,
    messagesInserted: input.messagesInserted ?? 0,
    messagesSkipped: input.messagesSkipped ?? 0,
    threadsFound: input.threadsFound ?? 0,
    historyIdAfter: input.historyIdAfter ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
  }).where(eq(syncRuns.id, id));
}

export async function registerPubSubNotification(input: { messageId: string; emailAddress: string; historyId: string }) {
  const [row] = await getDb().insert(pubsubNotifications).values(input).onConflictDoNothing({
    target: pubsubNotifications.messageId,
  }).returning();
  return Boolean(row);
}

export async function markPubSubProcessed(messageId: string) {
  await getDb().update(pubsubNotifications).set({ processedAt: new Date() }).where(eq(pubsubNotifications.messageId, messageId));
}

export async function getOutboundOperation(integrationAccountId: string, clientRequestId: string) {
  const [row] = await getDb()
    .select()
    .from(outboundOperations)
    .where(and(
      eq(outboundOperations.integrationAccountId, integrationAccountId),
      eq(outboundOperations.clientRequestId, clientRequestId),
    ))
    .limit(1);
  return row;
}

export async function createOrGetOutboundOperation(input: {
  integrationAccountId: string;
  conversationId: string;
  clientRequestId: string;
}) {
  const [created] = await getDb().insert(outboundOperations).values(input).onConflictDoNothing({
    target: [outboundOperations.integrationAccountId, outboundOperations.clientRequestId],
  }).returning();
  if (created) return created;
  return getOutboundOperation(input.integrationAccountId, input.clientRequestId);
}

export async function markOutboundSending(id: string, attempt: number) {
  await getDb().update(outboundOperations).set({
    status: "sending",
    attempt,
    providerErrorCode: null,
    providerErrorMessage: null,
    updatedAt: new Date(),
  }).where(eq(outboundOperations.id, id));
}

export async function markOutboundSent(id: string, input: { providerMessageId: string; providerThreadId: string }) {
  await getDb().update(outboundOperations).set({
    status: "sent",
    providerMessageId: input.providerMessageId,
    providerThreadId: input.providerThreadId,
    providerErrorCode: null,
    providerErrorMessage: null,
    updatedAt: new Date(),
  }).where(eq(outboundOperations.id, id));
}

export async function markOutboundFailed(id: string, input: { errorCode: string; errorMessage: string }) {
  await getDb().update(outboundOperations).set({
    status: "failed",
    providerErrorCode: input.errorCode,
    providerErrorMessage: input.errorMessage.slice(0, 500),
    updatedAt: new Date(),
  }).where(eq(outboundOperations.id, id));
}
