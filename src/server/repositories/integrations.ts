import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { integrationAccounts, syncRuns } from "@/server/db/schema";

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

export async function updateWatchState(id: string, input: { historyId: string; expiration: Date }) {
  await getDb().update(integrationAccounts).set({
    lastHistoryId: input.historyId,
    watchExpiration: input.expiration,
    lastError: null,
  }).where(eq(integrationAccounts.id, id));
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
