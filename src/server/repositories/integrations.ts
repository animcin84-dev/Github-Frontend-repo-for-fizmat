import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { conversations, integrationAccounts, messages, syncRuns } from "@/server/db/schema";

export type IntegrationAccountRow = typeof integrationAccounts.$inferSelect;

export async function getActiveGmailIntegration() {
  const [row] = await getDb()
    .select()
    .from(integrationAccounts)
    .where(and(eq(integrationAccounts.provider, "gmail"), eq(integrationAccounts.status, "connected")))
    .limit(1);
  return row;
}

export async function getGmailIntegrationByEmail(email: string) {
  const [row] = await getDb()
    .select()
    .from(integrationAccounts)
    .where(and(eq(integrationAccounts.provider, "gmail"), eq(integrationAccounts.emailAddress, email.toLowerCase())))
    .limit(1);
  return row;
}

export async function getIntegrationById(id: string) {
  const [row] = await getDb().select().from(integrationAccounts).where(eq(integrationAccounts.id, id)).limit(1);
  return row;
}

export async function upsertGmailIntegration(input: {
  providerAccountId: string;
  emailAddress: string;
  encryptedRefreshToken: string;
  grantedScopes: string[];
  lastHistoryId?: string | null;
  syncQuery?: string;
  backfillDays?: number;
}) {
  const values = {
    provider: "gmail",
    providerAccountId: input.providerAccountId,
    emailAddress: input.emailAddress.toLowerCase(),
    status: "connected",
    connectedAt: new Date(),
    disconnectedAt: null,
    encryptedRefreshToken: input.encryptedRefreshToken,
    grantedScopes: input.grantedScopes,
    lastHistoryId: input.lastHistoryId ?? null,
    syncState: "idle",
    lastError: null,
    ...(input.syncQuery ? { syncQuery: input.syncQuery } : {}),
    ...(input.backfillDays ? { backfillDays: input.backfillDays } : {}),
  };
  const [row] = await getDb()
    .insert(integrationAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: [integrationAccounts.provider, integrationAccounts.providerAccountId],
      set: {
        emailAddress: values.emailAddress,
        status: "connected",
        connectedAt: new Date(),
        disconnectedAt: null,
        encryptedRefreshToken: values.encryptedRefreshToken,
        grantedScopes: values.grantedScopes,
        lastHistoryId: values.lastHistoryId,
        syncState: "idle",
        lastError: null,
      },
    })
    .returning();
  return row;
}

export async function updateIntegrationSyncState(id: string, syncState: string, lastError: string | null = null) {
  await getDb().update(integrationAccounts).set({ syncState, lastError }).where(eq(integrationAccounts.id, id));
}

export async function updateIntegrationCursor(id: string, historyId: string, syncedAt = new Date()) {
  await getDb().update(integrationAccounts).set({
    lastHistoryId: historyId,
    lastSyncedAt: syncedAt,
    syncState: "idle",
    lastError: null,
  }).where(eq(integrationAccounts.id, id));
}

export async function updateWatchState(id: string, expiration: Date) {
  // users.watch returns a current historyId, but it must not replace the persisted
  // synchronization cursor before changes since the old cursor have been reconciled.
  await getDb().update(integrationAccounts).set({
    watchExpiration: expiration,
    lastError: null,
  }).where(eq(integrationAccounts.id, id));
}

export async function getIntegrationDataCounts(integrationAccountId: string) {
  const [[threadCount], [messageCount]] = await Promise.all([
    getDb().select({ value: count() }).from(conversations).where(eq(conversations.integrationAccountId, integrationAccountId)),
    getDb().select({ value: count() }).from(messages).where(eq(messages.integrationAccountId, integrationAccountId)),
  ]);
  return {
    threads: Number(threadCount?.value ?? 0),
    messages: Number(messageCount?.value ?? 0),
  };
}

export async function disconnectIntegration(id: string) {
  await getDb().update(integrationAccounts).set({
    status: "disconnected",
    disconnectedAt: new Date(),
    encryptedRefreshToken: null,
    syncState: "idle",
  }).where(eq(integrationAccounts.id, id));
}

export async function getLatestSyncRun(integrationAccountId: string) {
  const [row] = await getDb()
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.integrationAccountId, integrationAccountId))
    .orderBy(desc(syncRuns.createdAt))
    .limit(1);
  return row;
}

export async function updateIntegrationSettings(id: string, input: { syncQuery?: string; backfillDays?: number }) {
  const [row] = await getDb().update(integrationAccounts).set({
    ...(input.syncQuery !== undefined ? { syncQuery: input.syncQuery } : {}),
    ...(input.backfillDays !== undefined ? { backfillDays: input.backfillDays } : {}),
  }).where(eq(integrationAccounts.id, id)).returning();
  return row;
}
