import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, getSqlClient } from "@/server/db/client";
import { integrationAccounts, messages } from "@/server/db/schema";
import { encryptToken } from "@/server/crypto/token-encryption";
import { GmailHttpError } from "@/server/integrations/gmail/gmail-client";
import { normalizeGmailMessage } from "@/server/integrations/gmail/parser";
import { buildReplyMime } from "@/server/integrations/gmail/send";
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
  return { ...row, emailAddress: "support@example.test" };
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

  test.each(["initial", "recovery"] as const)("%s backfill leaves concurrent arrivals for incremental sync", async (kind) => {
    const account = await seedIntegration();
    class ArrivalDuringBackfillClient extends FixtureGmailClient {
      override async getThread(threadId: string) {
        const snapshot = await super.getThread(threadId);
        this.profile.historyId = "701";
        return snapshot;
      }
    }
    const client = new ArrivalDuringBackfillClient();
    client.profile.historyId = "700";
    client.threadPages = [
      { threads: [{ id: "arrival-thread" }] },
      { threads: [{ id: "arrival-thread" }] },
    ];
    client.threads.set("arrival-thread", { id: "arrival-thread", messages: [{ id: "before-backfill", threadId: "arrival-thread" }] });
    for (const id of ["before-backfill", "during-backfill"]) {
      client.raws.set(id, rawFixture({ id, threadId: "arrival-thread", from: "customer@example.test", to: "support@example.test" }));
    }
    client.historyPages = [{
      history: [{ id: "701", messagesAdded: [{ message: { id: "during-backfill", threadId: "arrival-thread" } }] }],
      historyId: "701",
    }];

    const backfill = await runFullGmailSync({ integrationId: account.id, kind, client });
    expect(backfill.messagesInserted).toBe(1);
    expect(backfill.historyIdAfter).toBe("700");
    const [afterBackfill] = await getDb().select().from(integrationAccounts).where(eq(integrationAccounts.id, account.id));
    expect(afterBackfill.lastHistoryId).toBe("700");

    const incremental = await runIncrementalGmailSync({ integrationId: account.id, client });
    expect(incremental.messagesInserted).toBe(1);
    expect(incremental.historyIdAfter).toBe("701");
    const rows = await getDb().select().from(messages);
    expect(rows.map((row) => row.providerMessageId).sort()).toEqual(["before-backfill", "during-backfill"]);
    expect(new Set(rows.map((row) => row.conversationId)).size).toBe(1);
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
    client.threadPages = [{ threads: [{ id: "t3" }, { id: "t4" }] }];

    const result = await runIncrementalGmailSync({ integrationId: account.id, client });
    expect(client.listHistoryCalls).toBe(2);
    expect(result.messagesInserted).toBe(2);
    expect(result.historyIdAfter).toBe("335");
  });

  test("incremental sync does not widen beyond the configured Gmail query", async () => {
    const account = await seedIntegration("360");
    const client = new FixtureGmailClient();
    client.historyPages = [{
      history: [{
        id: "361",
        messagesAdded: [
          { message: { id: "support-message", threadId: "support-thread" } },
          { message: { id: "unrelated-message", threadId: "personal-thread" } },
        ],
      }],
      historyId: "361",
    }];
    client.threadPages = [{ threads: [{ id: "support-thread" }] }];
    client.raws.set("support-message", rawFixture({ id: "support-message", threadId: "support-thread", from: "customer@example.test", to: "support@example.test" }));
    client.raws.set("unrelated-message", rawFixture({ id: "unrelated-message", threadId: "personal-thread", from: "friend@example.test", to: "support@example.test" }));

    const result = await runIncrementalGmailSync({ integrationId: account.id, client });
    expect(result.messagesInserted).toBe(1);
    const rows = await getDb().select().from(messages);
    expect(rows.map((row) => row.providerMessageId)).toEqual(["support-message"]);
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
    const previousMode = process.env.SUPPORT_DATA_MODE;
    process.env.SUPPORT_DATA_MODE = "database";
    try {
      const status = await getGmailIntegrationStatus();
      expect(status.backfillDays).toBe(7);
      expect(status.syncQuery).toBe("label:support newer_than:7d");
    } finally {
      if (previousMode === undefined) delete process.env.SUPPORT_DATA_MODE;
      else process.env.SUPPORT_DATA_MODE = previousMode;
    }
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
    const { account, conversationId } = await seedConversation();
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
      body: "A deliberate human reply.",
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

    const operation = await getOutboundOperation(account.id, request.clientRequestId);
    expect(operation).toMatchObject({ status: "sent", attempt: 1, providerMessageId: "sent-provider-1", providerThreadId: "thread-send" });
    const beforeSync = await getDb().select().from(messages);
    expect(beforeSync).toHaveLength(2);
    expect(beforeSync.find((row) => row.direction === "outbound")).toMatchObject({
      conversationId,
      providerMessageId: "sent-provider-1",
      providerThreadId: "thread-send",
      textBody: request.text,
      fromAddress: "support@example.test",
      toRecipients: [{ email: "customer@example.test" }],
      receivedAt: null,
    });
    expect(beforeSync.find((row) => row.direction === "outbound")?.sentAt).toEqual(new Date("2026-10-03T12:00:00Z"));

    client.threadPages = [{ threads: [{ id: "thread-send" }] }];
    client.historyPages = [{
      history: [{ id: "501", messagesAdded: [{ message: { id: "sent-provider-1", threadId: "thread-send" } }] }],
      historyId: "501",
    }];
    const reconciliation = await runIncrementalGmailSync({ integrationId: account.id, client });
    expect(reconciliation.messagesInserted).toBe(0);
    expect(reconciliation.messagesSkipped).toBe(1);
    const afterSync = await getDb().select().from(messages);
    expect(afterSync).toHaveLength(2);
    expect(afterSync.filter((row) => row.direction === "outbound")).toHaveLength(1);
    expect(afterSync.every((row) => row.conversationId === conversationId)).toBe(true);
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

  test("retry reconciles a lost send response without sending the same reply again", async () => {
    const { account, conversationId } = await seedConversation();
    const client = new FixtureGmailClient();
    client.sendError = new GmailHttpError(503, "send response was lost");
    const request = {
      conversationId,
      text: "A reply whose provider response was lost.",
      clientRequestId: "55555555-5555-4555-8555-555555555555",
      client,
    };
    await expect(sendManualGmailReply(request)).rejects.toThrow(/not confirmed as sent/i);
    const mime = await buildReplyMime({
      mailboxEmail: account.emailAddress,
      recipientEmail: "customer@example.test",
      subject: "Need help",
      text: request.text,
      inReplyTo: "<root@example.test>",
      clientRequestId: request.clientRequestId,
    });
    client.searchResults = [{ id: "already-sent", threadId: "thread-send" }];
    client.raws.set("already-sent", rawFixture({
      id: "already-sent",
      threadId: "thread-send",
      from: account.emailAddress,
      to: "customer@example.test",
      subject: "Need help",
      body: request.text,
      messageId: mime.messageIdHeader,
      inReplyTo: "<root@example.test>",
      unread: false,
    }));
    const search = vi.spyOn(client, "searchMessages");

    const result = await sendManualGmailReply(request);
    expect(result).toMatchObject({ status: "sent", deduplicated: true, providerMessageId: "already-sent", providerThreadId: "thread-send" });
    expect(search).toHaveBeenCalledWith(`rfc822msgid:${mime.messageIdHeader}`);
    expect(client.sendCalls).toHaveLength(1);
    const operation = await getOutboundOperation(account.id, request.clientRequestId);
    expect(operation).toMatchObject({ status: "sent", attempt: 2, providerMessageId: "already-sent", providerThreadId: "thread-send", providerErrorCode: null });
    const rows = await getDb().select().from(messages);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.direction === "outbound")).toMatchObject({ conversationId, providerMessageId: "already-sent", textBody: request.text });
    expect((await sendManualGmailReply(request)).deduplicated).toBe(true);
    expect(client.sendCalls).toHaveLength(1);
  });

  test("a failed reply request cannot be reused for a different conversation", async () => {
    const { account, conversationId } = await seedConversation();
    const other = await persistNormalizedMessage(account, await normalizeGmailMessage(rawFixture({
      id: "other-inbound",
      threadId: "other-thread",
      from: "other@example.test",
      to: account.emailAddress,
    }), account.emailAddress));
    const client = new FixtureGmailClient();
    client.sendError = new GmailHttpError(503, "provider unavailable");
    const request = {
      conversationId,
      text: "Reply to the original customer",
      clientRequestId: "77777777-7777-4777-8777-777777777777",
      client,
    };
    await expect(sendManualGmailReply(request)).rejects.toThrow(/not confirmed as sent/i);
    client.sendError = undefined;
    await expect(sendManualGmailReply({ ...request, conversationId: other.conversationId })).rejects.toMatchObject({ status: 409 });
    expect(client.sendCalls).toHaveLength(1);
    expect(await getOutboundOperation(account.id, request.clientRequestId)).toMatchObject({ conversationId, status: "failed", attempt: 1 });
    expect((await getDb().select().from(messages)).filter((row) => row.direction === "outbound")).toHaveLength(0);
  });

  test("retry sends after a definite failure and persists fallback when provider reread fails", async () => {
    const { account, conversationId } = await seedConversation();
    const client = new FixtureGmailClient();
    client.sendError = new GmailHttpError(503, "provider unavailable before send");
    const request = {
      conversationId,
      text: "A successful retry persisted from the send response.",
      clientRequestId: "66666666-6666-4666-8666-666666666666",
      client,
    };
    await expect(sendManualGmailReply(request)).rejects.toThrow(/not confirmed as sent/i);
    client.sendError = undefined;
    const search = vi.spyOn(client, "searchMessages");

    const result = await sendManualGmailReply(request);
    expect(result).toMatchObject({ status: "sent", deduplicated: false, providerMessageId: "sent-provider-1", providerThreadId: "thread-send" });
    expect(search).toHaveBeenCalledTimes(1);
    expect(client.sendCalls).toHaveLength(2);
    const operation = await getOutboundOperation(account.id, request.clientRequestId);
    expect(operation).toMatchObject({ status: "sent", attempt: 2, providerMessageId: "sent-provider-1", providerThreadId: "thread-send", providerErrorCode: null });
    const rows = await getDb().select().from(messages);
    expect(rows).toHaveLength(2);
    const outbound = rows.find((row) => row.direction === "outbound");
    expect(outbound).toMatchObject({
      conversationId,
      providerMessageId: "sent-provider-1",
      providerThreadId: "thread-send",
      textBody: request.text,
      displayTextBody: request.text,
      fromAddress: account.emailAddress,
      receivedAt: null,
      inReplyTo: "<root@example.test>",
    });
    expect(outbound?.sentAt).toBeInstanceOf(Date);
    expect(outbound?.providerMessageIdHeader).toMatch(/^<support-/);
    expect((await sendManualGmailReply(request)).deduplicated).toBe(true);
    expect(client.sendCalls).toHaveLength(2);
  });
});
