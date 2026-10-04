import { createHash } from "node:crypto";
import type { ConversationAnalysis } from "@/lib/domain";
import { triageResultSchema } from "@/server/analysis/contracts";
import { computeTriagePriority } from "@/server/analysis/priority";
import { DEFAULT_OPENAI_MODEL, getTriageProvider, TRIAGE_PROMPT_VERSION, type TriageInput, type TriageProvider } from "@/server/analysis/provider";
import { SupportError } from "@/server/errors";
import { serverLog } from "@/server/logging";
import { createPendingAnalysis, expireInterruptedAnalyses, getInboundAnalysisMessages, getLatestAnalyses, getLatestAnalysis, updateAnalysis, type AnalysisRow } from "@/server/repositories/analyses";
import { getConversationContext } from "@/server/repositories/conversations";

export const TRIAGE_WORKFLOW_VERSION = "triage-workflow-v1";

export function getAnalysisAvailability() {
  const inCI = Boolean(process.env.CI) && process.env.CI !== "false" && process.env.CI !== "0";
  return {
    configured: !inCI && (process.env.AI_PROVIDER?.trim() || "openai") === "openai" && Boolean(process.env.OPENAI_API_KEY?.trim()),
    provider: "openai", model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    requiredKey: "OPENAI_API_KEY",
  };
}

function sourceSnapshot(subject: string, rows: Awaited<ReturnType<typeof getInboundAnalysisMessages>>) {
  const inbound = rows.map((message) => ({
      id: message.id, providerMessageId: message.providerMessageId,
      text: message.displayTextBody || message.textBody,
      occurredAt: (message.receivedAt ?? message.createdAt).toISOString(),
    })).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const sourceHash = createHash("sha256").update(JSON.stringify({ subject, inbound })).digest("hex");
  let budget = 30_000;
  const selected: TriageInput["messages"] = [];
  for (const message of inbound.slice(-20).reverse()) {
    if (budget <= 0) break;
    const text = message.text.slice(0, Math.min(6_000, budget));
    selected.push({ ...message, text });
    budget -= text.length;
  }
  selected.reverse();
  const inputTruncated = subject.length > 1_000 || selected.length !== inbound.length || selected.some((item) => item.text.length !== inbound.find((row) => row.id === item.id)?.text.length);
  return { sourceHash, inbound, inputTruncated, input: { subject: subject.slice(0, 1_000), messages: selected } };
}

async function snapshot(conversationId: string) {
  const context = await getConversationContext(conversationId);
  if (!context) throw new SupportError("not_found", "Conversation was not found", { status: 404 });
  const rows = await getInboundAnalysisMessages([conversationId]);
  return { context, ...sourceSnapshot(context.conversation.subject, rows) };
}

function dto(row: AnalysisRow | undefined, sourceHash: string): ConversationAnalysis {
  const availability = getAnalysisAvailability();
  if (!row) return { status: "pending", configured: availability.configured, stale: false };
  const stale = row.sourceHash !== sourceHash;
  return {
    id: row.id, status: row.status, configured: availability.configured, stale,
    provider: row.provider, model: row.model, promptVersion: row.promptVersion,
    workflowVersion: row.workflowVersion, priorityPolicyVersion: row.priorityPolicyVersion ?? undefined,
    inputTruncated: row.inputTruncated,
    startedAt: row.startedAt?.toISOString(), finishedAt: row.finishedAt?.toISOString(),
    result: !stale && row.status === "completed" ? row.result ?? undefined : undefined,
    priority: !stale && row.status === "completed" ? row.priority ?? undefined : undefined,
    priorityReasons: !stale && row.status === "completed" ? row.priorityReasons : [],
    error: row.errorCode ? { code: row.errorCode, message: row.errorMessage ?? "Analysis failed. Try again." } : undefined,
  };
}

export async function getConversationAnalysis(conversationId: string): Promise<ConversationAnalysis> {
  const source = await snapshot(conversationId);
  // Recover interrupted workers without starting another provider request.
  await expireInterruptedAnalyses(conversationId);
  return dto(await getLatestAnalysis(conversationId), source.sourceHash);
}

export async function getConversationAnalysesForList(conversations: Array<{ id: string; subject: string }>) {
  const ids = conversations.map((item) => item.id);
  await expireInterruptedAnalyses(ids);
  const [messages, analyses] = await Promise.all([getInboundAnalysisMessages(ids), getLatestAnalyses(ids)]);
  const messagesByConversation = new Map<string, typeof messages>();
  for (const message of messages) {
    const items = messagesByConversation.get(message.conversationId) ?? [];
    items.push(message);
    messagesByConversation.set(message.conversationId, items);
  }
  const latest = new Map(analyses.map((row) => [row.conversationId, row]));
  return new Map(conversations.map((item) => [item.id, dto(latest.get(item.id), sourceSnapshot(item.subject, messagesByConversation.get(item.id) ?? []).sourceHash)]));
}

export async function analyzeConversation(conversationId: string, providerOverride?: TriageProvider): Promise<ConversationAnalysis> {
  if (process.env.SUPPORT_DATA_MODE !== "database") {
    throw new SupportError("validation_failed", "Real analysis requires database mode", { status: 409 });
  }
  const source = await snapshot(conversationId);
  if (source.context.conversation.provider !== "gmail") {
    throw new SupportError("validation_failed", "P2A analysis currently supports Gmail conversations", { status: 409 });
  }
  if (!source.inbound.length || !source.input.messages.some((item) => item.text.trim())) {
    throw new SupportError("validation_failed", "Conversation has no inbound text to analyze", { status: 422 });
  }
  // Missing credentials stop here. Never replace the real provider with fixtures.
  const provider = providerOverride ?? getTriageProvider();
  await expireInterruptedAnalyses(conversationId);
  const latest = await getLatestAnalysis(conversationId);
  if (latest?.status === "completed" && latest.sourceHash === source.sourceHash &&
      latest.provider === provider.id && latest.model === provider.model &&
      latest.promptVersion === TRIAGE_PROMPT_VERSION && latest.workflowVersion === TRIAGE_WORKFLOW_VERSION) {
    return dto(latest, source.sourceHash);
  }
  const run = await createPendingAnalysis({
    conversationId, provider: provider.id, model: provider.model,
    promptVersion: TRIAGE_PROMPT_VERSION, workflowVersion: TRIAGE_WORKFLOW_VERSION,
    sourceHash: source.sourceHash, inputMessageIds: source.input.messages.map((item) => item.id),
    inputTruncated: source.inputTruncated,
  });
  if (!run) throw new SupportError("validation_failed", "Analysis is already running for this conversation", { status: 409 });
  await updateAnalysis(run.id, { status: "running", startedAt: new Date() });
  serverLog("triage_started", { analysisId: run.id, conversationId, provider: provider.id, model: provider.model });
  try {
    const response = await provider.analyze(source.input);
    const parsed = triageResultSchema.safeParse(response.result);
    if (!parsed.success) throw new SupportError("validation_failed", "AI output did not match the triage contract", { status: 502 });
    const priority = computeTriagePriority(parsed.data);
    const completed = await updateAnalysis(run.id, {
      status: "completed", result: parsed.data, priority: priority.priority,
      priorityReasons: priority.reasons, priorityPolicyVersion: priority.version,
      providerResponseId: response.providerResponseId ?? null,
      finishedAt: new Date(),
    });
    if (!completed) throw new SupportError("validation_failed", "Analysis expired before completion. Run it again.", { status: 409 });
    // New arrivals during inference invalidate this snapshot immediately.
    const current = await snapshot(conversationId);
    return dto(completed, current.sourceHash);
  } catch (error) {
    const invalid = error instanceof SupportError && error.code === "validation_failed";
    const code = invalid ? "analysis_invalid_output" : "analysis_failed";
    const message = invalid ? "AI analysis could not produce a valid triage result. Try again." : "AI provider did not complete analysis. Try again.";
    await updateAnalysis(run.id, { status: "failed", errorCode: code, errorMessage: message, finishedAt: new Date() });
    // Provider errors can contain private response text or credentials. Never persist/return them.
    throw new SupportError("analysis_failed", message, { status: 502, retryable: true });
  }
}
