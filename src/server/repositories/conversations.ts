import { SupportError } from "@/server/errors";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { isDatabaseConversationId } from "@/lib/conversation-selection";
import {
  attachments,
  conversations,
  integrationAccounts,
  messages,
  participants,
} from "@/server/db/schema";
import { addressValue, type NormalizedAddress, type NormalizedMessage } from "@/server/integrations/types";
import type { IntegrationAccountRow } from "@/server/repositories/integrations";

function customerAddress(message: NormalizedMessage, account: IntegrationAccountRow): NormalizedAddress | undefined {
  if (message.direction === "inbound") return message.sender;
  return message.recipients.find((item) => addressValue(item).toLowerCase() !== (account.emailAddress ?? account.providerAccountId).toLowerCase());
}

export async function persistNormalizedMessage(account: IntegrationAccountRow, normalized: NormalizedMessage) {
  if (account.provider !== normalized.provider) {
    throw new SupportError("validation_failed", "Message provider does not match the integration account", { status: 422 });
  }
  return getDb().transaction(async (tx) => {
    const customer = customerAddress(normalized, account);
    let customerParticipantId: string | null = null;

    if (customer) {
      const email = customer.email?.toLowerCase() ?? null;
      const phone = customer.phone ?? null;
      const name = customer.name ?? addressValue(customer);
      const providerIdentity = normalized.provider === "gmail"
        ? `gmail:${email}`
        : `whatsapp:${account.providerAccountId}:${phone}`;
      const [participant] = await tx
        .insert(participants)
        .values({
          name, email, phone,
          providerIdentity,
        })
        .onConflictDoUpdate({
          target: participants.providerIdentity,
          set: { name, email, phone },
        })
        .returning();
      customerParticipantId = participant.id;
    }

    // The upsert locks this conversation while the message and timestamps are updated.
    // Concurrent webhook retries cannot race the initial conversation insert.
    const [conversation] = await tx.insert(conversations).values({
      integrationAccountId: account.id,
      provider: normalized.provider,
      providerConversationId: normalized.providerConversationId,
      subject: normalized.subject,
      status: "new",
      customerParticipantId,
      firstMessageAt: normalized.occurredAt,
      latestMessageAt: normalized.occurredAt,
      unread: normalized.unread,
    }).onConflictDoUpdate({
      target: [conversations.integrationAccountId, conversations.providerConversationId],
      set: { provider: normalized.provider },
    }).returning();

    const [inserted] = await tx
      .insert(messages)
      .values({
        integrationAccountId: account.id,
        conversationId: conversation.id,
        provider: normalized.provider,
        providerMessageId: normalized.providerMessageId,
        providerThreadId: normalized.providerConversationId,
        direction: normalized.direction,
        fromAddress: normalized.sender ? addressValue(normalized.sender) : null,
        fromName: normalized.sender?.name ?? null,
        toRecipients: normalized.recipients,
        ccRecipients: normalized.cc,
        subject: normalized.subject,
        textBody: normalized.text,
        displayTextBody: normalized.displayText,
        htmlBody: normalized.html ?? null,
        providerMessageIdHeader: normalized.messageIdHeader ?? null,
        inReplyTo: normalized.inReplyTo ?? null,
        referencesHeader: normalized.references,
        sentAt: normalized.direction === "outbound" ? normalized.occurredAt : null,
        receivedAt: normalized.direction === "inbound" ? normalized.occurredAt : null,
      })
      .onConflictDoNothing({
        target: [messages.integrationAccountId, messages.providerMessageId],
      })
      .returning();

    if (!inserted) return { inserted: false, conversationId: conversation.id };

    if (normalized.attachments.length) {
      await tx.insert(attachments).values(normalized.attachments.map((attachment) => ({
        messageId: inserted.id,
        providerAttachmentId: attachment.providerAttachmentId ?? null,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })));
    }

    const firstMessageAt = normalized.occurredAt < conversation.firstMessageAt
      ? normalized.occurredAt
      : conversation.firstMessageAt;
    const latestMessageAt = normalized.occurredAt > conversation.latestMessageAt
      ? normalized.occurredAt
      : conversation.latestMessageAt;

    await tx.update(conversations).set({
      subject: conversation.subject === "(no subject)" && normalized.subject !== "(no subject)" ? normalized.subject : conversation.subject,
      customerParticipantId: conversation.customerParticipantId ?? customerParticipantId,
      firstMessageAt,
      latestMessageAt,
      unread: conversation.unread || normalized.unread,
      updatedAt: new Date(),
    }).where(eq(conversations.id, conversation.id));

    return { inserted: true, conversationId: conversation.id, messageId: inserted.id };
  });
}

export async function listConversationRows(limit = 500) {
  return getDb()
    .select({
      conversation: conversations,
      customer: participants,
      integration: integrationAccounts,
    })
    .from(conversations)
    .innerJoin(integrationAccounts, eq(conversations.integrationAccountId, integrationAccounts.id))
    .leftJoin(participants, eq(conversations.customerParticipantId, participants.id))
    .orderBy(desc(conversations.latestMessageAt))
    .limit(limit);
}

export async function getConversationContext(id: string) {
  if (!isDatabaseConversationId(id)) return undefined;
  const [row] = await getDb()
    .select({
      conversation: conversations,
      customer: participants,
      integration: integrationAccounts,
    })
    .from(conversations)
    .innerJoin(integrationAccounts, eq(conversations.integrationAccountId, integrationAccounts.id))
    .leftJoin(participants, eq(conversations.customerParticipantId, participants.id))
    .where(eq(conversations.id, id))
    .limit(1);
  return row;
}

export async function getConversationMessages(conversationId: string) {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(sql`coalesce(${messages.sentAt}, ${messages.receivedAt}, ${messages.createdAt})`));

  return Promise.all(rows.map(async (message) => ({
    message,
    attachments: await getDb().select().from(attachments).where(eq(attachments.messageId, message.id)),
  })));
}

export async function getLatestConversationMessage(conversationId: string) {
  const [row] = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(sql`coalesce(${messages.sentAt}, ${messages.receivedAt}, ${messages.createdAt})`))
    .limit(1);
  return row;
}

export async function getLatestMessagePreview(conversationId: string) {
  const row = await getLatestConversationMessage(conversationId);
  return row?.displayTextBody || row?.textBody || "";
}
