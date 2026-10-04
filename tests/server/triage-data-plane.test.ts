import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/conversations/[conversationId]/analysis/route";
import { POST } from "@/app/api/conversations/[conversationId]/analyze/route";
import type { ProviderAttempt, TriageInput, TriageProvider, TriageResult } from "@/server/analysis/contracts";
import { ProviderError } from "@/server/analysis/provider";
import { closeDatabase, getDb, getSqlClient } from "@/server/db/client";
import { conversationAnalyses, integrationAccounts, messages, outboundOperations } from "@/server/db/schema";
import { normalizeGmailMessage } from "@/server/integrations/gmail/parser";
import { parseWhatsAppWebhook } from "@/server/integrations/whatsapp/webhook";
import { persistNormalizedMessage } from "@/server/repositories/conversations";
import { analyzeConversation, getAnalysisAvailability, getConversationAnalysis } from "@/server/services/analysis-service";
import { getConversationDetailForCurrentMode, getConversationListForCurrentMode } from "@/server/services/conversation-service";
import { rawFixture } from "./fixtures/gmail";

const billingResult: TriageResult = {
  language: "English", category: "Billing", subcategory: "Duplicate charge", intent: "duplicate_charge",
  entities: [{ type: "order_id", value: "10452" }], riskFlags: ["financial"], impact: "individual",
  customerBlocked: true, requestedAction: "Refund the duplicate charge", route: "billing_support",
  summary: "Customer reports a duplicate charge for order 10452 and says they cannot proceed.",
};

function fakeProvider(result: unknown = billingResult, model = "fake-triage") {
  const analyze = vi.fn(async (_input: TriageInput) => ({ result, providerResponseId: "synthetic-response-id" }));
  return { id: "fake", model, analyze } satisfies TriageProvider;
}

function fakeFallbackProvider(configuration = "synthetic-chain-v1", servedModel = "gemini-2.5-flash") {
  const attempts: ProviderAttempt[] = [
    { provider: "groq", model: "openai/gpt-oss-120b", status: "failed", latencyMs: 7, errorCode: "rate_limited" },
    { provider: "gemini", model: servedModel, status: "completed", latencyMs: 17 },
  ];
  const analyze = vi.fn(async (_input: TriageInput) => ({
    result: billingResult, provider: "gemini", model: servedModel, providerResponseId: "synthetic-gemini-response",
    latencyMs: 24, usage: { inputTokens: 42, outputTokens: 19 }, attempts,
  }));
  return { id: "orchestrator", model: configuration, analyze } satisfies TriageProvider;
}

async function seedGmail() {
  const [account] = await getDb().insert(integrationAccounts).values({
    provider: "gmail", providerAccountId: "support@example.test", emailAddress: "support@example.test",
    status: "connected", grantedScopes: [],
  }).returning();
  return account;
}

async function seedConversation() {
  const account = await seedGmail();
  const inbound = await normalizeGmailMessage(rawFixture({
    id: "triage-inbound-1", threadId: "triage-thread-1", from: "Customer <customer@example.test>", to: "support@example.test",
    subject: "Duplicate charge", body: "I was charged twice for order #10452 and cannot proceed. Please refund the duplicate charge.",
  }), "support@example.test");
  const persisted = await persistNormalizedMessage(account, inbound);
  return { account, conversationId: persisted.conversationId, messageId: persisted.messageId! };
}

async function addInbound(account: Awaited<ReturnType<typeof seedGmail>>, id = "triage-inbound-2", body = "The duplicate charge is still blocking me.") {
  const normalized = await normalizeGmailMessage(rawFixture({ id, threadId: "triage-thread-1", from: "customer@example.test", to: "support@example.test", subject: "Duplicate charge", body }), "support@example.test");
  return persistNormalizedMessage(account, normalized);
}

function routeContext(conversationId: string) {
  return { params: Promise.resolve({ conversationId }) };
}

function analysisRequest(conversationId: string) {
  return new Request(`http://localhost:3000/api/conversations/${conversationId}/analyze`, { method: "POST" });
}

beforeAll(() => {
  const databaseName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/undefined").pathname.slice(1);
  const disposableCiDatabase = process.env.CI === "true" && databaseName === "support_intelligence";
  if (!databaseName.endsWith("_test") && !disposableCiDatabase) {
    throw new Error("Triage database tests require a disposable DATABASE_URL ending in _test or the isolated CI service database");
  }
});

beforeEach(async () => {
  vi.stubEnv("SUPPORT_DATA_MODE", "database");
  for (const name of ["AI_PRIMARY_PROVIDER", "GROQ_API_KEY", "GEMINI_API_KEY", "HF_TOKEN", "GROQ_MODEL", "GEMINI_MODEL", "HF_MODEL", "AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL"]) {
    vi.stubEnv(name, "");
  }
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Database regression tests must not call external APIs"); }));
  await getSqlClient().unsafe("TRUNCATE TABLE conversation_analyses, pubsub_notifications, sync_locks, outbound_operations, attachments, messages, conversations, participants, sync_runs, integration_accounts RESTART IDENTITY CASCADE");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("persisted triage facts and deterministic priority", () => {
  test("validated facts become Billing/High in the existing Inbox without evidence, drafts, sending or message mutation", async () => {
    const { conversationId, messageId } = await seedConversation();
    const before = await getDb().select().from(messages);
    const provider = fakeProvider();
    const result = await analyzeConversation(conversationId, provider);
    expect(result).toMatchObject({ status: "completed", stale: false, provider: "fake", model: "fake-triage", priority: "high", result: billingResult });
    expect(result.priorityReasons?.length).toBeGreaterThan(0);
    expect(provider.analyze).toHaveBeenCalledOnce();
    expect(provider.analyze.mock.calls[0][0].messages).toHaveLength(1);
    expect(provider.analyze.mock.calls[0][0].messages[0].id).toBe(messageId);
    const [run] = await getDb().select().from(conversationAnalyses);
    expect(run).toMatchObject({ conversationId, status: "completed", provider: "fake", model: "fake-triage", inputMessageIds: [messageId], inputTruncated: false, result: billingResult, priority: "high", providerResponseId: "synthetic-response-id" });
    expect(run.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(run.promptVersion).toBeTruthy();
    expect(run.workflowVersion).toBeTruthy();
    expect(run.priorityPolicyVersion).toBeTruthy();
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.finishedAt).toBeInstanceOf(Date);
    const detail = await getConversationDetailForCurrentMode(conversationId);
    expect(detail).toMatchObject({ source: "gmail", category: "Billing", subcategory: "Duplicate charge", priority: "high", analysisState: "completed", summary: billingResult.summary, analysis: { result: { language: "English" } } });
    expect(detail?.evidence).toEqual([]);
    expect(detail?.policyDecisions).toEqual([]);
    expect(detail?.aiDraft).toBeUndefined();
    expect(await getConversationListForCurrentMode()).toEqual([expect.objectContaining({ id: conversationId, category: "Billing", priority: "high", analysisState: "completed" })]);
    expect(await getDb().select().from(messages)).toEqual(before);
    expect(await getDb().select().from(outboundOperations)).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("completed results and metadata survive closing and reopening the database connection", async () => {
    const { conversationId } = await seedConversation();
    const completed = await analyzeConversation(conversationId, fakeProvider());
    await closeDatabase();
    const recovered = await getConversationAnalysis(conversationId);
    expect(recovered).toMatchObject({ id: completed.id, status: "completed", stale: false, result: billingResult, priority: "high", promptVersion: completed.promptVersion, workflowVersion: completed.workflowVersion });
  });

  test("financial risk with a blocked customer is High for refund requests and permits an unknown requested action", async () => {
    const { conversationId } = await seedConversation();
    const facts = { ...billingResult, intent: "refund_request", requestedAction: null };
    const completed = await analyzeConversation(conversationId, fakeProvider(facts));
    expect(completed).toMatchObject({ status: "completed", priority: "high", result: { intent: "refund_request", requestedAction: null } });
    const [run] = await getDb().select().from(conversationAnalyses);
    expect(run.priority).toBe("high");
    expect(run.result?.requestedAction).toBeNull();
  });

  test("a repeated run of unchanged input and versions reuses the persisted result", async () => {
    const { conversationId } = await seedConversation();
    const provider = fakeProvider();
    const first = await analyzeConversation(conversationId, provider);
    const second = await analyzeConversation(conversationId, provider);
    expect(second.id).toBe(first.id);
    expect(provider.analyze).toHaveBeenCalledOnce();
    expect(await getDb().select().from(conversationAnalyses)).toHaveLength(1);
  });

  test("changing the provider model creates a new versioned run", async () => {
    const { conversationId } = await seedConversation();
    const first = await analyzeConversation(conversationId, fakeProvider());
    const changed = fakeProvider(billingResult, "fake-triage-v2");
    const second = await analyzeConversation(conversationId, changed);
    expect(second.id).not.toBe(first.id);
    expect(second.model).toBe("fake-triage-v2");
    expect(changed.analyze).toHaveBeenCalledOnce();
    expect(await getDb().select().from(conversationAnalyses)).toHaveLength(2);
  });

  test("actual fallback provider metadata persists and unchanged orchestration configuration reuses the result", async () => {
    const { conversationId, messageId } = await seedConversation();
    const orchestrator = fakeFallbackProvider();
    const first = await analyzeConversation(conversationId, orchestrator);
    const metadata = {
      provider: "gemini", model: "gemini-2.5-flash", providerResponseId: "synthetic-gemini-response",
      configurationVersion: "orchestrator:synthetic-chain-v1", latencyMs: 24,
      usage: { inputTokens: 42, outputTokens: 19 }, inputMessageIds: [messageId],
      providerAttempts: [
        { provider: "groq", model: "openai/gpt-oss-120b", status: "failed", latencyMs: 7, errorCode: "rate_limited" },
        { provider: "gemini", model: "gemini-2.5-flash", status: "completed", latencyMs: 17 },
      ],
    };
    expect(first).toMatchObject({ status: "completed", ...metadata });
    const [row] = await getDb().select().from(conversationAnalyses);
    expect(row).toMatchObject(metadata);
    expect(first.sourceHash).toBe(row.sourceHash);
    const second = await analyzeConversation(conversationId, orchestrator);
    expect(second).toMatchObject({ id: first.id, ...metadata });
    expect(orchestrator.analyze).toHaveBeenCalledOnce();
    expect(await getDb().select().from(conversationAnalyses)).toHaveLength(1);
    await closeDatabase();
    expect(await getConversationAnalysis(conversationId)).toMatchObject({ id: first.id, ...metadata });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("an orchestration model configuration change permits fresh inference after a fallback completion", async () => {
    const { conversationId } = await seedConversation();
    const first = await analyzeConversation(conversationId, fakeFallbackProvider());
    const changed = fakeFallbackProvider("synthetic-chain-v2", "synthetic-gemini-model-v2");
    const second = await analyzeConversation(conversationId, changed);
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ provider: "gemini", model: "synthetic-gemini-model-v2", configurationVersion: "orchestrator:synthetic-chain-v2" });
    expect(changed.analyze).toHaveBeenCalledOnce();
    expect(await getDb().select().from(conversationAnalyses)).toHaveLength(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("new inbound messages invalidate old facts until an explicit new analysis", async () => {
    const { account, conversationId } = await seedConversation();
    const provider = fakeProvider();
    const first = await analyzeConversation(conversationId, provider);
    await addInbound(account);
    expect(await getConversationAnalysis(conversationId)).toMatchObject({ id: first.id, status: "completed", stale: true, result: undefined, priority: undefined });
    expect(await getConversationDetailForCurrentMode(conversationId)).toMatchObject({ category: "Untriaged", priority: "untriaged", analysisState: "pending" });
    const second = await analyzeConversation(conversationId, provider);
    expect(second.id).not.toBe(first.id);
    expect(second.stale).toBe(false);
    expect(provider.analyze).toHaveBeenCalledTimes(2);
    expect(provider.analyze.mock.calls[1][0].messages).toHaveLength(2);
  });

  test("changed inbound body invalidates the source hash even when provider message IDs are unchanged", async () => {
    const { conversationId, messageId } = await seedConversation();
    const provider = fakeProvider();
    await analyzeConversation(conversationId, provider);
    await getDb().update(messages).set({ textBody: "Updated customer facts", displayTextBody: "Updated customer facts" }).where(eq(messages.id, messageId));
    expect((await getConversationAnalysis(conversationId)).stale).toBe(true);
    await analyzeConversation(conversationId, provider);
    const runs = await getDb().select().from(conversationAnalyses);
    expect(runs).toHaveLength(2);
    expect(new Set(runs.map((run) => run.sourceHash)).size).toBe(2);
    expect(runs.every((run) => run.inputMessageIds[0] === messageId)).toBe(true);
  });

  test("outbound messages never enter triage input or invalidate completed inbound facts", async () => {
    const { account, conversationId } = await seedConversation();
    const provider = fakeProvider();
    const first = await analyzeConversation(conversationId, provider);
    const outbound = await normalizeGmailMessage(rawFixture({ id: "triage-outbound-1", threadId: "triage-thread-1", from: "support@example.test", to: "customer@example.test", subject: "Duplicate charge", body: "A manual operator reply." }), "support@example.test");
    await persistNormalizedMessage(account, outbound);
    expect((await getConversationAnalysis(conversationId)).stale).toBe(false);
    expect((await analyzeConversation(conversationId, provider)).id).toBe(first.id);
    expect(provider.analyze).toHaveBeenCalledOnce();
    expect(provider.analyze.mock.calls[0][0].messages).toHaveLength(1);
  });

  test("large customer histories are bounded and truncation provenance is persisted", async () => {
    const { account, conversationId } = await seedConversation();
    for (let index = 0; index < 6; index += 1) {
      await addInbound(account, `triage-long-${index}`, `Customer facts ${index}: ${"x".repeat(8_000)}`);
    }
    const before = await getDb().select().from(messages);
    const provider = fakeProvider();
    const completed = await analyzeConversation(conversationId, provider);
    const input = provider.analyze.mock.calls[0][0];
    expect(input.messages.length).toBeLessThanOrEqual(20);
    expect(input.messages.reduce((total, message) => total + message.text.length, 0)).toBeLessThanOrEqual(30_000);
    expect(input.messages.every((message) => message.text.length <= 6_000)).toBe(true);
    expect(completed.inputTruncated).toBe(true);
    const [run] = await getDb().select().from(conversationAnalyses);
    expect(run.inputTruncated).toBe(true);
    expect(run.inputMessageIds).toEqual(input.messages.map((message) => message.id));
    expect(await getDb().select().from(messages)).toEqual(before);
  });
});

describe("triage lifecycle, concurrency and failure recovery", () => {
  test("running state is persisted and visible, while overlapping explicit runs are refused", async () => {
    const { conversationId } = await seedConversation();
    let release!: () => void;
    let started!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const provider: TriageProvider = { id: "fake", model: "fake-triage", async analyze() { started(); await wait; return { result: billingResult }; } };
    const running = analyzeConversation(conversationId, provider);
    await startedPromise;
    try {
      expect(await getConversationAnalysis(conversationId)).toMatchObject({ status: "running", result: undefined, priority: undefined });
      expect(await getConversationDetailForCurrentMode(conversationId)).toMatchObject({ analysisState: "running", priority: "untriaged" });
      await expect(analyzeConversation(conversationId, provider)).rejects.toMatchObject({ status: 409 });
      expect(await getDb().select().from(conversationAnalyses)).toHaveLength(1);
    } finally { release(); }
    expect((await running).status).toBe("completed");
  });

  test("a new inbound arrival during inference makes completion stale immediately", async () => {
    const { account, conversationId } = await seedConversation();
    let release!: () => void;
    let started!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const provider: TriageProvider = { id: "fake", model: "fake-triage", async analyze() { started(); await wait; return { result: billingResult }; } };
    const running = analyzeConversation(conversationId, provider);
    await startedPromise;
    try { await addInbound(account); } finally { release(); }
    expect(await running).toMatchObject({ status: "completed", stale: true, result: undefined, priority: undefined });
    expect(await getConversationDetailForCurrentMode(conversationId)).toMatchObject({ category: "Untriaged", priority: "untriaged", analysisState: "pending" });
  });

  test("provider-supplied priority is rejected rather than accepted as a classification fact", async () => {
    const { conversationId } = await seedConversation();
    await expect(analyzeConversation(conversationId, fakeProvider({ ...billingResult, priority: "critical" }))).rejects.toMatchObject({ code: "analysis_failed", status: 502 });
    const [run] = await getDb().select().from(conversationAnalyses);
    expect(run).toMatchObject({ status: "failed", errorCode: "analysis_invalid_output", result: null, priority: null });
    expect(await getConversationDetailForCurrentMode(conversationId)).toMatchObject({ category: "Untriaged", priority: "untriaged", analysisState: "failed" });
  });

  test("private provider failures are not persisted or returned, and a deliberate retry can complete", async () => {
    const { conversationId } = await seedConversation();
    const privateFailure = "sk-synthetic-private-token customer-private@example.test raw provider payload";
    const broken: TriageProvider = { id: "fake", model: "fake-triage", async analyze() { throw new Error(privateFailure); } };
    await expect(analyzeConversation(conversationId, broken)).rejects.toMatchObject({ code: "analysis_failed", status: 502, retryable: true });
    const failed = await getConversationAnalysis(conversationId);
    expect(failed.status).toBe("failed");
    expect(JSON.stringify(failed)).not.toContain(privateFailure);
    const [failedRun] = await getDb().select().from(conversationAnalyses);
    expect(failedRun.errorCode).toBe("analysis_failed");
    expect(failedRun.errorMessage).not.toContain("sk-synthetic");
    expect(failedRun.errorMessage).not.toContain("customer-private");
    const completed = await analyzeConversation(conversationId, fakeProvider());
    expect(completed.status).toBe("completed");
    expect(completed.id).not.toBe(failed.id);
    expect(await getDb().select().from(conversationAnalyses)).toHaveLength(2);
    expect(await getDb().select().from(outboundOperations)).toEqual([]);
  });

  test("authentication failures retain a safe category without exposing provider secrets or encouraging automatic retries", async () => {
    const { conversationId } = await seedConversation();
    const privateMessage = "provider 401 sk-synthetic-private-key private-customer@example.test";
    const providerError = new ProviderError("authentication", { provider: "groq", model: "openai/gpt-oss-120b", status: 401 });
    providerError.message = privateMessage;
    const analyze = vi.fn(async () => { throw providerError; });
    const provider: TriageProvider = { id: "groq", model: "openai/gpt-oss-120b", analyze };
    const failure = await analyzeConversation(conversationId, provider).catch((error: unknown) => error);
    expect(failure).toMatchObject({ retryable: false });
    expect(String(failure)).not.toContain("sk-synthetic");
    expect(String(failure)).not.toContain("private-customer");
    expect(analyze).toHaveBeenCalledOnce();
    const [row] = await getDb().select().from(conversationAnalyses);
    expect(row.status).toBe("failed");
    expect(row.errorCode).toMatch(/authentication/);
    expect(row.errorMessage).not.toContain("sk-synthetic");
    expect(row.errorMessage).not.toContain("private-customer");
    const dto = await getConversationAnalysis(conversationId);
    expect(dto.error?.code).toMatch(/authentication/);
    expect(JSON.stringify(dto)).not.toContain("sk-synthetic");
    expect(await getDb().select().from(outboundOperations)).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("expired running rows survive a restart and are failed before an explicit retry", async () => {
    const { conversationId } = await seedConversation();
    const completed = await analyzeConversation(conversationId, fakeProvider());
    const expired = new Date(Date.now() - 4 * 60_000);
    await getDb().update(conversationAnalyses).set({ status: "running", startedAt: expired, updatedAt: expired, finishedAt: null, result: null, priority: null }).where(eq(conversationAnalyses.id, completed.id!));
    await closeDatabase();
    const retried = await analyzeConversation(conversationId, fakeProvider());
    expect(retried.status).toBe("completed");
    expect(retried.id).not.toBe(completed.id);
    const [interrupted] = await getDb().select().from(conversationAnalyses).where(eq(conversationAnalyses.id, completed.id!));
    expect(interrupted).toMatchObject({ status: "failed", errorCode: "analysis_interrupted" });
  });

  test("GET recovers an interrupted persisted run without inference and permits explicit retry", async () => {
    const { conversationId, messageId } = await seedConversation();
    const expired = new Date(Date.now() - 4 * 60_000);
    const [running] = await getDb().insert(conversationAnalyses).values({
      conversationId, status: "running", provider: "fake", model: "fake-triage",
      promptVersion: "synthetic-interrupted-prompt", workflowVersion: "synthetic-interrupted-workflow",
      sourceHash: "0".repeat(64), inputMessageIds: [messageId],
      createdAt: expired, startedAt: expired, updatedAt: expired,
    }).returning();
    const provider = fakeProvider();
    const response = await GET(new Request(`http://localhost:3000/api/conversations/${conversationId}/analysis`), routeContext(conversationId));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: running.id, status: "failed", error: { code: "analysis_interrupted" } });
    const recovered = await getConversationAnalysis(conversationId);
    expect(recovered).toMatchObject({ id: running.id, status: "failed", error: { code: "analysis_interrupted" } });
    const [persisted] = await getDb().select().from(conversationAnalyses).where(eq(conversationAnalyses.id, running.id));
    expect(persisted.status).toBe("failed");
    expect(persisted.errorCode).toBe("analysis_interrupted");
    expect(persisted.finishedAt).toBeInstanceOf(Date);
    expect(provider.analyze).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const retry = await analyzeConversation(conversationId, provider);
    expect(retry).toMatchObject({ status: "completed", stale: false });
    expect(retry.id).not.toBe(running.id);
    expect(provider.analyze).toHaveBeenCalledOnce();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("real triage boundaries and HTTP configuration errors", () => {
  test("availability exposes metadata only and a missing key never calls a provider or creates a run", async () => {
    const { conversationId } = await seedConversation();
    const availability = getAnalysisAvailability();
    expect(availability).toMatchObject({ configured: false, provider: "groq", requiredKey: "GROQ_API_KEY" });
    expect(availability).not.toHaveProperty("apiKey");
    const originalCi = process.env.CI;
    vi.stubEnv("CI", "false");
    vi.stubEnv("GROQ_API_KEY", "synthetic-availability-only-key");
    expect(getAnalysisAvailability().configured).toBe(true);
    expect(JSON.stringify(getAnalysisAvailability())).not.toContain("synthetic-availability-only-key");
    for (const ciValue of ["1", "yes"]) {
      vi.stubEnv("CI", ciValue);
      expect(getAnalysisAvailability().configured).toBe(false);
    }
    vi.stubEnv("CI", originalCi ?? "");
    vi.stubEnv("GROQ_API_KEY", "");
    await expect(analyzeConversation(conversationId)).rejects.toMatchObject({ code: "configuration_missing", status: 503 });
    const response = await POST(analysisRequest(conversationId), routeContext(conversationId));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "configuration_missing" });
    expect(await getDb().select().from(conversationAnalyses)).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("GET returns pending, unconfigured state for a persisted conversation", async () => {
    const { conversationId } = await seedConversation();
    const response = await GET(new Request(`http://localhost:3000/api/conversations/${conversationId}/analysis`), routeContext(conversationId));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "pending", configured: false, stale: false });
    expect(await getDb().select().from(conversationAnalyses)).toEqual([]);
  });

  test.each(["conv-00001", "00000000-0000-4000-8000-000000000000"])("invalid or missing conversation %s returns 404 without inference", async (conversationId) => {
    const provider = fakeProvider();
    await expect(analyzeConversation(conversationId, provider)).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect((await POST(analysisRequest(conversationId), routeContext(conversationId))).status).toBe(404);
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  test("WhatsApp is refused explicitly instead of flowing through the Gmail triage workflow", async () => {
    const [account] = await getDb().insert(integrationAccounts).values({ provider: "whatsapp", providerAccountId: "987654321", emailAddress: null, grantedScopes: [], status: "receiving" }).returning();
    const normalized = parseWhatsAppWebhook({ object: "whatsapp_business_account", entry: [{ id: "123456789", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "987654321" }, messages: [{ id: "wamid.triage-unsupported", from: "15551234567", timestamp: "1700000000", type: "text", text: { body: "A WhatsApp question" } }] } }] }] }).messages[0].message;
    const { conversationId } = await persistNormalizedMessage(account, normalized);
    const provider = fakeProvider();
    await expect(analyzeConversation(conversationId, provider)).rejects.toMatchObject({ status: 409 });
    expect(provider.analyze).not.toHaveBeenCalled();
    expect(await getDb().select().from(conversationAnalyses)).toEqual([]);
  });

  test("mock mode refuses real analysis even when an explicit fake test provider is supplied", async () => {
    const { conversationId } = await seedConversation();
    vi.stubEnv("SUPPORT_DATA_MODE", "mock");
    const provider = fakeProvider();
    await expect(analyzeConversation(conversationId, provider)).rejects.toMatchObject({ status: 409 });
    expect((await POST(analysisRequest(conversationId), routeContext(conversationId))).status).toBe(409);
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  test("an outbound-only conversation is not analyzed as customer content", async () => {
    const account = await seedGmail();
    const outbound = await normalizeGmailMessage(rawFixture({ id: "triage-only-outbound", threadId: "triage-thread-outbound", from: "support@example.test", to: "customer@example.test", body: "Operator message" }), "support@example.test");
    const { conversationId } = await persistNormalizedMessage(account, outbound);
    const provider = fakeProvider();
    await expect(analyzeConversation(conversationId, provider)).rejects.toMatchObject({ status: 422 });
    expect(provider.analyze).not.toHaveBeenCalled();
    expect(await getDb().select().from(conversationAnalyses)).toEqual([]);
  });
});
