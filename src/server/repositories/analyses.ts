import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { conversationAnalyses, messages } from "@/server/db/schema";

export type AnalysisRow = typeof conversationAnalyses.$inferSelect;

export async function getLatestAnalysis(conversationId: string) {
  const [row] = await getDb().select().from(conversationAnalyses)
    .where(eq(conversationAnalyses.conversationId, conversationId))
    .orderBy(desc(conversationAnalyses.createdAt)).limit(1);
  return row;
}

export async function getLatestAnalyses(conversationIds: string[]) {
  if (!conversationIds.length) return [];
  return getDb().selectDistinctOn([conversationAnalyses.conversationId]).from(conversationAnalyses)
    .where(inArray(conversationAnalyses.conversationId, conversationIds))
    .orderBy(conversationAnalyses.conversationId, desc(conversationAnalyses.createdAt));
}

/** Analysis needs normalized inbound text, never attachment queries or payloads. */
export async function getInboundAnalysisMessages(conversationIds: string[]) {
  if (!conversationIds.length) return [];
  return getDb().select({
    conversationId: messages.conversationId, id: messages.id,
    providerMessageId: messages.providerMessageId,
    displayTextBody: messages.displayTextBody, textBody: messages.textBody,
    receivedAt: messages.receivedAt, createdAt: messages.createdAt,
  }).from(messages).where(and(inArray(messages.conversationId, conversationIds), eq(messages.direction, "inbound")));
}

export async function expireInterruptedAnalyses(conversationId: string | string[]) {
  const ids = typeof conversationId === "string" ? [conversationId] : conversationId;
  if (!ids.length) return;
  await getDb().update(conversationAnalyses).set({
    status: "failed", errorCode: "analysis_interrupted",
    errorMessage: "Analysis was interrupted. Run it again explicitly.",
    finishedAt: new Date(), updatedAt: new Date(),
  }).where(and(
    inArray(conversationAnalyses.conversationId, ids),
    inArray(conversationAnalyses.status, ["pending", "running"]),
    lt(conversationAnalyses.updatedAt, new Date(Date.now() - 3 * 60_000)),
  ));
}

export async function createPendingAnalysis(input: typeof conversationAnalyses.$inferInsert) {
  const [row] = await getDb().insert(conversationAnalyses).values(input)
    .onConflictDoNothing().returning();
  return row;
}

export async function updateAnalysis(id: string, input: Partial<typeof conversationAnalyses.$inferInsert>) {
  const [row] = await getDb().update(conversationAnalyses).set({ ...input, updatedAt: new Date() })
    .where(and(eq(conversationAnalyses.id, id), inArray(conversationAnalyses.status, ["pending", "running"]))).returning();
  return row;
}
