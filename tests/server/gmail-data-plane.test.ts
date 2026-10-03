import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, getSqlClient } from "@/server/db/client";
import { integrationAccounts, messages } from "@/server/db/schema";
import { encryptToken } from "@/server/crypto/token-encryption";
import { GmailHttpError } from "@/server/integrations/gmail/gmail-client";
import { normalizeGmailMessage } from "@/server/integrations/gmail/parser";
import { runFullGmailSync, runIncrementalGmailSync } from "@/server/integrations/gmail/sync";
import { renewGmailWatch } from "@/server/integrations/gmail/watch";
import { getConversationContext, persistNormalizedMessage } from "@/server/repositories/conversations";
import { acquireSyncLock, getOutboundOperation, registerPubSubNotification, releaseSyncLock } from "@/server/repositories/sync";
import { getConversationDetailForCurrentMode, getConversationListForCurrentMode, sendManualGmailReply } from "@/server/services/conversation-service";
import { getGmailIntegrationStatus, updateActiveGmailSettings } from "@/server/services/integration-service";
import { FixtureGmailClient, rawFixture } from "./fixtures/gmail";

beforeAll(() => {
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});

beforeEach(async () => {
  await getSqlClient().unsafe("TRUNCATE TABLE pubsub_notifications, sync_locks, outbound_operations, attachments, messages, conversations, participants, sync_runs, integration_accounts RESTART IDENTITY CASCADE");
});

async function seedIntegration(lastHistoryId: string | null = null) {
  const [row] = await getDb().insert(integrationAccounts).values({
    provider: "gmail",
    providerAccountId: "support@example.test",
    emailAddress: "support@example.test",
    status: "connected",
    encryptedRefreshToken: encryptToken("fixture-refresh"),
    grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    lastHistoryId,
    syncQuery: "in:inbox newer_than:30d",
    syncState: "idle",
  }).returning();
  return row;
}

describe("database idempotency and synchronization", () => {
  test("provider message ID is idempotent and Gmail thread maps to one Conversation", async () => {
    const account = await seedIntegration();
    const normalized = await normalizeGmailMessage(rawFixture({
      id: "provider-message-1",
      threadId: "gmail-thread-1",
      from: "customer@example.test",
      to: "support@example.test",
    }), account.emailAddress);
    const first = await persistNormalizedMessage(account, normalized);
    const second = await persistNormalizedMessage(account, normalized);
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    const context = await getConversationContext(first.conversationId);
    expect(context?.conversation.providerConversationId).toBe("gmail-thread-1");
    const rows = await getDb().select().from(messages);
    expect(rows).toHaveLength(1);
  });

  test("an unfinished initial backfill keeps the persisted cursor unset", async () => {
    const account = await seedIntegration(null);
    expect(account.lastHistoryId).toBeNull();
    const client = new FixtureGmailClient();
    client.threadPages = [{ threads: [{ id: "failing-thread" }] }];
    client.threads.set("failing-thread", { id: "failing-thread", messages: [{ id: "missing-message", threadId: "failing-thread" }] });
    await expect(runFullGmailSync({ integrationId: account.id, client })).rejects.toThrow(/Missing raw fixture/);
    const [updated] = await getDb().select().from(integrationAccounts).where(eq(integrationAccounts.id, account.id));
    expect(updated.lastHistoryId).toBeNull();
  });

  test("full sync follows thread pagination and advances cursor only after processing", async () => {
    const account = await seedIntegration();
    const client = new FixtureGmailClient();
    client.threadPages = [
      { threads: [{ id: "t1" }], nextPageToken: "next" },
      { threads: [{ id: "t2" }] },
    ];
    client.threads.set("t1", { id: "t1", messages: [{ id: "m1", threadId: "t1" }] });
    client.threads.set("t2", { id: "t2", messages: [{ id: "m2", threadId: "t2" }] });
    client.raws.set("m1", rawFixture({ id: "m1", threadId: "t1", from: "a@example.test", to: "support@example.test" }));
    client.raws.set("m2", rawFixture({ id: "m2", threadId: "t2", from: "b@example.test", to: "support@example.test" }));
    client.profile.historyId = "333";

    const result = await runFullGmailSync({ integrationId: account.id, client });
    expect(client.listThreadCalls).toBe(2);
    expect(result.threadsFound).toBe(2);
    expect(result.messagesInserted).toBe(2);
    const [updated] = await getDb().select().from(integrationAccounts).where(eq(integrationAccounts.id, account.id));
    expect(updated.lastHistoryId).toBe("333");
  });

  test("incremental sync paginates history and persists the returned cursor", async () => {
    const account = await seedIntegration("333");
    const client = new FixtureGmailClient();
    client.historyPages = [
      { history: [{ id: "334", messagesAdded: [{ message: { id: "m3", threadId: "t3" } }] }], nextPageToken: "p2", historyId: "334" },
      { history: [{ id: "335", messagesAdded: [{ message: { id: "m4", threadId: "t4" } }] }], historyId: "335" },
    ];
    client.raws.set("m3", rawFixture({ id: "m3", threadId: "t3", from: "c@example.test", to: "support@example.test" }));
    client.raws.set("m4", rawFixture({ id: "m4", threadId: "t4", from: "d@example.test", to: "support@example.test" }));

    const result = await runIncrementalGmailSync({ integrationId: account.id, client });
    expect(client.listHistoryCalls).toBe(2);
    expect(result.messagesInserted).toBe(2);
    expect(result.historyIdAfter).toBe("335");
  });

  test("expired history cursor triggers controlled full/recent recovery without duplicates", async () => {
    const account = await seedIntegration("old-history");
    const client = new FixtureGmailClient();
    client.historyError = new GmailHttpError(404, "history expired");
    client.threadPages = [{ threads: [{ id: "recover-thread" }] }];
    client.threads.set("recover-thread", { id: "recover-thread", messages: [{ id: "recover-message", threadId: "recover-thread" }] });
    client.raws.set("recover-message", rawFixture({ id: "recover-message", threadId: "recover-thread", from: "recovery@example.test", to: "support@example.test" }));
    client.profile.historyId = "fresh-history";

    const result = await runIncrementalGmailSync({ integrationId: account.id, client });
    expect(result.recovered).toBe(true);
    expect(result.messagesInserted).toBe(1);
    const [updated] = await getDb().select().from(integrationAccounts).where(eq(integrationAccounts.id, account.id));
    expect(updated.lastHistoryId).toBe("fresh-history");
  });

  test("database mode exposes real conversations as untriaged without fake AI state", async () => {
    const account = await seedIntegration("400");
    const normalized = await normalizeGmailMessage(rawFixture({
      id: "real-mode-message",
      threadId: "real-mode-thread",
      from: "Real Customer <real@example.test>",
      to: "support@example.test",
      subject: "Real support message",
      body: "This should stay untriaged until Phase F3.",
    }), account.emailAddress);
    const persisted = await persistNormalizedMessage(account, normalized);
    const previousMode = process.env.SUPPORT_DATA_MODE;
    process.env.SUPPORT_DATA_MODE = "database";
    try {
      const list = await getConversationListForCurrentMode();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        source: "gmail",
        providerLabel: "Gmail",
        priority: "untriaged",
        aiState: "unanalyzed",
        analysisState: "pending",
      });
      const detail = await getConversationDetailForCurrentMode(persisted.conversationId);
      expect(detail).toMatchObject({
        source: "gmail",
        analysisState: "pending",
        replyMode: "gmail_real",
        priority: "untriaged",
      });
      expect(detail?.evidence).toEqual([]);
      expect(detail?.policyDecisions).toEqual([]);
      expect(detail?.aiDraft).toBeUndefined();

      const integration = await getGmailIntegrationStatus();
      expect(integration.storedThreads).toBe(1);
      expect(integration.storedMessages).toBe(1);
    } finally {
      if (previousMode === undefined) delete process.env.SUPPORT_DATA_MODE;
      else process.env.SUPPORT_DATA_MODE = previousMode;
    }
  });

  test("Gmail sync query and backfill settings persist without vendor-specific domain coupling", async () => {
    await seedIntegration("450");
    const updated = await updateActiveGmailSettings({
      backfillDays: 7,
      syncQuery: "label:support newer_than:7d",
    });
    expect(updated).toMatchObject({ backfillDays: 7, syncQuery: "label:support newer_than:7d" });
    const status = await getGmailIntegrationStatus();
    expect(status.backfillDays).toBe(7);
    expect(status.syncQuery).toBe("label:support newer_than:7d");
  });

  test("renewing Gmail watch persists expiration without skipping the sync history cursor", async () => {
    process.env.GMAIL_PUBSUB_TOPIC = "projects/test/topics/gmail";
    const account = await seedIntegration("cursor-before-watch");
    const client = new FixtureGmailClient();
    client.profile.historyId = "watch-start-history";
    const result = await renewGmailWatch(account.id, client);
    const [updated] = await getDb().select().from(integrationAccounts).where(eq(integrationAccounts.id, account.id));
    expect(result.historyId).toBe("watch-start-history");
    expect(updated.lastHistoryId).toBe("cursor-before-watch");
    expect(updated.watchExpiration).toBeTruthy();
    delete process.env.GMAIL_PUBSUB_TOPIC;
  });

  test("duplicate Pub/Sub notification and overlapping sync lock are rejected idempotently", async () => {
    const account = await seedIntegration();
    expect(await registerPubSubNotification({ messageId: "pubsub-1", emailAddress: account.emailAddress, historyId: "10" })).toEqual({ isNew: true, processed: false });
    expect(await registerPubSubNotification({ messageId: "pubsub-1", emailAddress: account.emailAddress, historyId: "10" })).toEqual({ isNew: false, processed: false });
    expect(await acquireSyncLock(account.id, "first")).toBe(true);
    expect(await acquireSyncLock(account.id, "second")).toBe(false);
    await releaseSyncLock(account.id);
    expect(await acquireSyncLock(account.id, "third")).toBe(true);
  });
});

describe("manual outbound reply", () => {
  async function seedConversation() {
    const account = await seedIntegration("500");
    const inboundRaw = rawFixture({
      id: "inbound-1",
      threadId: "thread-send",
      from: "Customer <customer@example.test>",
      to: "support@example.test",
      subject: "Need help",
      messageId: "<root@example.test>",
    });
    const normalized = await normalizeGmailMessage(inboundRaw, account.emailAddress);
    const persisted = await persistNormalizedMessage(account, normalized);
    return { account, conversationId: persisted.conversationId };
  }

  test("outbound idempotency prevents operator double-send and keeps Gmail threadId", async () => {
    const { conversationId } = await seedConversation();
    const client = new FixtureGmailClient();
    client.raws.set("sent-provider-1", rawFixture({
      id: "sent-provider-1",
      threadId: "thread-send",
      from: "support@example.test",
      to: "customer@example.test",
      subject: "Need help",
      messageId: "<sent@example.test>",
      inReplyTo: "<root@example.test>",
      references: ["<root@example.test>"],
      unread: false,
    }));
    const request = {
      conversationId,
      text: "A deliberate human reply.",
      clientRequestId: "22222222-2222-4222-8222-222222222222",
      client,
    };

    const first = await sendManualGmailReply(request);
    const second = await sendManualGmailReply(request);
    expect(first.status).toBe("sent");
    expect(first.providerThreadId).toBe("thread-send");
    expect(second.deduplicated).toBe(true);
    expect(client.sendCalls).toHaveLength(1);
    expect(client.sendCalls[0].threadId).toBe("thread-send");
  });

  test("concurrent double-click shares one outbound operation and sends once", async () => {
    const { conversationId } = await seedConversation();
    const client = new FixtureGmailClient();
    client.sendDelayMs = 80;
    client.raws.set("sent-provider-1", rawFixture({
      id: "sent-provider-1",
      threadId: "thread-send",
      from: "support@example.test",
      to: "customer@example.test",
      subject: "Need help",
      messageId: "<sent-concurrent@example.test>",
      inReplyTo: "<root@example.test>",
      references: ["<root@example.test>"],
      unread: false,
    }));
    const request = {
      conversationId,
      text: "One send only.",
      clientRequestId: "44444444-4444-4444-8444-444444444444",
      client,
    };
    const [a, b] = await Promise.all([sendManualGmailReply(request), sendManualGmailReply(request)]);
    expect(client.sendCalls).toHaveLength(1);
    expect([a.status, b.status]).toEqual(expect.arrayContaining(["sent", "sending"]));
  });

  test("send failure does not persist a successfully-sent Message and records failed operation", async () => {
    const { account, conversationId } = await seedConversation();
    const client = new FixtureGmailClient();
    client.sendError = new GmailHttpError(503, "provider unavailable");
    const clientRequestId = "33333333-3333-4333-8333-333333333333";

    await expect(sendManualGmailReply({
      conversationId,
      text: "Retryable reply",
      clientRequestId,
      client,
    })).rejects.toThrow(/not confirmed as sent/i);

    const operation = await getOutboundOperation(account.id, clientRequestId);
    expect(operation?.status).toBe("failed");
    const rows = await getDb().select().from(messages);
    expect(rows.filter((row) => row.direction === "outbound")).toHaveLength(0);
  });
});
