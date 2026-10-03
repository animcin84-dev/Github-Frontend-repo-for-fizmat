"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Mail, RefreshCw, ShieldCheck, Unplug, Waves } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { IntegrationStatusDTO } from "@/server/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { WhatsAppIntegration } from "@/components/integrations/whatsapp-integration";
import { Surface } from "@/components/ui/surface";

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  return body as T;
}

async function status() {
  return json<IntegrationStatusDTO>(await fetch("/api/integrations/gmail/status", { cache: "no-store" }));
}

export function GmailIntegration() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const statusQuery = useQuery({ queryKey: ["gmail-integration-status"], queryFn: status });
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [backfillDays, setBackfillDays] = useState(30);
  const [syncQuery, setSyncQuery] = useState("");

  const sync = useMutation({
    mutationFn: async () => json(await fetch("/api/integrations/gmail/sync", { method: "POST" })),
    onSuccess: async () => {
      toast.success("Gmail synchronization completed");
      await queryClient.invalidateQueries({ queryKey: ["gmail-integration-status"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Gmail synchronization failed"),
  });
  const watch = useMutation({
    mutationFn: async () => json(await fetch("/api/integrations/gmail/watch", { method: "POST" })),
    onSuccess: async () => {
      toast.success("Gmail watch renewed");
      await queryClient.invalidateQueries({ queryKey: ["gmail-integration-status"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Gmail watch renewal failed"),
  });
  const saveSettings = useMutation({
    mutationFn: async () => json(await fetch("/api/integrations/gmail/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backfillDays, syncQuery }),
    })),
    onSuccess: async () => {
      setEditingSettings(false);
      toast.success("Gmail sync settings saved");
      await queryClient.invalidateQueries({ queryKey: ["gmail-integration-status"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save Gmail settings"),
  });
  const disconnect = useMutation({
    mutationFn: async () => json<{ providerRevoked: boolean; historicalConversationsRemainAvailable: boolean }>(
      await fetch("/api/integrations/gmail/disconnect", { method: "POST" }),
    ),
    onSuccess: async (result) => {
      setDisconnectConfirm(false);
      toast.success("Gmail disconnected", {
        description: result.providerRevoked
          ? "Google token revocation was confirmed. Historical conversations remain available."
          : "Local token removed. Historical conversations remain available; Google permission revocation was not claimed.",
      });
      await queryClient.invalidateQueries({ queryKey: ["gmail-integration-status"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Disconnect failed"),
  });

  if (statusQuery.isError) return <ErrorState detail={statusQuery.error.message} />;
  if (statusQuery.isLoading || !statusQuery.data) return <LoadingState label="Loading Gmail integration…" />;

  const data = statusQuery.data;
  const startEditingSettings = () => {
    setBackfillDays(data.backfillDays ?? 30);
    setSyncQuery(data.syncQuery ?? "in:inbox newer_than:30d");
    setEditingSettings(true);
  };
  const callbackError = params.get("gmail") === "error" ? params.get("code") : null;

  return (
    <div className="si-page mx-auto max-w-[1180px]">
      <div className="si-page-header">
        <div>
          <h1 className="si-page-title">Integrations</h1>
          <p className="si-page-subtitle">Gmail connection and WhatsApp setup for the unified support Inbox.</p>
        </div>
        <Badge tone={data.mode === "database" ? "success" : "warning"}>{data.mode === "database" ? "REAL DATA MODE" : "MOCK MODE"}</Badge>
      </div>

      {callbackError ? (
        <Surface className="mb-4 border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] p-4">
          <div className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 text-[var(--danger)]" /><div><strong>Gmail connection did not complete.</strong><div className="mt-1 text-xs text-[var(--muted-foreground)]">Error category: {callbackError}. No OAuth tokens are shown in the browser.</div></div></div>
        </Surface>
      ) : null}

      <Surface className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-9 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)]"><Mail className="size-4" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Gmail</h2>{data.connected ? <Badge tone="success">CONNECTED</Badge> : <Badge>{data.mode === "mock" ? "NOT ACTIVE" : "NOT CONNECTED"}</Badge>}</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{data.connected ? data.mailbox : data.mode === "mock" ? "Set SUPPORT_DATA_MODE=database and configure server credentials to connect a dedicated support mailbox." : "Connect a dedicated support mailbox with server-side OAuth."}</p>
            </div>
          </div>
          {!data.connected ? (
            <a
              href={data.mode === "database" ? "/api/integrations/gmail/connect" : undefined}
              aria-disabled={data.mode !== "database"}
              className={`inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium ${data.mode === "database" ? "border-[var(--border)] hover:bg-[var(--surface-2)]" : "cursor-not-allowed border-[var(--border)] opacity-50"}`}
            >
              Connect Gmail
            </a>
          ) : null}
        </div>

        {data.connected ? (
          <div>
            <div className="grid divide-y divide-[var(--border)] md:grid-cols-2 md:divide-x md:divide-y-0">
              <section className="p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Connection</div>
                <dl className="mt-3 grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-xs">
                  <dt className="text-[var(--muted-foreground)]">Mailbox</dt><dd className="font-semibold">{data.mailbox}</dd>
                  <dt className="text-[var(--muted-foreground)]">Mode</dt><dd>Real data</dd>
                  <dt className="text-[var(--muted-foreground)]">Backfill</dt><dd>{data.backfillDays ?? 30} days</dd>
                  <dt className="text-[var(--muted-foreground)]">Sync query</dt><dd className="break-all font-mono text-[10px]">{data.syncQuery}</dd>
                  <dt className="text-[var(--muted-foreground)]">Last history ID</dt><dd className="font-mono text-[10px]">{data.lastHistoryId ?? "—"}</dd><dt className="text-[var(--muted-foreground)]">Stored threads</dt><dd className="font-semibold">{data.storedThreads?.toLocaleString() ?? "—"}</dd><dt className="text-[var(--muted-foreground)]">Stored messages</dt><dd className="font-semibold">{data.storedMessages?.toLocaleString() ?? "—"}</dd>
                </dl>
                {!editingSettings ? <button onClick={startEditingSettings} className="mt-3 text-xs font-medium text-[var(--accent)] hover:underline">Edit sync scope</button> : <div className="mt-3 space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Backfill window<select aria-label="Backfill window" value={backfillDays} onChange={(event) => { const days = Number(event.target.value); setBackfillDays(days); setSyncQuery(`in:inbox newer_than:${days}d`); }} className="mt-1 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs normal-case tracking-normal text-[var(--foreground)]"><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Gmail query<input aria-label="Gmail sync query" value={syncQuery} onChange={(event) => setSyncQuery(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 font-mono text-[10px] normal-case tracking-normal text-[var(--foreground)]" /></label>
                  <div className="text-[10px] leading-4 text-[var(--muted-foreground)]">Custom queries are allowed. Counts are reported after fetch; the UI does not invent a cheap exact preview.</div>
                  <div className="flex gap-2"><Button size="sm" onClick={() => saveSettings.mutate()} disabled={!syncQuery.trim() || saveSettings.isPending}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditingSettings(false)} disabled={saveSettings.isPending}>Cancel</Button></div>
                </div>}
              </section>
              <section className="p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Permissions</div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-[var(--success)]" />Read mail <span className="text-[10px] text-[var(--muted-foreground)]">gmail.readonly · restricted</span></div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-[var(--success)]" />Send mail <span className="text-[10px] text-[var(--muted-foreground)]">gmail.send · sensitive</span></div>
                  <div className="rounded-md border border-[color-mix(in_srgb,var(--warning)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_4%,var(--surface-1))] p-2 text-[10px] leading-4 text-[var(--muted-foreground)]">Phase F2 is for development/demo/test users and a dedicated support mailbox. This UI does not claim public SaaS OAuth verification readiness.</div>
                </div>
              </section>
            </div>

            <div className="grid border-t border-[var(--border)] md:grid-cols-3 md:divide-x md:divide-[var(--border)]">
              <section className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold"><RefreshCw className="size-3.5" />Synchronization</div>
                <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone={data.syncState === "error" || data.syncState === "recovery_required" ? "danger" : data.syncState === "syncing" ? "warning" : "success"}>{data.syncState ?? "idle"}</Badge>{data.latestSync ? <Badge>{data.latestSync.kind}</Badge> : null}</div>
                <div className="mt-3 text-xs text-[var(--muted-foreground)]">Last synced: {data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString() : "Never"}</div>
              </section>
              <section className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="size-3.5" />Latest run</div>
                {data.latestSync ? <dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-[10px] text-[var(--muted-foreground)]">Threads</dt><dd className="font-semibold">{data.latestSync.threadsFound}</dd></div><div><dt className="text-[10px] text-[var(--muted-foreground)]">Messages found</dt><dd className="font-semibold">{data.latestSync.messagesFound}</dd></div><div><dt className="text-[10px] text-[var(--muted-foreground)]">Imported</dt><dd className="font-semibold">{data.latestSync.messagesInserted}</dd></div><div><dt className="text-[10px] text-[var(--muted-foreground)]">Duplicates skipped</dt><dd className="font-semibold">{data.latestSync.messagesSkipped}</dd></div></dl> : <div className="mt-3 text-xs text-[var(--muted-foreground)]">No synchronization run recorded yet.</div>}
              </section>
              <section className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold"><Waves className="size-3.5" />Watch / incremental</div>
                <div className="mt-3">{data.watchConfigured ? <Badge tone={data.watchExpiration ? "success" : "warning"}>{data.watchExpiration ? "Active / renewable" : "Configured, not started"}</Badge> : <Badge>Not configured</Badge>}</div>
                <div className="mt-2 text-xs text-[var(--muted-foreground)]">{data.watchExpiration ? `Expires ${new Date(data.watchExpiration).toLocaleString()}` : data.watchConfigured ? "Use Renew watch after Pub/Sub is configured." : "Manual history-based incremental sync remains available."}</div>
              </section>
            </div>

            {data.latestSync?.errorCode ? <div className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--danger)]"><strong>{data.latestSync.errorCode}</strong> · {data.latestSync.errorMessage}</div> : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-4 py-3">
              <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}><RefreshCw className={`size-3.5 ${sync.isPending ? "animate-spin" : ""}`} />{sync.isPending ? "Syncing" : "Sync now"}</Button><a href="/api/integrations/gmail/connect" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]"><RefreshCw className="size-3.5" />Reconnect</a>
              <Button size="sm" onClick={() => watch.mutate()} disabled={!data.watchConfigured || watch.isPending}><Waves className="size-3.5" />Renew watch</Button>
              {!disconnectConfirm ? <Button size="sm" variant="ghost" onClick={() => setDisconnectConfirm(true)}><Unplug className="size-3.5" />Disconnect</Button> : <div className="flex flex-wrap items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--danger)_25%,var(--border))] px-2 py-1.5 text-xs"><span>Historical conversations remain available.</span><Button size="sm" variant="danger" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>Confirm disconnect</Button><Button size="sm" onClick={() => setDisconnectConfirm(false)}>Cancel</Button></div>}
            </div>
          </div>
        ) : null}
      </Surface>

      <WhatsAppIntegration />

      <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--muted-foreground)]"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />Refresh tokens are server-only and encrypted at rest by the application. Tokens, OAuth codes and full email bodies are not surfaced here.</div>
    </div>
  );
}
