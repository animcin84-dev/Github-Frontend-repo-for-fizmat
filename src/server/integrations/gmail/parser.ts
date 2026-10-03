import { simpleParser, type AddressObject } from "mailparser";
import { SupportError } from "@/server/errors";
import type {
  GmailMessagePart,
  GmailMessageResponse,
  NormalizedAddress,
  NormalizedAttachment,
  NormalizedMessage,
} from "@/server/integrations/gmail/types";

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

function decoded(data?: string) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function headerValue(part: GmailMessagePart | undefined, name: string) {
  return part?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
}

function flattenParts(part: GmailMessagePart | undefined): GmailMessagePart[] {
  if (!part) return [];
  return [part, ...(part.parts?.flatMap(flattenParts) ?? [])];
}

async function htmlToPlainText(html: string) {
  const synthetic = [
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
  ].join("\r\n");
  const parsed = await simpleParser(Buffer.from(synthetic), {
    skipHtmlToText: false,
    skipTextToHtml: true,
  });
  return parsed.text ?? "";
}

async function normalizeFullMessage(message: GmailMessageResponse, mailboxEmail: string): Promise<NormalizedMessage> {
  const payload = message.payload;
  if (!payload) throw new SupportError("parse_failed", `Gmail message ${message.id} has no payload`, { status: 422 });

  const selectedHeaderNames = ["From", "To", "Cc", "Subject", "Date", "Message-ID", "In-Reply-To", "References"];
  const selectedHeaders = selectedHeaderNames.flatMap((name) => {
    const value = headerValue(payload, name);
    return value ? [`${name}: ${value}`] : [];
  });
  // mailparser remains the RFC-aware parser for addresses and threading headers.
  const parsedHeaders = await simpleParser(Buffer.from([...selectedHeaders, "", ""].join("\r\n")));

  const allParts = flattenParts(payload);
  const plainParts = allParts
    .filter((part) => part.mimeType?.toLowerCase() === "text/plain" && !part.filename && part.body?.data)
    .map((part) => decoded(part.body?.data))
    .filter(Boolean);
  const htmlParts = allParts
    .filter((part) => part.mimeType?.toLowerCase() === "text/html" && !part.filename && part.body?.data)
    .map((part) => decoded(part.body?.data))
    .filter(Boolean);

  const attachments: NormalizedAttachment[] = allParts
    .filter((part) => Boolean(part.filename))
    .map((part) => ({
      providerAttachmentId: part.body?.attachmentId ?? null,
      filename: part.filename || "attachment",
      mimeType: part.mimeType || "application/octet-stream",
      size: part.body?.size ?? 0,
    }));

  const sender = addresses(parsedHeaders.from)[0];
  const recipients = addresses(parsedHeaders.to);
  const cc = addresses(parsedHeaders.cc);
  const html = htmlParts.length ? htmlParts.join("\n") : null;
  const text = plainParts.length ? plainParts.join("\n\n") : html ? await htmlToPlainText(html) : "";
  const occurredAt = parsedHeaders.date ?? (message.internalDate ? new Date(Number(message.internalDate)) : new Date());
  const referencesValue = parsedHeaders.references;
  const references = Array.isArray(referencesValue)
    ? referencesValue
    : referencesValue
      ? [referencesValue]
      : [];
  const direction = sender?.email.toLowerCase() === mailboxEmail.toLowerCase() ? "outbound" : "inbound";

  return {
    provider: "gmail",
    providerMessageId: message.id,
    providerConversationId: message.threadId,
    sender,
    recipients,
    cc,
    subject: parsedHeaders.subject?.trim() || "(no subject)",
    text,
    displayText: extractPresentationText(text),
    html,
    attachments,
    messageIdHeader: parsedHeaders.messageId ?? null,
    inReplyTo: parsedHeaders.inReplyTo ?? null,
    references,
    occurredAt,
    direction,
    unread: message.labelIds?.includes("UNREAD") ?? false,
    // Future AI/RAG layers must treat message content as data, never as policy/system instructions.
    untrustedCustomerContent: true,
  };
}

async function normalizeRawFixture(message: GmailMessageResponse, mailboxEmail: string): Promise<NormalizedMessage> {
  if (!message.raw) throw new SupportError("parse_failed", `Gmail message ${message.id} has no supported MIME representation`, { status: 422 });
  const parsed = await simpleParser(Buffer.from(message.raw, "base64url"), {
    skipHtmlToText: false,
    skipTextToHtml: true,
  });
  const sender = addresses(parsed.from)[0];
  const to = addresses(parsed.to);
  const cc = addresses(parsed.cc);
  const text = parsed.text ?? "";
  const occurredAt = parsed.date ?? (message.internalDate ? new Date(Number(message.internalDate)) : new Date());
  const referencesValue = parsed.references;
  const references = Array.isArray(referencesValue) ? referencesValue : referencesValue ? [referencesValue] : [];
  const direction = sender?.email.toLowerCase() === mailboxEmail.toLowerCase() ? "outbound" : "inbound";
  return {
    provider: "gmail",
    providerMessageId: message.id,
    providerConversationId: message.threadId,
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
    unread: message.labelIds?.includes("UNREAD") ?? false,
    untrustedCustomerContent: true,
  };
}

export async function normalizeGmailMessage(message: GmailMessageResponse, mailboxEmail: string): Promise<NormalizedMessage> {
  try {
    if (message.payload) return await normalizeFullMessage(message, mailboxEmail);
    return await normalizeRawFixture(message, mailboxEmail);
  } catch (error) {
    if (error instanceof SupportError) throw error;
    throw new SupportError("parse_failed", `Failed to parse Gmail message ${message.id}`, { status: 422, cause: error });
  }
}
