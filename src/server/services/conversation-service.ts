import { getConversationAnalysis, getConversationAnalysesForList } from "@/server/services/analysis-service";
import { addressValue } from "@/server/integrations/types";
import type { ConversationDetail, ConversationListItem, ConversationStatus } from "@/lib/domain";
import { getConversationDetail as getMockDetail, getConversationList as getMockList } from "@/lib/mocks/service";
import { SupportError, toSupportError } from "@/server/errors";
import { GmailRestClient } from "@/server/integrations/gmail/gmail-client";
import { normalizeGmailMessage } from "@/server/integrations/gmail/parser";
import { buildReplyMime } from "@/server/integrations/gmail/send";
import type { GmailClient, NormalizedMessage } from "@/server/integrations/gmail/types";
import {
  getConversationContext,
  getConversationMessages,
  getLatestConversationMessage,
  getLatestMessagePreview,
  listConversationRows,
  persistNormalizedMessage,
} from "@/server/repositories/conversations";
import {
  createOrGetOutboundOperation,
  claimOutboundOperation,
  getOutboundOperation,
  markOutboundFailed,
  markOutboundSent,
} from "@/server/repositories/sync";
import { supportDataMode } from "@/server/services/integration-service";
import { serverErrorLog, serverLog } from "@/server/logging";

function status(value: string): ConversationStatus {
  return ["new", "open", "waiting_customer", "waiting_agent", "escalated", "resolved"].includes(value)
    ? value as ConversationStatus
    : "open";
}

export async function getConversationListForCurrentMode(): Promise<ConversationListItem[]> {
  if (supportDataMode() === "mock") return (await getMockList()).map((item) => ({ ...item, source: "mock" as const, providerLabel: "Fixture", analysisState: "simulated" as const }));
  const rows = await listConversationRows();
  const analyses = await getConversationAnalysesForList(rows.map(({ conversation }) => conversation));
  return Promise.all(rows.map(async ({ conversation, customer, integration }) => {
    const analysis = analyses.get(conversation.id)!;
    return ({
      id: conversation.id,
      customer: { id: customer?.id ?? `${conversation.provider}:${conversation.id}`, name: customer?.name ?? customer?.email ?? customer?.phone ?? "Unknown sender" },
      subject: conversation.subject,
      preview: (await getLatestMessagePreview(conversation.id)).slice(0, 180),
      channel: conversation.provider === "whatsapp" ? "whatsapp" as const : "email" as const,
      status: status(conversation.status),
      priority: analysis.priority ?? "untriaged" as const,
      category: analysis.result?.category ?? "Untriaged",
      unread: conversation.unread,
      source: conversation.provider === "whatsapp" ? "whatsapp" as const : "gmail" as const,
      providerLabel: conversation.provider === "whatsapp" ? "WhatsApp" : "Gmail",
      integrationAccountId: integration.id,
      analysisState: analysis.stale ? "pending" as const : analysis.status,
      aiState: "unanalyzed" as const,
      slaRisk: "none" as const,
      updatedAt: conversation.latestMessageAt.toISOString(),
    });
  }));
}

export async function getConversationDetailForCurrentMode(id: string): Promise<ConversationDetail | undefined> {
  if (supportDataMode() === "mock") {
    try {
      const detail = await getMockDetail(id);
      return { ...detail, source: "mock" as const, providerLabel: "Fixture", analysisState: "simulated" as const, replyMode: "mock" as const };
    } catch {
      return undefined;
    }
  }
  const context = await getConversationContext(id);
  if (!context) return undefined;
  const rows = await getConversationMessages(id);
  const analysis = await getConversationAnalysis(id);
  return {
    id: context.conversation.id,
    customer: {
      id: context.customer?.id ?? `${context.conversation.provider}:${context.conversation.id}`,
      name: context.customer?.name ?? context.customer?.email ?? context.customer?.phone ?? "Unknown sender",
      email: context.customer?.email ?? undefined,
      phone: context.customer?.phone ?? undefined,
      priorConversationCount: 0,
      tags: [context.conversation.provider],
    },
    subject: context.conversation.subject,
    status: status(context.conversation.status),
    priority: analysis.priority ?? "untriaged",
    category: analysis.result?.category ?? "Untriaged",
    subcategory: analysis.result?.subcategory ?? undefined,
    source: context.conversation.provider === "whatsapp" ? "whatsapp" : "gmail",
    providerLabel: context.conversation.provider === "whatsapp" ? "WhatsApp" : "Gmail",
    integrationAccountId: context.integration.id,
    providerConversationId: context.conversation.providerConversationId,
    analysisState: analysis.stale ? "pending" : analysis.status,
    analysis,
    replyMode: context.conversation.provider === "gmail" ? "gmail_real" : "unavailable",
    summary: analysis.result?.summary ?? "AI analysis pending. This real provider conversation has not been classified or grounded yet.",
    triageSignals: analysis.result ? [
      ...analysis.result.riskFlags.map((risk) => ({ label: risk, kind: "risk" as const, explanation: `Extracted ${risk} risk; human review required.` })),
      ...(analysis.priorityReasons ?? []).map((reason) => ({ label: "Priority rule", kind: "impact" as const, explanation: reason })),
    ] : [],
    messages: rows.map(({ message, attachments }) => ({
      id: message.id,
      author: message.direction === "outbound" ? "agent" as const : "customer" as const,
      body: message.displayTextBody || message.textBody,
      createdAt: (message.sentAt ?? message.receivedAt ?? message.createdAt).toISOString(),
      direction: message.direction as "inbound" | "outbound",
      from: message.fromAddress ?? undefined,
      to: message.toRecipients.map(addressValue),
      cc: message.ccRecipients.map(addressValue),
      providerMessageId: message.providerMessageId,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })),
      deliveryState: "delivered" as const,
    })),
    evidence: [],
    policyDecisions: [],
    similarConversationIds: [],
  };
}

export async function sendManualGmailReply(input: {
  conversationId: string;
  text: string;
  clientRequestId: string;
  client?: GmailClient;
}) {
  const context = await getConversationContext(input.conversationId);
  if (context && context.integration.provider !== "gmail") {
    throw new SupportError("validation_failed", "Manual WhatsApp replies are not enabled yet", { status: 409 });
  }
  if (!context || !context.integration.emailAddress || context.integration.status !== "connected") {
    throw new SupportError("not_found", "Connected Gmail conversation was not found", { status: 404 });
  }
  const mailboxEmail = context.integration.emailAddress;
  const recipientEmail = context.customer?.email;
  if (!recipientEmail) throw new SupportError("validation_failed", "Conversation has no customer email recipient", { status: 422 });

  const operation = await createOrGetOutboundOperation({
    integrationAccountId: context.integration.id,
    conversationId: context.conversation.id,
    clientRequestId: input.clientRequestId,
  });
  if (!operation) throw new SupportError("database_failed", "Could not create outbound operation");
  if (operation.conversationId !== context.conversation.id) {
    throw new SupportError("validation_failed", "This reply request belongs to another conversation", { status: 409 });
  }
  if (operation.status === "sent") {
    return {
      operationId: operation.id,
      status: "sent" as const,
      providerMessageId: operation.providerMessageId,
      providerThreadId: operation.providerThreadId,
      deduplicated: true,
    };
  }
  const sendingIsStale = operation.status === "sending" && operation.updatedAt.getTime() < Date.now() - 2 * 60_000;
  if (operation.status === "sending" && !sendingIsStale) {
    return {
      operationId: operation.id,
      status: "sending" as const,
      providerMessageId: operation.providerMessageId,
      providerThreadId: operation.providerThreadId,
      deduplicated: true,
    };
  }

  const claim = await claimOutboundOperation(operation.id, operation.status, operation.attempt);
  if (!claim) {
    const current = await getOutboundOperation(context.integration.id, input.clientRequestId);
    return {
      operationId: operation.id,
      status: current?.status === "sent" ? "sent" as const : "sending" as const,
      providerMessageId: current?.providerMessageId,
      providerThreadId: current?.providerThreadId,
      deduplicated: true,
    };
  }

  const lastMessage = await getLatestConversationMessage(context.conversation.id);
  const mime = await buildReplyMime({
    mailboxEmail,
    recipientEmail,
    subject: context.conversation.subject,
    text: input.text,
    inReplyTo: lastMessage?.providerMessageIdHeader,
    references: lastMessage?.referencesHeader ?? [],
    clientRequestId: input.clientRequestId,
  });
  const client = input.client ?? new GmailRestClient(context.integration);

  try {
    // If a previous provider response was lost, search by our deterministic RFC Message-ID before sending again.
    if (claim.attempt > 1) {
      const existing = await client.searchMessages(`rfc822msgid:${mime.messageIdHeader}`);
      if (existing[0]) {
        const rawExisting = await client.getMessage(existing[0].id);
        const normalizedExisting = await normalizeGmailMessage(rawExisting, mailboxEmail);
        await persistNormalizedMessage(context.integration, normalizedExisting);
        await markOutboundSent(operation.id, { providerMessageId: existing[0].id, providerThreadId: existing[0].threadId });
        return {
          operationId: operation.id,
          status: "sent" as const,
          providerMessageId: existing[0].id,
          providerThreadId: existing[0].threadId,
          deduplicated: true,
        };
      }
    }

    const sent = await client.sendMessage({
      raw: mime.raw,
      threadId: context.conversation.providerConversationId,
    });

    try {
      const raw = await client.getMessage(sent.id);
      const normalized = await normalizeGmailMessage(raw, mailboxEmail);
      await persistNormalizedMessage(context.integration, normalized);
    } catch {
      const fallback: NormalizedMessage = {
        provider: "gmail",
        providerMessageId: sent.id,
        providerConversationId: sent.threadId,
        sender: { email: mailboxEmail },
        recipients: [{ email: recipientEmail }],
        cc: [],
        subject: context.conversation.subject,
        text: input.text,
        displayText: input.text,
        html: null,
        attachments: [],
        messageIdHeader: mime.messageIdHeader,
        inReplyTo: lastMessage?.providerMessageIdHeader ?? null,
        references: [...(lastMessage?.referencesHeader ?? []), ...(lastMessage?.providerMessageIdHeader ? [lastMessage.providerMessageIdHeader] : [])],
        occurredAt: new Date(),
        direction: "outbound",
        unread: false,
        untrustedCustomerContent: true,
      };
      await persistNormalizedMessage(context.integration, fallback);
    }

    await markOutboundSent(operation.id, { providerMessageId: sent.id, providerThreadId: sent.threadId });
    serverLog("gmail_reply_sent", { integrationId: context.integration.id, conversationId: context.conversation.id, operationId: operation.id, providerMessageId: sent.id, providerThreadId: sent.threadId, attempt: claim.attempt });
    return {
      operationId: operation.id,
      status: "sent" as const,
      providerMessageId: sent.id,
      providerThreadId: sent.threadId,
      deduplicated: false,
    };
  } catch (error) {
    const normalized = toSupportError(error);
    await markOutboundFailed(operation.id, { errorCode: normalized.code === "unknown" ? "send_failed" : normalized.code, errorMessage: normalized.message });
    serverErrorLog("gmail_reply_failed", { integrationId: context.integration.id, conversationId: context.conversation.id, operationId: operation.id, errorCategory: normalized.code === "unknown" ? "send_failed" : normalized.code, attempt: claim.attempt });
    throw new SupportError("send_failed", "Gmail reply was not confirmed as sent. Retry uses the same idempotency key and checks Gmail before resending.", {
      status: 502,
      retryable: true,
      cause: error,
    });
  }
}

/** Provider dispatch stays server-side; WhatsApp sending awaits the next acceptance stage. */
export async function sendManualReply(input: { conversationId: string; text: string; clientRequestId: string }) {
  return sendManualGmailReply(input);
}
