import { createHmac } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { GET, POST } from "@/app/api/integrations/whatsapp/webhook/route";
import { getDb, getSqlClient } from "@/server/db/client";
import { conversations, integrationAccounts, messages, outboundOperations, participants } from "@/server/db/schema";
import { normalizeGmailMessage } from "@/server/integrations/gmail/parser";
import { parseWhatsAppWebhook } from "@/server/integrations/whatsapp/webhook";
import { getConversationContext, persistNormalizedMessage } from "@/server/repositories/conversations";
import { getConversationDetailForCurrentMode, getConversationListForCurrentMode, sendManualGmailReply } from "@/server/services/conversation-service";
import { getWhatsAppIntegrationStatus, ingestWhatsAppWebhook } from "@/server/services/whatsapp-service";
import { FixtureGmailClient, rawFixture } from "./fixtures/gmail";

const scope = { wabaId: "123456789", phoneNumberId: "987654321" };
const appSecret = "synthetic-whatsapp-app-secret";

function event(messageOverrides: Record<string, unknown> = {}, phoneNumberId = scope.phoneNumberId) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: scope.wabaId, changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: phoneNumberId, display_phone_number: "15557654321" },
      contacts: [{ wa_id: "15551234567", profile: { name: "WhatsApp customer" } }],
      messages: [{ id: "wamid.persistence-1", from: "15551234567", timestamp: "1700000000", type: "text", text: { body: "I was charged twice.\nPlease help." }, ...messageOverrides }],
    } }] }],
  };
}

function parsed(messageOverrides: Record<string, unknown> = {}, phoneNumberId = scope.phoneNumberId) {
  return parseWhatsAppWebhook(event(messageOverrides, phoneNumberId));
}

async function seedWhatsAppAccount(phoneNumberId = scope.phoneNumberId) {
  const [account] = await getDb().insert(integrationAccounts).values({
    provider: "whatsapp", providerAccountId: phoneNumberId, emailAddress: null,
    status: "receiving", grantedScopes: [],
  }).returning();
  return account;
}

function signedRequest(body: string, signature?: string) {
  return new Request("http://localhost:3000/api/integrations/whatsapp/webhook", {
    method: "POST", headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature ?? `sha256=${createHmac("sha256", appSecret).update(Buffer.from(body)).digest("hex")}`,
    }, body,
  });
}

beforeAll(() => {
  // This suite truncates tables. Never point it at the preserved Gmail demo database.
  const databaseName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/undefined").pathname.slice(1);
  const disposableCiDatabase = process.env.CI === "true" && databaseName === "support_intelligence";
  if (!databaseName.endsWith("_test") && !disposableCiDatabase) {
    throw new Error("WhatsApp database tests require a disposable DATABASE_URL ending in _test or the isolated CI service database");
  }
});

beforeEach(async () => {
  vi.stubEnv("SUPPORT_DATA_MODE", "database");
  vi.stubEnv("META_APP_SECRET", appSecret);
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", scope.phoneNumberId);
  vi.stubEnv("WHATSAPP_WABA_ID", scope.wabaId);
  vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "synthetic-verify-token");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Foundation tests must not call external APIs"); }));
  await getSqlClient().unsafe("TRUNCATE TABLE pubsub_notifications, sync_locks, outbound_operations, attachments, messages, conversations, participants, sync_runs, integration_accounts RESTART IDENTITY CASCADE");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider-neutral WhatsApp persistence", () => {
  test("overlapping deliveries persist one conversation and one provider message", async () => {
    const account = await seedWhatsAppAccount();
    const normalized = parsed().messages[0].message;
    const results = await Promise.all(Array.from({ length: 6 }, () => persistNormalizedMessage(account, normalized)));
    expect(results.filter((result) => result.inserted)).toHaveLength(1);
    expect(new Set(results.map((result) => result.conversationId)).size).toBe(1);
    expect(await getDb().select().from(conversations)).toHaveLength(1);
    const rows = await getDb().select().from(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "whatsapp", providerMessageId: normalized.providerMessageId, providerThreadId: "15551234567", fromAddress: "15551234567", textBody: normalized.text, direction: "inbound", sentAt: null });
    expect(rows[0].receivedAt).toEqual(normalized.occurredAt);
    const context = await getConversationContext(results[0].conversationId);
    expect(context?.customer).toMatchObject({ name: "WhatsApp customer", phone: "15551234567", email: null });
    expect(context?.integration.emailAddress).toBeNull();
  });

  test("concurrent distinct arrivals in one phone conversation retain chronological boundaries", async () => {
    const account = await seedWhatsAppAccount();
    const timestamps = [1700000030, 1700000010, 1700000040, 1700000000, 1700000020];
    const results = await Promise.all(timestamps.map((timestamp, index) => persistNormalizedMessage(account, parsed({ id: `wamid.concurrent-${index}`, timestamp: String(timestamp), text: { body: `Message ${timestamp}` } }).messages[0].message)));
    expect(results.every((result) => result.inserted)).toBe(true);
    expect(new Set(results.map((result) => result.conversationId)).size).toBe(1);
    const context = await getConversationContext(results[0].conversationId);
    expect(context?.conversation.firstMessageAt).toEqual(new Date(1700000000 * 1000));
    expect(context?.conversation.latestMessageAt).toEqual(new Date(1700000040 * 1000));
    expect(await getDb().select().from(messages)).toHaveLength(5);
    const detail = await getConversationDetailForCurrentMode(results[0].conversationId);
    expect(detail?.messages.map((message) => message.createdAt)).toEqual([...timestamps].sort((a, b) => a - b).map((timestamp) => new Date(timestamp * 1000).toISOString()));
  });

  test("provider message and conversation IDs are scoped by the integration account", async () => {
    const a = await seedWhatsAppAccount();
    const b = await seedWhatsAppAccount("111222333");
    const aResult = await persistNormalizedMessage(a, parsed().messages[0].message);
    const bResult = await persistNormalizedMessage(b, parsed({}, "111222333").messages[0].message);
    expect(aResult.inserted).toBe(true);
    expect(bResult.inserted).toBe(true);
    expect(aResult.conversationId).not.toBe(bResult.conversationId);
    expect(await getDb().select().from(messages)).toHaveLength(2);
    expect(await getDb().select().from(conversations)).toHaveLength(2);
  });

  test("Gmail and WhatsApp stay isolated even when provider IDs coincide", async () => {
    const whatsapp = await seedWhatsAppAccount();
    const [gmail] = await getDb().insert(integrationAccounts).values({ provider: "gmail", providerAccountId: scope.phoneNumberId, emailAddress: "support@example.test", status: "connected", grantedScopes: [] }).returning();
    const waMessage = parsed().messages[0].message;
    const gmailMessage = await normalizeGmailMessage(rawFixture({ id: waMessage.providerMessageId, threadId: waMessage.providerConversationId, from: "Email customer <customer@example.test>", to: "support@example.test" }), "support@example.test");
    const a = await persistNormalizedMessage(whatsapp, waMessage);
    const b = await persistNormalizedMessage(gmail, gmailMessage);
    expect(a.conversationId).not.toBe(b.conversationId);
    expect(await getDb().select().from(messages)).toHaveLength(2);
    const customers = await getDb().select().from(participants);
    expect(customers).toHaveLength(2);
    expect(customers.find((customer) => customer.phone)?.email).toBeNull();
    expect(customers.find((customer) => customer.email)?.phone).toBeNull();
    await expect(persistNormalizedMessage(gmail, waMessage)).rejects.toMatchObject({ code: "validation_failed" });
    expect(await getDb().select().from(messages)).toHaveLength(2);
  });

  test("unified Inbox exposes WhatsApp and pending analysis without invented evidence or Gmail sending", async () => {
    const account = await seedWhatsAppAccount();
    const persisted = await persistNormalizedMessage(account, parsed().messages[0].message);
    const list = await getConversationListForCurrentMode();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ source: "whatsapp", providerLabel: "WhatsApp", channel: "whatsapp", priority: "untriaged", analysisState: "pending", aiState: "unanalyzed" });
    const detail = await getConversationDetailForCurrentMode(persisted.conversationId);
    expect(detail).toMatchObject({ source: "whatsapp", providerLabel: "WhatsApp", replyMode: "unavailable", customer: { name: "WhatsApp customer", phone: "15551234567" }, analysisState: "pending" });
    expect(detail?.customer.email).toBeUndefined();
    expect(detail?.evidence).toEqual([]);
    expect(detail?.policyDecisions).toEqual([]);
    expect(detail?.aiDraft).toBeUndefined();
    const gmailClient = new FixtureGmailClient();
    await expect(sendManualGmailReply({ conversationId: persisted.conversationId, text: "Must not send", clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", client: gmailClient })).rejects.toThrow();
    expect(gmailClient.sendCalls).toHaveLength(0);
    expect(await getDb().select().from(outboundOperations)).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("WhatsApp ingest service and official webhook boundary", () => {
  test("ingestion counts repeats and creates only a receiving integration without a send token", async () => {
    expect(await getWhatsAppIntegrationStatus()).toMatchObject({ connected: false, replyEnabled: false, storedMessages: 0, realAcceptance: "not_verified" });
    expect(await ingestWhatsAppWebhook(parsed(), scope)).toMatchObject({ inserted: 1, duplicates: 0 });
    expect(await ingestWhatsAppWebhook(parsed(), scope)).toMatchObject({ inserted: 0, duplicates: 1 });
    const accounts = await getDb().select().from(integrationAccounts);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ provider: "whatsapp", providerAccountId: scope.phoneNumberId, status: "receiving", emailAddress: null, grantedScopes: [] });
    expect(await getWhatsAppIntegrationStatus()).toMatchObject({ connected: false, replyEnabled: false, status: "inbound_received", storedMessages: 1, realAcceptance: "not_verified" });
    expect(await getDb().select().from(outboundOperations)).toEqual([]);
  });

  test("wrong phone or WABA scope is safely ignored without persistence", async () => {
    expect(await ingestWhatsAppWebhook(parsed(), { ...scope, phoneNumberId: "999999999" })).toEqual({ inserted: 0, duplicates: 0, ignored: 1 });
    expect(await ingestWhatsAppWebhook(parsed(), { ...scope, wabaId: "999999999" })).toEqual({ inserted: 0, duplicates: 0, ignored: 1 });
    expect(await getDb().select().from(integrationAccounts)).toEqual([]);
    expect(await getDb().select().from(messages)).toEqual([]);
  });

  test("valid signature ingests and retries deduplicate without outbound activity", async () => {
    const body = JSON.stringify(event());
    const first = await POST(signedRequest(body));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ inserted: 1, duplicates: 0 });
    const second = await POST(signedRequest(body));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ inserted: 0, duplicates: 1 });
    expect(await getDb().select().from(messages)).toHaveLength(1);
    expect(await getDb().select().from(outboundOperations)).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("unsigned or tampered payloads cannot create accounts or messages", async () => {
    const body = JSON.stringify(event());
    const unsigned = await POST(new Request("http://localhost/api/integrations/whatsapp/webhook", { method: "POST", body }));
    const tampered = await POST(signedRequest(body, `sha256=${"0".repeat(64)}`));
    expect(unsigned.status).toBe(403);
    expect(tampered.status).toBe(403);
    expect(await getDb().select().from(integrationAccounts)).toEqual([]);
    expect(await getDb().select().from(messages)).toEqual([]);
  });

  test("malformed signed JSON is rejected while another account's signed event is acknowledged and ignored", async () => {
    const malformed = await POST(signedRequest("{"));
    expect(malformed.status).toBe(400);
    const wrongPhone = await POST(signedRequest(JSON.stringify(event({}, "999999999"))));
    expect(wrongPhone.status).toBe(200);
    expect(await wrongPhone.json()).toEqual({ inserted: 0, duplicates: 0, ignored: 1 });
    expect(await getDb().select().from(messages)).toEqual([]);
    expect(await getDb().select().from(integrationAccounts)).toEqual([]);
  });

  test("a signed mixed-account batch ingests only the configured phone and WABA", async () => {
    const batch = event();
    batch.entry.push(event({ id: "wamid.other-phone" }, "111222333").entry[0]);
    const otherWaba = event({ id: "wamid.other-waba" }).entry[0];
    otherWaba.id = "999888777";
    batch.entry.push(otherWaba);
    const response = await POST(signedRequest(JSON.stringify(batch)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inserted: 1, duplicates: 0, ignored: 2 });
    expect(await getDb().select().from(integrationAccounts)).toHaveLength(1);
    const rows = await getDb().select().from(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0].providerMessageId).toBe("wamid.persistence-1");
  });

  test("unsupported media and status notifications are acknowledged without invented rows", async () => {
    const body = event({ type: "image", image: { id: "unsupported-media" } });
    const response = await POST(signedRequest(JSON.stringify(body)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ inserted: 0, ignored: 1 });
    expect(await getDb().select().from(messages)).toEqual([]);
    expect(await getDb().select().from(outboundOperations)).toEqual([]);
  });

  test("oversized raw requests are rejected before ingestion", async () => {
    const oversized = await POST(signedRequest(" ".repeat(1_048_577)));
    expect(oversized.status).toBe(413);
    expect(await getDb().select().from(messages)).toEqual([]);
  });

  test("missing signature configuration fails closed rather than accepting unsigned data", async () => {
    vi.stubEnv("META_APP_SECRET", "");
    const response = await POST(signedRequest(JSON.stringify(event())));
    expect(response.status).toBe(503);
    expect(await getDb().select().from(integrationAccounts)).toEqual([]);
  });

  test("GET verification echoes challenge only for the configured token", async () => {
    const url = "https://example.test/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=123456789";
    const valid = await GET(new Request(url));
    expect(valid.status).toBe(200);
    expect(await valid.text()).toBe("123456789");
    expect((await GET(new Request(url.replace("synthetic-verify-token", "wrong-token")))).status).toBe(403);
    expect(await getDb().select().from(integrationAccounts)).toEqual([]);
  });
});
