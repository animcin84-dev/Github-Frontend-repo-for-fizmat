import type { NormalizedMessage } from "@/server/integrations/types";

export const WHATSAPP_PROVIDER = "whatsapp" as const;

export interface WhatsAppInboundMessage {
  wabaId: string;
  phoneNumberId: string;
  message: NormalizedMessage;
}

export interface ParsedWhatsAppWebhook {
  messages: WhatsAppInboundMessage[];
  /** Unsupported message types, status notifications, and other change fields. */
  ignored: number;
}
