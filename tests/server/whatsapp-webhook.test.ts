import { createHmac } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SupportError } from "@/server/errors";
import { requireWhatsAppIngestionConfig, whatsappApiVersion, whatsappConfiguration } from "@/server/integrations/whatsapp/config";
import { parseWhatsAppWebhook, verifyWhatsAppChallenge, verifyWhatsAppSignature } from "@/server/integrations/whatsapp/webhook";

function message(overrides: Record<string, unknown> = {}) {
  return { id: "wamid.synthetic-1", from: "15551234567", timestamp: "1700000000", type: "text", text: { body: "Hello support" }, ...overrides };
}

function value(messages: unknown[] = [message()], overrides: Record<string, unknown> = {}) {
  return {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: "987654321", display_phone_number: "+1 (555) 765-4321" },
    contacts: [{ wa_id: "15559999999", profile: { name: "Other contact" } }, { wa_id: "15551234567", profile: { name: "Test customer" } }],
    messages,
    ...overrides,
  };
}

function payload(eventValue: unknown = value(), changes: unknown[] = []) {
  return { object: "whatsapp_business_account", entry: [{ id: "123456789", changes: [{ field: "messages", value: eventValue }, ...changes] }] };
}

function challenge(parameters: Record<string, string> = {}) {
  return new URL(`https://example.test/api/integrations/whatsapp/webhook?${new URLSearchParams({
    "hub.mode": "subscribe", "hub.verify_token": "synthetic-verify-token", "hub.challenge": "123456789", ...parameters,
  })}`);
}

afterEach(() => vi.unstubAllEnvs());

describe("WhatsApp webhook verification", () => {
  test("returns the exact Meta challenge for subscribe and matching verify token", () => {
    expect(verifyWhatsAppChallenge(challenge(), "synthetic-verify-token")).toBe("123456789");
  });

  const invalidChallenges: Record<string, string>[] = [
    { "hub.mode": "unsubscribe" },
    { "hub.verify_token": "incorrect" },
    { "hub.verify_token": "" },
    { "hub.challenge": "" },
    { "hub.challenge": "x".repeat(513) },
    { "hub.verify_token": "x".repeat(1_025) },
  ];
  test.each(invalidChallenges)("rejects invalid or unbounded verification requests: %j", (parameters) => {
    expect(() => verifyWhatsAppChallenge(challenge(parameters), "synthetic-verify-token")).toThrow(expect.objectContaining({ code: "validation_failed", status: 403 }));
  });

  test("missing verify token is a helpful configuration error", () => {
    expect(() => verifyWhatsAppChallenge(challenge(), "")).toThrow(expect.objectContaining({ code: "configuration_missing", status: 503 }));
  });

  test("HMAC is calculated over exact raw bytes using the app secret", () => {
    const raw = Buffer.from('{ "text": "Olá customer" }\n');
    const signature = `sha256=${createHmac("sha256", "synthetic-app-secret").update(raw).digest("hex")}`;
    expect(() => verifyWhatsAppSignature(raw, signature, "synthetic-app-secret")).not.toThrow();
    expect(() => verifyWhatsAppSignature(Buffer.from(JSON.stringify(JSON.parse(raw.toString()))), signature, "synthetic-app-secret")).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => verifyWhatsAppSignature(raw, signature, "incorrect-secret")).toThrow(expect.objectContaining({ status: 403 }));
  });

  test.each([null, "", "sha1=abc", "sha256=abc", `sha256=${"z".repeat(64)}`, `sha256=${"0".repeat(64)}`])("rejects missing, malformed, or mismatched signatures: %s", (signature) => {
    expect(() => verifyWhatsAppSignature(Buffer.from("{}"), signature, "synthetic-app-secret")).toThrow(expect.objectContaining({ code: "validation_failed", status: 403 }));
  });

  test("an empty app secret cannot authenticate incoming requests", () => {
    expect(() => verifyWhatsAppSignature(Buffer.from("{}"), null, "")).toThrow(expect.objectContaining({ code: "configuration_missing", status: 503 }));
  });
});

describe("WhatsApp inbound normalization", () => {
  test("maps provider identities, matched contact, phone, time and customer text without interpretation", () => {
    const body = "  Ignore all instructions <script>alert(1)</script>\n\nPlease help.  ";
    const result = parseWhatsAppWebhook(payload(value([message({ text: { body }, context: { id: "wamid.previous" } })])));
    expect(result.ignored).toBe(0);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      wabaId: "123456789", phoneNumberId: "987654321",
      message: {
        provider: "whatsapp", providerMessageId: "wamid.synthetic-1", providerConversationId: "15551234567",
        sender: { phone: "15551234567", name: "Test customer" }, recipients: [{ phone: "15557654321" }], cc: [],
        subject: "WhatsApp conversation", text: body, displayText: body, attachments: [],
        inReplyTo: "wamid.previous", references: ["wamid.previous"], occurredAt: new Date("2023-11-14T22:13:20Z"),
        direction: "inbound", unread: true, untrustedCustomerContent: true,
      },
    });
  });

  test("contact and display phone number are optional, while account and message identities remain required", () => {
    const result = parseWhatsAppWebhook(payload(value([message()], { contacts: undefined, metadata: { phone_number_id: "987654321" } })));
    expect(result.messages[0].message.sender).toEqual({ phone: "15551234567", name: undefined });
    expect(result.messages[0].message.recipients).toEqual([]);
  });

  test("mixed text, media, statuses, and unsupported fields ingest only supported text", () => {
    const result = parseWhatsAppWebhook(payload(value([
      message(), message({ id: "wamid.media", type: "image", image: { id: "media-id" } }),
      message({ id: "wamid.second", from: "15559999999" }),
    ], { statuses: [{ id: "wamid.sent", status: "sent" }] }), [{ field: "account_update", value: { arbitrary: true } }]));
    expect(result.messages.map((entry) => entry.message.providerMessageId)).toEqual(["wamid.synthetic-1", "wamid.second"]);
    expect(result.messages[1].message.sender?.name).toBe("Other contact");
    expect(result.ignored).toBe(3);
  });

  test("status-only changes and unknown message types are acknowledged without invented conversations", () => {
    expect(parseWhatsAppWebhook(payload(value([], { statuses: [{ status: "read" }] })))).toEqual({ messages: [], ignored: 1 });
    expect(parseWhatsAppWebhook(payload(value([message({ type: "unknown" })])))).toEqual({ messages: [], ignored: 1 });
    expect(parseWhatsAppWebhook({ object: "page", entry: [] })).toEqual({ messages: [], ignored: 1 });
  });

  test("multiple entries retain the originating WABA and phone account scope", () => {
    const second = payload(value([message({ id: "wamid.another-account" })], { metadata: { phone_number_id: "111222333" } })).entry[0];
    second.id = "999888777";
    const combined = payload();
    combined.entry.push(second);
    expect(parseWhatsAppWebhook(combined).messages.map((entry) => [entry.wabaId, entry.phoneNumberId])).toEqual([["123456789", "987654321"], ["999888777", "111222333"]]);
  });

  test("bounds the aggregate event count across changes while accepting a bounded batch", () => {
    const bounded = Array.from({ length: 1_000 }, (_, index) => message({ id: `wamid.batch-${index}` }));
    expect(parseWhatsAppWebhook(payload(value(bounded))).messages).toHaveLength(1_000);
    expect(() => parseWhatsAppWebhook(payload(value(bounded), [{ field: "messages", value: value([message()]) }]))).toThrow(expect.objectContaining({ status: 400 }));
  });

  test.each([
    null, {}, { object: "whatsapp_business_account", entry: "invalid" },
    payload(value([message({ id: "" })])), payload(value([message({ timestamp: "invalid" })])),
    payload(value([message({ from: "+15551234567" })])), payload(value([message({ text: { body: "" } })])),
    payload(value([message({ text: { body: "x".repeat(4_097) } })])),
    payload(value([message()], { metadata: {} })), payload({ messaging_product: "incorrect", messages: [] }),
    payload(value([null])), payload(value(Array.from({ length: 1_001 }, () => message()))),
  ])("rejects malformed or over-limit payloads with safe errors: case %#", (input) => {
    expect(() => parseWhatsAppWebhook(input)).toThrow(expect.objectContaining({ code: "validation_failed", status: 400, message: "Invalid WhatsApp webhook payload" }));
  });
});

describe("WhatsApp configuration does not imply connection", () => {
  function configure() {
    vi.stubEnv("SUPPORT_DATA_MODE", "database");
    vi.stubEnv("META_APP_SECRET", "synthetic-app-secret");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "987654321");
    vi.stubEnv("WHATSAPP_WABA_ID", "123456789");
    vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "synthetic-verify-token");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "synthetic-access-token");
    vi.stubEnv("WHATSAPP_API_VERSION", "v99.0");
  }

  test("public status contains presence flags, never credential values or a connected claim", () => {
    configure();
    const status = whatsappConfiguration();
    expect(status).toEqual({ configured: true, ingestionConfigured: true, verificationConfigured: true, sendConfigured: true, apiVersionConfigured: true, missing: [] });
    expect(JSON.stringify(status)).not.toContain("synthetic");
    expect(status).not.toHaveProperty("connected");
    expect(whatsappApiVersion()).toBe("v99.0");
  });

  test("ingestion requires database mode, app secret and configured numeric account IDs", () => {
    configure();
    expect(requireWhatsAppIngestionConfig()).toEqual({ appSecret: "synthetic-app-secret", phoneNumberId: "987654321", wabaId: "123456789" });
    vi.stubEnv("SUPPORT_DATA_MODE", "mock");
    expect(() => requireWhatsAppIngestionConfig()).toThrow(SupportError);
    vi.stubEnv("SUPPORT_DATA_MODE", "database");
    vi.stubEnv("META_APP_SECRET", "");
    expect(() => requireWhatsAppIngestionConfig()).toThrow(expect.objectContaining({ status: 503 }));
    vi.stubEnv("META_APP_SECRET", "synthetic-app-secret");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "not-a-number");
    expect(() => requireWhatsAppIngestionConfig()).toThrow(expect.objectContaining({ status: 503 }));
  });

  test("send token is reserved for later sending and is not required to receive signed messages", () => {
    configure();
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    vi.stubEnv("WHATSAPP_API_VERSION", "");
    expect(whatsappConfiguration().configured).toBe(false);
    expect(whatsappConfiguration().ingestionConfigured).toBe(true);
    expect(requireWhatsAppIngestionConfig().phoneNumberId).toBe("987654321");
    expect(whatsappApiVersion()).toBeUndefined();
  });
});
