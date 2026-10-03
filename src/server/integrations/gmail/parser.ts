import { simpleParser, type AddressObject } from "mailparser";
import { SupportError } from "@/server/errors";
import type { GmailRawMessage, NormalizedAddress, NormalizedMessage } from "@/server/integrations/gmail/types";

function addresses(value?: AddressObject | AddressObject[] | null): NormalizedAddress[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.flatMap((item) => item.value.flatMap((address) => {
    if (!address.address) return [];
    return [{
      ...(address.name ? { name: address.name } : {}),
      email: address.address.toLowerCase(),
    }];
  }));
}

export function extractPresentationText(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const replyMarker = /\nOn .{1,240} wrote:\s*\n/i.exec(normalized);
  if (replyMarker && replyMarker.index >= 16) return normalized.slice(0, replyMarker.index).trim();
  const quotedBlock = /\n(?:>\s?.*\n?){3,}$/m.exec(normalized);
  if (quotedBlock && quotedBlock.index >= 16) return normalized.slice(0, quotedBlock.index).trim();
  return normalized;
}

export async function normalizeGmailMessage(rawMessage: GmailRawMessage, mailboxEmail: string): Promise<NormalizedMessage> {
  try {
    const parsed = await simpleParser(Buffer.from(rawMessage.raw, "base64url"), {
      skipHtmlToText: false,
      skipTextToHtml: true,
    });
    const sender = addresses(parsed.from)[0];
    const to = addresses(parsed.to);
    const cc = addresses(parsed.cc);
    const text = parsed.text ?? "";
    const occurredAt = parsed.date ?? (rawMessage.internalDate ? new Date(Number(rawMessage.internalDate)) : new Date());
    const referencesValue = parsed.references;
    const references = Array.isArray(referencesValue)
      ? referencesValue
      : referencesValue
        ? [referencesValue]
        : [];
    const direction = sender?.email.toLowerCase() === mailboxEmail.toLowerCase() ? "outbound" : "inbound";
    return {
      provider: "gmail",
      providerMessageId: rawMessage.id,
      providerConversationId: rawMessage.threadId,
      sender,
      recipients: to,
      cc,
      subject: parsed.subject?.trim() || "(no subject)",
      text,
      displayText: extractPresentationText(text),
      html: typeof parsed.html === "string" ? parsed.html : null,
      attachments: parsed.attachments.map((attachment) => ({
        providerAttachmentId: null,
        filename: attachment.filename || "attachment",
        mimeType: attachment.contentType || "application/octet-stream",
        size: attachment.size ?? attachment.content.length,
      })),
      messageIdHeader: parsed.messageId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      references,
      occurredAt,
      direction,
      unread: rawMessage.labelIds?.includes("UNREAD") ?? false,
      // Future AI/RAG layers must treat message content as data, never as policy/system instructions.
      untrustedCustomerContent: true,
    };
  } catch (error) {
    throw new SupportError("parse_failed", `Failed to parse Gmail message ${rawMessage.id}`, { status: 422, cause: error });
  }
}
