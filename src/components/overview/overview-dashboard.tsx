"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, Clock3, DatabaseZap, ShieldCheck, TimerReset } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/page-state";
import { Surface } from "@/components/ui/surface";
import { getWorkspaceSnapshot } from "@/lib/mocks/service";

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: string; note: string; tone?: "neutral" | "success" | "warning" }) {
  return <div className="min-w-0"><div className="text-xs text-[var(--muted-foreground)]">{label}</div><div className={tone === "success" ? "mt-1 text-2xl font-semibold text-[var(--success)]" : tone === "warning" ? "mt-1 text-2xl font-semibold text-[var(--warning)]" : "mt-1 text-2xl font-semibold"}>{value}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{note}</div></div>;
}

export function OverviewDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["workspace-snapshot"], queryFn: getWorkspaceSnapshot });
  if (isLoading || !data) return <LoadingState label="Loading operational snapshot…" />;

  const issue = data.emergingIssues[0];
  const conflicting = data.knowledgeSources.filter((source) => source.status === "conflict").length;
  const healthy = data.knowledgeSources.filter((source) => source.status === "healthy").length;

  return (
    <div className="si-page mx-auto max-w-[1680px]">
      <div className="si-page-header">
        <div><h1 className="si-page-title">Overview</h1><p className="si-page-subtitle">What needs human attention, where AI is safe, and what support traffic is telling the business.</p></div>
        <div className="flex items-center gap-2"><Badge tone="success"><span className="size-1.5 rounded-full bg-current" />Live</Badge><span className="text-xs text-[var(--muted-foreground)]">Updated just now</span></div>
      </div>

      <Surface className="mb-4 overflow-hidden border-[color-mix(in_srgb,var(--warning)_35%,var(--border))]">
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]"><BrainCircuit className="size-5" /></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge tone="warning">Emerging issue</Badge><span className="text-xs text-[var(--muted-foreground)]">{issue.conversationCount} conversations · {issue.uniqueCustomerCount} customers</span></div><h2 className="mt-1 text-base font-semibold">{issue.title}</h2><p className="mt-1 max-w-4xl text-sm text-[var(--muted-foreground)]">{issue.summary} Release timing is correlated, not confirmed as root cause.</p></div>
          <Link href={`/intelligence/${issue.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 text-xs font-medium hover:bg-[var(--surface-2)]">Inspect issue <ArrowRight className="size-3.5" /></Link>
        </div>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-4">
          <Surface className="p-4">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Queue health</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Current operational state</p></div><Link href="/inbox?sla=warning" className="text-xs font-medium text-[var(--accent)] hover:underline">Open at-risk queue</Link></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Open conversations" value={data.queue.open.toLocaleString()} note={`${data.queue.waitingAgent} waiting on an agent`} />
              <Metric label="SLA risk" value={data.queue.slaRisk.toLocaleString()} note={`${data.queue.critical} critical`} tone="warning" />
              <Metric label="Verified resolutions" value={data.verifiedToday.toLocaleString()} note="Quality floor passed today" tone="success" />
              <Metric label="AI-assist acceptance" value={`${Math.round(data.aiQuality.draftAcceptanceRate * 100)}%`} note={`${Math.round(data.aiQuality.majorEditRate * 100)}% major edits`} />
            </div>
          </Surface>

          <Surface className="p-4">
            <div className="mb-3 flex items-start justify-between gap-4"><div><h2 className="text-sm font-semibold">Conversation volume & SLA exposure</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Hourly support load. Use the risk series to staff the queue, not as a vanity chart.</p></div><Badge>24h</Badge></div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volumeSeries} margin={{ left: -12, right: 6, top: 8, bottom: 0 }}>
                  <defs><linearGradient id="vol" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--info)" stopOpacity={0.2}/><stop offset="95%" stopColor="var(--info)" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={3} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={42} />
                  <Tooltip contentStyle={{ borderRadius: 8, borderColor: "var(--border)", background: "var(--surface-1)", fontSize: 12 }} />
                  <Area type="monotone" dataKey="conversations" name="Conversations" stroke="var(--info)" fill="url(#vol)" strokeWidth={2} />
                  <Area type="monotone" dataKey="slaRisk" name="SLA risk" stroke="var(--warning)" fill="transparent" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Surface>

          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="p-4">
              <div className="mb-3 flex items-center gap-2"><ShieldCheck className="size-4 text-[var(--success)]" /><h2 className="text-sm font-semibold">AI quality today</h2></div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-[var(--muted-foreground)]">Accepted unchanged</span><span className="font-medium">{Math.round(data.aiQuality.unchangedRate * 100)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-[var(--muted-foreground)]">Human takeover</span><span className="font-medium">{Math.round(data.aiQuality.humanTakeoverRate * 100)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-[var(--muted-foreground)]">Unsupported claims</span><span className="font-medium">{(data.aiQuality.unsupportedClaimRate * 100).toFixed(1)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-[var(--muted-foreground)]">Reopened after AI outcome</span><span className="font-medium">{(data.aiQuality.reopenRate * 100).toFixed(1)}%</span></div>
              </div>
              <Link href="/ai-quality" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">Inspect failure examples <ArrowRight className="size-3" /></Link>
            </Surface>

            <Surface className="p-4">
              <div className="mb-3 flex items-center gap-2"><DatabaseZap className="size-4 text-[var(--info)]" /><h2 className="text-sm font-semibold">Knowledge health</h2></div>
              <div className="grid grid-cols-3 gap-3"><Metric label="Healthy" value={String(healthy)} note="current sources" tone="success" /><Metric label="Conflicts" value={String(conflicting)} note="owner review" tone="warning" /><Metric label="Open gaps" value={String(data.knowledgeGaps.length)} note="repeated intents" /></div>
              <div className="mt-4 rounded-md border border-[color-mix(in_srgb,var(--warning)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_7%,transparent)] p-3 text-xs"><div className="font-medium">Subscription pause eligibility</div><div className="mt-1 text-[var(--muted-foreground)]">No authoritative current answer across {data.knowledgeGaps[0].conversationCount} conversations. AI answer is paused.</div></div>
            </Surface>
          </div>
        </div>

        <div className="space-y-4">
          <Surface className="p-4">
            <div className="mb-4 flex items-center gap-2"><TimerReset className="size-4" /><h2 className="text-sm font-semibold">Estimated value</h2><Badge tone="info">Estimate</Badge></div>
            <div className="grid grid-cols-2 gap-4"><Metric label="Agent minutes saved" value={data.estimatedMinutesSaved.toLocaleString()} note="Modelled from verified + assisted work" /><Metric label="Equivalent hours" value={(data.estimatedMinutesSaved / 60).toFixed(1)} note="Not a booked accounting saving" /></div>
            <p className="mt-4 text-xs leading-5 text-[var(--muted-foreground)]">Estimate is based on observed outcomes and a mock baseline handle time. The production product should accept customer baselines and show a sensitivity range.</p>
          </Surface>

          <Surface className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Needs human attention</h2></div>
            <div className="divide-y divide-[var(--border)]">
              {[
                { icon: AlertTriangle, title: "17 conversations breached SLA", note: "Payments and security dominate", href: "/inbox?sla=breach", tone: "text-[var(--danger)]" },
                { icon: Clock3, title: "Subscription policy needs owner review", note: "32 repeated questions have no approved answer", href: "/knowledge", tone: "text-[var(--warning)]" },
                { icon: CheckCircle2, title: "326 verified resolutions today", note: "Outcome evidence passed the quality floor", href: "/ai-quality", tone: "text-[var(--success)]" },
              ].map(({ icon: Icon, title, note, href, tone }) => <Link key={title} href={href} className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"><Icon className={`mt-0.5 size-4 ${tone}`} /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{title}</div><div className="mt-0.5 text-xs text-[var(--muted-foreground)]">{note}</div></div><ArrowRight className="mt-0.5 size-4 text-[var(--muted-foreground)]" /></Link>)}
            </div>
          </Surface>

          <Surface className="p-4">
            <h2 className="text-sm font-semibold">Recent intelligence</h2>
            <div className="mt-3 space-y-3">
              {data.emergingIssues.map((item) => <div key={item.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3"><div className="flex items-center gap-2"><Badge tone={item.status === "emerging" ? "warning" : "neutral"}>{item.status}</Badge><span className="text-xs text-[var(--muted-foreground)]">+{item.growthPercent}% vs baseline</span></div><div className="mt-2 text-sm font-medium">{item.title}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">First detected {formatDistanceToNowStrict(new Date(item.firstSeenAt), { addSuffix: true })}</div></div>)}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
