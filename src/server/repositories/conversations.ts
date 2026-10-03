import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  attachments,
  conversations,
  integrationAccounts,
  messages,
  participants,
} from "@/server/db/schema";
import type { NormalizedAddress, NormalizedMessage } from "@/server/integrations/gmail/types";
import type { IntegrationAccountRow } from "@/server/repositories/integrations";

function customerAddress(message: NormalizedMessage, mailboxEmail: string): NormalizedAddress | undefined {
  if (message.direction === "inbound") return message.sender;
  return message.recipients.find((item) => item.email.toLowerCase() !== mailboxEmail.toLowerCase());
}

export async function persistNormalizedMessage(account: IntegrationAccountRow, normalized: NormalizedMessage) {
  return getDb().transaction(async (tx) => {
    const customer = customerAddress(normalized, account.emailAddress);
    let customerParticipantId: string | null = null;

    if (customer?.email) {
      const providerIdentity = `gmail:${customer.email.toLowerCase()}`;
      const [participant] = await tx
        .insert(participants)
        .values({
          name: customer.name ?? customer.email,
          email: customer.email.toLowerCase(),
          providerIdentity,
        })
        .onConflictDoUpdate({
          target: participants.providerIdentity,
          set: { name: customer.name ?? customer.email, email: customer.email.toLowerCase() },
        })
        .returning();
      customerParticipantId = participant.id;
    }

    const [existingConversation] = await tx
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.integrationAccountId, account.id),
        eq(conversations.providerConversationId, normalized.providerConversationId),
      ))
      .limit(1);

    let conversation = existingConversation;
    if (!conversation) {
      [conversation] = await tx
        .insert(conversations)
        .values({
          integrationAccountId: account.id,
          provider: "gmail",
          providerConversationId: normalized.providerConversationId,
          subject: normalized.subject,
          status: "new",
          customerParticipantId,
          firstMessageAt: normalized.occurredAt,
          latestMessageAt: normalized.occurredAt,
          unread: normalized.unread,
        })
        .returning();
    }

    const [inserted] = await tx
      .insert(messages)
      .values({
        integrationAccountId: account.id,
        conversationId: conversation.id,
        provider: "gmail",
        providerMessageId: normalized.providerMessageId,
        providerThreadId: normalized.providerConversationId,
        direction: normalized.direction,
        fromAddress: normalized.sender?.email ?? null,
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
    .orderBy(asc(messages.createdAt));

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
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return row;
}

export async function getLatestMessagePreview(conversationId: string) {
  const row = await getLatestConversationMessage(conversationId);
  return row?.displayTextBody || row?.textBody || "";
}
