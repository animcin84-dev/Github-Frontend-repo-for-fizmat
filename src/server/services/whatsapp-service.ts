import { count, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { messages } from "@/server/db/schema";
import { whatsappConfiguration } from "@/server/integrations/whatsapp/config";
import type { ParsedWhatsAppWebhook } from "@/server/integrations/whatsapp/types";
import { persistNormalizedMessage } from "@/server/repositories/conversations";
import { getIntegrationByProviderAccount, recordWhatsAppInboundAccount } from "@/server/repositories/integrations";
import { supportDataMode } from "@/server/services/integration-service";

export async function ingestWhatsAppWebhook(parsed: ParsedWhatsAppWebhook, configured: { wabaId: string; phoneNumberId: string }) {
  let inserted = 0;
  let duplicates = 0;
  let ignored = parsed.ignored;
  for (const event of parsed.messages) {
    if (event.wabaId !== configured.wabaId || event.phoneNumberId !== configured.phoneNumberId) {
      ignored += 1;
      continue;
    }
    const account = await recordWhatsAppInboundAccount(event.phoneNumberId);
    const persisted = await persistNormalizedMessage(account, event.message);
    if (persisted.inserted) inserted += 1;
    else duplicates += 1;
  }
  // Acknowledge only after durable inserts. Retried batches dedupe prior successes.
  return { inserted, duplicates, ignored };
}

export async function getWhatsAppIntegrationStatus() {
  const configuration = whatsappConfiguration();
  const mode = supportDataMode();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const account = mode === "database" && phoneNumberId
    ? await getIntegrationByProviderAccount("whatsapp", phoneNumberId)
    : undefined;
  const [stored] = account ? await getDb().select({ total: count() }).from(messages)
    .where(eq(messages.integrationAccountId, account.id)) : [];
  return {
    provider: "whatsapp" as const, mode, connected: false as const, replyEnabled: false as const,
    configured: configuration.configured, missing: configuration.missing,
    status: stored?.total ? "inbound_received" as const : configuration.configured ? "configured" as const : "not_configured" as const,
    storedMessages: stored?.total ?? 0,
    lastInboundAt: stored?.total ? account?.lastSyncedAt?.toISOString() ?? null : null,
    webhookPath: "/api/integrations/whatsapp/webhook",
    realAcceptance: "not_verified" as const,
  };
}
