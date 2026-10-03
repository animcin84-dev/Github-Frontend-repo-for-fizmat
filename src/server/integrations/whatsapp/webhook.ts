import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SupportError } from "@/server/errors";
import type { ParsedWhatsAppWebhook } from "./types";

const MAX_EVENTS = 1_000;
const providerId = z.string().regex(/^\d{1,32}$/);
const phone = z.string().regex(/^\d{1,15}$/);
const envelopeSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: providerId,
    changes: z.array(z.object({ field: z.string(), value: z.unknown() })).max(MAX_EVENTS),
  })).max(MAX_EVENTS),
});
const changeValueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  messages: z.array(z.unknown()).max(MAX_EVENTS).optional(),
  statuses: z.array(z.unknown()).max(MAX_EVENTS).optional(),
  metadata: z.unknown().optional(),
  contacts: z.unknown().optional(),
});
const metadataSchema = z.object({
  phone_number_id: providerId,
  display_phone_number: z.string().max(64).optional(),
});
const contactsSchema = z.array(z.object({
  wa_id: phone,
  profile: z.object({ name: z.string().max(256).optional() }).optional(),
})).max(MAX_EVENTS);
const textMessageSchema = z.object({
  id: z.string().min(1).max(512),
  from: phone,
  timestamp: z.string().regex(/^\d{1,12}$/).refine((value) => Number.isFinite(new Date(Number(value) * 1_000).getTime())),
  type: z.literal("text"),
  text: z.object({ body: z.string().min(1).max(4_096) }),
  context: z.object({ id: z.string().min(1).max(512).optional() }).optional(),
});

function invalidPayload(): never {
  throw new SupportError("validation_failed", "Invalid WhatsApp webhook payload", { status: 400 });
}

export function verifyWhatsAppChallenge(url: URL, verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN): string {
  if (!verifyToken?.trim()) {
    throw new SupportError("configuration_missing", "Configure WHATSAPP_WEBHOOK_VERIFY_TOKEN before verifying the webhook", { status: 503 });
  }
  const suppliedToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const tokensMatch = suppliedToken !== null && suppliedToken.length <= 1_024 && timingSafeEqual(
    createHash("sha256").update(suppliedToken).digest(),
    createHash("sha256").update(verifyToken).digest(),
  );
  if (url.searchParams.get("hub.mode") !== "subscribe" || !tokensMatch || !challenge || challenge.length > 512) {
    throw new SupportError("validation_failed", "WhatsApp webhook verification failed", { status: 403 });
  }
  return challenge;
}

/** Verify before JSON decoding: signatures cover the exact request bytes. */
export function verifyWhatsAppSignature(rawBody: Buffer, signature: string | null, appSecret: string): void {
  if (!appSecret.trim()) {
    throw new SupportError("configuration_missing", "Configure META_APP_SECRET before ingesting WhatsApp messages", { status: 503 });
  }
  if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) {
    throw new SupportError("validation_failed", "Invalid WhatsApp webhook signature", { status: 403 });
  }
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const actual = Buffer.from(signature.slice(7), "hex");
  if (!timingSafeEqual(expected, actual)) {
    throw new SupportError("validation_failed", "Invalid WhatsApp webhook signature", { status: 403 });
  }
}

/** Pure adapter: no persistence, replies, media downloads, or autonomous actions. */
export function parseWhatsAppWebhook(payload: unknown): ParsedWhatsAppWebhook {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) invalidPayload();
  if (envelope.data.object !== "whatsapp_business_account") return { messages: [], ignored: 1 };

  const result: ParsedWhatsAppWebhook = { messages: [], ignored: 0 };
  let eventCount = 0;
  let changeCount = 0;
  for (const entry of envelope.data.entry) {
    for (const change of entry.changes) {
      changeCount += 1;
      if (changeCount > MAX_EVENTS) invalidPayload();
      if (change.field !== "messages") {
        result.ignored += 1;
        continue;
      }
      const value = changeValueSchema.safeParse(change.value);
      if (!value.success) invalidPayload();
      result.ignored += value.data.statuses?.length ?? 0;
      eventCount += (value.data.messages?.length ?? 0) + (value.data.statuses?.length ?? 0);
      if (eventCount > MAX_EVENTS) invalidPayload();
      for (const message of value.data.messages ?? []) {
        const type = z.object({ type: z.string() }).safeParse(message);
        if (!type.success) invalidPayload();
        if (type.data.type !== "text") {
          result.ignored += 1;
          continue;
        }
        const textMessage = textMessageSchema.safeParse(message);
        const metadata = metadataSchema.safeParse(value.data.metadata);
        const contacts = contactsSchema.safeParse(value.data.contacts ?? []);
        if (!textMessage.success || !metadata.success || !contacts.success) invalidPayload();
        const inbound = textMessage.data;
        const contact = contacts.data.find((candidate) => candidate.wa_id === inbound.from);
        const businessPhone = metadata.data.display_phone_number?.replace(/[+\s().-]/g, "");
        if (businessPhone && !phone.safeParse(businessPhone).success) invalidPayload();
        result.messages.push({
          wabaId: entry.id,
          phoneNumberId: metadata.data.phone_number_id,
          message: {
            provider: "whatsapp",
            providerMessageId: inbound.id,
            providerConversationId: inbound.from,
            sender: { phone: inbound.from, name: contact?.profile?.name },
            recipients: businessPhone ? [{ phone: businessPhone }] : [],
            cc: [],
            subject: "WhatsApp conversation",
            text: inbound.text.body,
            displayText: inbound.text.body,
            attachments: [],
            inReplyTo: inbound.context?.id,
            references: inbound.context?.id ? [inbound.context.id] : [],
            occurredAt: new Date(Number(inbound.timestamp) * 1_000),
            direction: "inbound",
            unread: true,
            untrustedCustomerContent: true,
          },
        });
      }
    }
  }
  return result;
}
