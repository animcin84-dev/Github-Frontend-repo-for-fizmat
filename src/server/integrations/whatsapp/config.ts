import { SupportError } from "@/server/errors";

const INGESTION_VARIABLES = ["META_APP_SECRET", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID"] as const;
const SETUP_VARIABLES = [...INGESTION_VARIABLES, "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_ACCESS_TOKEN"] as const;

/** Values are presence flags only; configuration is not proof of a working connection. */
export function whatsappConfiguration() {
  const missing = SETUP_VARIABLES.filter((name) => !process.env[name]?.trim());
  return {
    configured: missing.length === 0,
    ingestionConfigured: INGESTION_VARIABLES.every((name) => Boolean(process.env[name]?.trim())),
    verificationConfigured: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()),
    sendConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
    apiVersionConfigured: Boolean(process.env.WHATSAPP_API_VERSION?.trim()),
    missing,
  };
}

/** Keep the Graph version centralized. No Graph requests are implemented in this phase. */
export function whatsappApiVersion(): string | undefined {
  return process.env.WHATSAPP_API_VERSION?.trim() || undefined;
}

export function requireWhatsAppIngestionConfig() {
  if (process.env.SUPPORT_DATA_MODE !== "database") {
    throw new SupportError("configuration_missing", "WhatsApp ingestion requires SUPPORT_DATA_MODE=database", { status: 503 });
  }
  const missing = INGESTION_VARIABLES.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new SupportError("configuration_missing", `Configure ${missing.join(", ")} before ingesting WhatsApp messages`, { status: 503 });
  }
  const appSecret = process.env.META_APP_SECRET!;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!.trim();
  const wabaId = process.env.WHATSAPP_WABA_ID!.trim();
  if (!/^\d{1,32}$/.test(phoneNumberId) || !/^\d{1,32}$/.test(wabaId)) {
    throw new SupportError("configuration_missing", "WhatsApp phone number ID and WABA ID must be numeric Meta IDs", { status: 503 });
  }
  return { appSecret, phoneNumberId, wabaId };
}
