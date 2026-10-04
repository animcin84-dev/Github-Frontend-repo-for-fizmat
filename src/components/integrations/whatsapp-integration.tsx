"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/page-state";
import { Surface } from "@/components/ui/surface";
import type { getWhatsAppIntegrationStatus } from "@/server/services/whatsapp-service";

type WhatsAppStatus = Awaited<ReturnType<typeof getWhatsAppIntegrationStatus>>;

export function WhatsAppIntegration() {
  const query = useQuery({
    queryKey: ["whatsapp-integration-status"],
    queryFn: async (): Promise<WhatsAppStatus> => {
      const response = await fetch("/api/integrations/whatsapp/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load WhatsApp setup status");
      return response.json();
    },
  });
  const data = query.data;
  const label = query.isError ? "STATUS UNAVAILABLE" : !data ? "CHECKING SETUP" : data.status === "inbound_received"
    ? "INBOUND RECEIVED" : data.configured ? "CONFIGURED · TEST PENDING" : "SETUP REQUIRED";
  return <Surface aria-label="WhatsApp setup details" className="si-integration-content p-4">
    <div className="flex items-start gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)]"><MessageSquareText className="size-4" /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">WhatsApp</h2><Badge tone="warning">{label}</Badge></div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Official Meta Cloud API. Public webhook transport was verified in P1 acceptance; this view does not recheck the public endpoint. Real phone acceptance remains unverified.</p>
      </div>
    </div>
    {query.isError ? <div className="mt-3"><ErrorState detail={query.error.message} /></div> : null}
    {data ? <div className="mt-4 space-y-2 text-xs">
      <p>Manual replies are not enabled yet. Real WhatsApp acceptance: <strong>Not verified</strong>.</p>
      {data.missing.length ? <p className="text-[var(--muted-foreground)]">Configure on the server: <span className="break-words font-mono text-[10px]">{data.missing.join(", ")}</span></p> : <p className="text-[var(--muted-foreground)]">Credentials are present. This does not confirm a working connection.</p>}
      <p className="text-[var(--muted-foreground)]">Webhook: <code className="break-all text-[10px]">https://&lt;public-host&gt;{data.webhookPath}</code></p>
      {data.storedMessages ? <p>Stored inbound messages: {data.storedMessages}. Last received: {data.lastInboundAt ? new Date(data.lastInboundAt).toLocaleString() : "Unknown"}.</p> : null}
    </div> : null}
  </Surface>;
}
