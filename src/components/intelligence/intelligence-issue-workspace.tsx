"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  GitCommitHorizontal,
  Languages,
  MessageSquareText,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { EmergingIssue, Priority } from "@/lib/domain";
import { resolveDetail } from "@/lib/mocks/data";

const severityTone: Record<Priority, "neutral" | "info" | "warning" | "danger"> = { low: "neutral", medium: "info", high: "warning", critical: "danger" };

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>;
}

export function IntelligenceIssueWorkspace({ issue }: { issue: EmergingIssue }) {
  const [mockState, setMockState] = useState<string>(issue.status);
  const representatives = issue.representativeConversationIds.map(resolveDetail);
  const marker = issue.timeline.find((point) => point.marker);
  const chartData = issue.timeline.map((point) => ({ ...point, baselineRange: [point.baselineLow, point.baselineHigh] }));

  const action = (state: string, message: string) => {
    setMockState(state);
    toast.success(message, { description: "Mock action only — no backend incident or ownership state changed." });
  };

  return (
    <div className="si-page mx-auto max-w-[1500px]">
      <div className="mb-4"><Link href="/intelligence" className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><ArrowLeft className="size-3.5" />Intelligence</Link></div>
      <div className="si-page-header">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={mockState === "incident" ? "danger" : mockState === "emerging" ? "warning" : "neutral"}>{mockState}</Badge><Badge tone={severityTone[issue.severity]}>{issue.severity}</Badge><Badge>{issue.relatedProductArea}</Badge></div>
          <h1 className="si-page-title">{issue.title}</h1>
          <p className="si-page-subtitle max-w-4xl">{issue.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => action("watching", "Issue added to watch list")}><BellRing className="size-3.5" />Watch issue</Button>
          <Button size="sm" onClick={() => action("assigned", "Mock owner assigned")}><UserRoundCheck className="size-3.5" />Assign owner</Button>
          <Button size="sm" variant="primary" onClick={() => action("incident", "Incident draft created")}><AlertTriangle className="size-3.5" />Create incident</Button>
          <Button size="sm" onClick={() => action("resolved", "Issue marked resolved in mock state")}><CheckCircle2 className="size-3.5" />Mark resolved</Button>
        </div>
      </div>

      <Surface className="mb-4 border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] p-4">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" /><div><div className="text-sm font-semibold">Observed issue signal, not confirmed root cause</div><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">Detection is supported by sample size, customer count, time-window growth and representative conversations. Correlation candidates remain hypotheses until independent product or incident telemetry confirms cause.</p></div></div>
      </Surface>

      <Surface className="mb-4 p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="Conversations" value={String(issue.conversationCount)} />
          <Metric label="Customers" value={String(issue.uniqueCustomerCount)} />
          <Metric label="First seen" value={new Date(issue.firstSeenAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"} />
          <Metric label="Active duration" value={`${Math.floor(issue.activeMinutes / 60)}h ${issue.activeMinutes % 60}m`} />
          <Metric label="Current volume" value={`${issue.currentPerHour}/h`} />
          <Metric label="Owner" value={issue.owner ?? "Unassigned"} />
        </div>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_0.8fr]">
        <div className="space-y-4">
          <Surface className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Growth timeline</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Observed volume against the expected baseline range.</p></div>
            <div className="h-[320px] p-3">
              <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ left: -12, right: 12, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="time" interval={3} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={38} />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "var(--border)", background: "var(--surface-1)", fontSize: 12 }} />
                <Area type="monotone" dataKey="baselineRange" name="Expected range" stroke="var(--border-strong)" fill="var(--surface-3)" fillOpacity={0.78} />
                <Area type="monotone" dataKey="actual" name="Observed" stroke="var(--warning)" fill="color-mix(in srgb, var(--warning) 14%, transparent)" strokeWidth={2} />
                {marker ? <ReferenceLine x={marker.time} stroke="var(--ai)" strokeDasharray="4 4" /> : null}
              </AreaChart></ResponsiveContainer>
            </div>
          </Surface>

          <div className="grid gap-4 md:grid-cols-3">
            <Surface className="p-4"><div className="text-xs text-[var(--muted-foreground)]">Baseline</div><div className="mt-1 text-2xl font-semibold">{issue.baselinePerHour[0]}–{issue.baselinePerHour[1]} / hour</div></Surface>
            <Surface className="p-4"><div className="text-xs text-[var(--muted-foreground)]">Current</div><div className="mt-1 text-2xl font-semibold">{issue.currentPerHour} / hour</div></Surface>
            <Surface className="p-4"><div className="text-xs text-[var(--muted-foreground)]">Change</div><div className="mt-1 text-2xl font-semibold text-[var(--warning)]">+{issue.growthPercent}%</div></Surface>
          </div>

          <Surface className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3"><MessageSquareText className="size-4 text-[var(--info)]" /><h2 className="text-sm font-semibold">Representative conversations</h2></div>
            <div className="divide-y divide-[var(--border)]">
              {representatives.map((conversation) => (
                <Link key={conversation.id} href={`/inbox/${conversation.id}`} className="grid gap-2 px-4 py-3 transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] md:grid-cols-[180px_1fr_auto] md:items-center">
                  <div><div className="text-xs font-semibold">{conversation.customer.name}</div><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{conversation.customer.locale ?? "en"} · {conversation.id}</div></div>
                  <div className="min-w-0"><div className="truncate text-xs">{conversation.messages.find((message) => message.author === "customer")?.body}</div><div className="mt-1 flex gap-1.5"><Badge tone={severityTone[conversation.priority]}>{conversation.priority}</Badge><Badge>{conversation.category}</Badge></div></div>
                  <ArrowRight className="size-3.5 text-[var(--muted-foreground)]" />
                </Link>
              ))}
            </div>
          </Surface>

          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="p-4">
              <h2 className="text-sm font-semibold">Common phrases / intents</h2>
              <div className="mt-3 divide-y divide-[var(--border)]">
                {issue.commonPhrases.map((pattern, index) => <div key={pattern.phrase} className="flex items-center gap-3 py-2.5"><span className="w-5 text-[10px] font-medium text-[var(--muted-foreground)]">{index + 1}</span><span className="min-w-0 flex-1 text-xs font-medium">“{pattern.phrase}”</span><span className="text-xs text-[var(--muted-foreground)]">{pattern.count} conversations</span></div>)}
              </div>
            </Surface>
            <Surface className="p-4">
              <h2 className="text-sm font-semibold">Evidence basis</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-[var(--muted-foreground)]">Sample size</div><div className="mt-1 font-semibold">{issue.evidenceSummary.sampleSize}</div></div>
                <div><div className="text-[var(--muted-foreground)]">Window</div><div className="mt-1 font-semibold">{issue.evidenceSummary.windowLabel}</div></div>
                <div><div className="text-[var(--muted-foreground)]">Affected customers</div><div className="mt-1 font-semibold">{issue.evidenceSummary.affectedCustomers}</div></div>
                <div><div className="text-[var(--muted-foreground)]">Product areas</div><div className="mt-1 font-semibold">{issue.evidenceSummary.productAreas.join(", ")}</div></div>
              </div>
              <div className="mt-4"><div className="flex items-center gap-1.5 text-xs font-medium"><Languages className="size-3.5" />Language distribution</div><div className="mt-2 flex flex-wrap gap-1.5">{issue.evidenceSummary.languages.map((entry) => <Badge key={entry.locale}>{entry.locale} · {entry.count}</Badge>)}</div></div>
            </Surface>
          </div>
        </div>

        <div className="space-y-4">
          <Surface className="p-4">
            <div className="flex items-center gap-2"><GitCommitHorizontal className="size-4 text-[var(--ai)]" /><h2 className="text-sm font-semibold">Correlation candidates</h2></div>
            <div className="mt-3 space-y-3">
              {issue.correlationCandidates.length ? issue.correlationCandidates.map((candidate) => <div key={candidate.label} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3"><div className="flex items-start justify-between gap-3"><div className="text-xs font-semibold">{candidate.label}</div><Badge tone={candidate.strength === "strong" ? "warning" : candidate.strength === "moderate" ? "info" : "neutral"}>{candidate.strength}</Badge></div><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{candidate.reason}</p>{candidate.eventAt ? <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]"><div><span className="text-[var(--muted-foreground)]">Event</span><div>{new Date(candidate.eventAt).toISOString().slice(11,16)} UTC</div></div><div><span className="text-[var(--muted-foreground)]">First signal</span><div>{candidate.firstSignalAt ? new Date(candidate.firstSignalAt).toISOString().slice(11,16) + " UTC" : "—"}</div></div></div> : null}<div className="mt-2 border-t border-[var(--border)] pt-2 text-[11px] font-medium text-[var(--warning)]">{candidate.disclaimer}</div></div>) : <div className="rounded-md border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted-foreground)]">No meaningful correlation candidate has crossed the display threshold.</div>}
            </div>
          </Surface>

          <Surface className="p-4">
            <div className="flex items-center gap-2"><DatabaseZap className="size-4 text-[var(--info)]" /><h2 className="text-sm font-semibold">Related knowledge</h2></div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Sources may explain answer quality or policy ambiguity; they do not prove the product issue itself.</p>
            <div className="mt-3 space-y-2">{issue.relatedKnowledgeIds.map((sourceId) => <Link key={sourceId} href={`/knowledge?tab=sources&source=${sourceId}`} className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--surface-2)]"><span className="font-medium">{sourceId.replaceAll("-", " ")}</span><ArrowRight className="size-3.5 text-[var(--muted-foreground)]" /></Link>)}</div>
          </Surface>

          <Surface className="p-4">
            <div className="flex items-center gap-2"><Clock3 className="size-4" /><h2 className="text-sm font-semibold">Controlled actions</h2></div>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">These controls update local mock state only. They do not create incidents, assignments or resolutions in a backend.</p>
            <div className="mt-3 grid gap-2">
              <Link href={`/inbox?q=${encodeURIComponent(issue.commonPhrases[0]?.phrase ?? issue.title)}`} className="inline-flex h-8 items-center justify-between rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Open filtered conversations <ArrowRight className="size-3.5" /></Link>
              <Button size="sm" onClick={() => action("watching", "Issue added to watch list")}><BellRing className="size-3.5" />Watch issue</Button>
              <Button size="sm" onClick={() => action("assigned", "Mock owner assigned")}><UserRoundCheck className="size-3.5" />Assign owner</Button>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
