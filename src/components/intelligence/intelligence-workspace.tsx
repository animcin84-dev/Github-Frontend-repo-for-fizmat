"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CircleDot,
  Clock3,
  DatabaseZap,
  Filter,
  GitCommitHorizontal,
  MessageSquareText,
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-state";
import { Surface } from "@/components/ui/surface";
import type { EmergingIssue, Priority } from "@/lib/domain";
import { getIntelligenceIssues } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";

const severityRank: Record<Priority, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const severityTone: Record<Priority, "neutral" | "info" | "warning" | "danger"> = { low: "neutral", medium: "info", high: "warning", critical: "danger" };
const statusTone: Record<EmergingIssue["status"], "neutral" | "info" | "warning" | "danger"> = {
  watching: "neutral",
  emerging: "warning",
  incident: "danger",
  resolved: "info",
};

const NOW = Date.parse("2026-10-03T09:15:00Z");

function ageLabel(value: string) {
  const minutes = Math.max(1, Math.round((NOW - Date.parse(value)) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function OperationalStat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="min-w-0 border-r border-[var(--border)] px-3 last:border-r-0"><div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div><div className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{note}</div></div>;
}

function FilterBar({
  status,
  setStatus,
  severity,
  setSeverity,
  range,
  setRange,
  area,
  setArea,
  minSample,
  setMinSample,
  sort,
  setSort,
  areas,
}: {
  status: string;
  setStatus: (value: string | null) => void;
  severity: string;
  setSeverity: (value: string | null) => void;
  range: string;
  setRange: (value: string | null) => void;
  area: string;
  setArea: (value: string | null) => void;
  minSample: string;
  setMinSample: (value: string | null) => void;
  sort: string;
  setSort: (value: string | null) => void;
  areas: string[];
}) {
  const active = [status, severity, area, minSample !== "0" ? minSample : ""].filter(Boolean).length;
  const selectClass = "h-8 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-2">
      <div className="mr-1 flex items-center gap-1.5 text-xs font-medium"><Filter className="size-3.5" />Filters {active ? <Badge tone="info">{active}</Badge> : null}</div>
      <select className={selectClass} aria-label="Issue status" value={status} onChange={(event) => setStatus(event.target.value || null)}>
        <option value="">All statuses</option><option value="incident">Incident</option><option value="emerging">Emerging</option><option value="watching">Watching</option><option value="resolved">Resolved</option>
      </select>
      <select className={selectClass} aria-label="Issue severity" value={severity} onChange={(event) => setSeverity(event.target.value || null)}>
        <option value="">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
      </select>
      <select className={selectClass} aria-label="Time range" value={range} onChange={(event) => setRange(event.target.value || "7d")}>
        <option value="24h">24 hours</option><option value="7d">7 days</option><option value="30d">30 days</option>
      </select>
      <select className={selectClass} aria-label="Product area" value={area} onChange={(event) => setArea(event.target.value || null)}>
        <option value="">All product areas</option>{areas.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select className={selectClass} aria-label="Minimum sample size" value={minSample} onChange={(event) => setMinSample(event.target.value || "0")}>
        <option value="0">Any sample</option><option value="20">20+ conversations</option><option value="40">40+ conversations</option><option value="60">60+ conversations</option>
      </select>
      <select className={cn(selectClass, "ml-auto")} aria-label="Sort issues" value={sort} onChange={(event) => setSort(event.target.value || "growth")}>
        <option value="growth">Sort: growth</option><option value="severity">Sort: severity</option><option value="conversations">Sort: conversations</option><option value="recent">Sort: recent activity</option>
      </select>
    </div>
  );
}

function SignalChart({ issue }: { issue: EmergingIssue }) {
  const marker = issue.timeline.find((point) => point.marker);
  const chartData = issue.timeline.map((point) => ({ ...point, baselineRange: [point.baselineLow, point.baselineHigh] }));
  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><TrendingUp className="size-4 text-[var(--warning)]" /><h2 className="text-sm font-semibold">Temporal signal</h2><Badge tone={statusTone[issue.status]}>{issue.status}</Badge></div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{issue.title} · expected {issue.baselinePerHour[0]}–{issue.baselinePerHour[1]}/h, current {issue.currentPerHour}/h</p>
        </div>
        <Link href={`/intelligence/${issue.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">Open investigation <ArrowRight className="size-3" /></Link>
      </div>
      <div className="h-[290px] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: -14, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="time" interval={3} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={38} />
            <Tooltip contentStyle={{ borderRadius: 8, borderColor: "var(--border)", background: "var(--surface-1)", fontSize: 12 }} />
            <Area type="monotone" dataKey="baselineRange" name="Expected range" stroke="var(--border-strong)" fill="var(--surface-3)" fillOpacity={0.72} />
            <Area type="monotone" dataKey="actual" name="Observed conversations" stroke="var(--warning)" fill="color-mix(in srgb, var(--warning) 14%, transparent)" strokeWidth={2} />
            {marker ? <ReferenceLine x={marker.time} stroke="var(--ai)" strokeDasharray="4 4" label={{ value: marker.marker, fill: "var(--muted-foreground)", fontSize: 10, position: "insideTopRight" }} /> : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {marker ? <div className="border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--muted-foreground)]"><span className="font-medium text-[var(--foreground)]">{marker.marker}</span> overlaps with issue growth. Root cause is not confirmed.</div> : null}
    </Surface>
  );
}

export function IntelligenceWorkspace() {
  const query = useQuery({ queryKey: ["intelligence-issues"], queryFn: getIntelligenceIssues });
  const [status, setStatus] = useQueryState("status", { defaultValue: "" });
  const [severity, setSeverity] = useQueryState("severity", { defaultValue: "" });
  const [range, setRange] = useQueryState("range", { defaultValue: "7d" });
  const [area, setArea] = useQueryState("area", { defaultValue: "" });
  const [minSample, setMinSample] = useQueryState("min", { defaultValue: "0" });
  const [sort, setSort] = useQueryState("sort", { defaultValue: "growth" });
  const [signal, setSignal] = useQueryState("signal", { defaultValue: "issue-duplicate-payment" });
  const [mockStates, setMockStates] = useState<Record<string, string>>({});

  const issues = useMemo(() => query.data ?? [], [query.data]);
  const areas = useMemo(() => Array.from(new Set(issues.map((item) => item.relatedProductArea))).sort(), [issues]);

  const filtered = useMemo(() => {
    const rangeMs = range === "24h" ? 24 * 60 * 60_000 : range === "30d" ? 30 * 24 * 60 * 60_000 : 7 * 24 * 60 * 60_000;
    const min = Number(minSample || 0);
    const result = issues.filter((item) =>
      (!status || item.status === status) &&
      (!severity || item.severity === severity) &&
      (!area || item.relatedProductArea === area) &&
      item.conversationCount >= min &&
      NOW - Date.parse(item.lastActivityAt) <= rangeMs
    );
    return [...result].sort((a, b) => {
      if (sort === "severity") return severityRank[b.severity] - severityRank[a.severity] || b.growthPercent - a.growthPercent;
      if (sort === "conversations") return b.conversationCount - a.conversationCount;
      if (sort === "recent") return Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt);
      return b.growthPercent - a.growthPercent;
    });
  }, [issues, status, severity, range, area, minSample, sort]);

  const selected = issues.find((item) => item.id === signal) ?? filtered[0] ?? issues[0];
  const activeIncidents = issues.filter((item) => item.status === "incident").length;
  const emerging = issues.filter((item) => item.status === "emerging").length;
  const represented = issues.reduce((sum, item) => sum + item.conversationCount, 0);
  const categoryCounts = useMemo(() => {
    const labels: Record<EmergingIssue["signalCategory"], string> = {
      product_bug: "Product bug", ux_confusion: "UX confusion", missing_knowledge: "Missing knowledge", policy_ambiguity: "Policy ambiguity",
      operations: "Operations issue", billing_payment: "Billing/payment", external_dependency: "External dependency", unknown: "Unknown",
    };
    const counts = new Map<string, number>();
    for (const item of issues) counts.set(labels[item.signalCategory], (counts.get(labels[item.signalCategory]) ?? 0) + item.conversationCount);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [issues]);
  const maxCategory = Math.max(...categoryCounts.map(([, count]) => count), 1);

  if (query.isLoading || !selected) return <LoadingState label="Analyzing support telemetry…" />;

  const act = (id: string, state: string, message: string) => {
    setMockStates((current) => ({ ...current, [id]: state }));
    toast.success(message, { description: "Mock control only — no backend incident state was changed." });
  };

  return (
    <div className="si-page mx-auto max-w-[1720px]">
      <div className="si-page-header">
        <div><h1 className="si-page-title">Intelligence</h1><p className="si-page-subtitle">Support conversations as product telemetry: detect change, inspect evidence, then decide what deserves investigation.</p></div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><CircleDot className="size-3.5 text-[var(--success)]" />Last analysis 09:12 UTC</div>
      </div>

      <Surface className="mb-4 overflow-hidden">
        <div className="grid grid-cols-2 gap-y-3 py-3 sm:grid-cols-3 lg:grid-cols-5">
          <OperationalStat label="Active incidents" value={String(activeIncidents)} note="requires operational attention" />
          <OperationalStat label="Emerging issues" value={String(emerging)} note="growing above baseline" />
          <OperationalStat label="Conversations represented" value={represented.toLocaleString()} note="across active clusters" />
          <OperationalStat label="New signals today" value="5" note="2 below sample threshold" />
          <OperationalStat label="Last analysis" value="09:12" note="deterministic demo snapshot" />
        </div>
      </Surface>

      <Surface className="mb-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div><h2 className="text-sm font-semibold">Issue feed</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Clusters are evidence-backed signals, not proof of root cause.</p></div>
          <Badge>{filtered.length} visible</Badge>
        </div>
        <FilterBar status={status} setStatus={setStatus} severity={severity} setSeverity={setSeverity} range={range} setRange={setRange} area={area} setArea={setArea} minSample={minSample} setMinSample={setMinSample} sort={sort} setSort={setSort} areas={areas} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
              <tr>
                {["Issue", "Status", "Severity", "Growth", "Conversations", "Customers", "Product area", "First seen", "Last activity", "Evidence", "Owner", ""].map((label) => <th key={label} className="border-b border-[var(--border)] px-3 py-2 font-medium">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue) => {
                const isSelected = issue.id === selected.id;
                return <tr key={issue.id} className={cn("border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]", isSelected && "bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-1))]")}>
                  <td className="max-w-[320px] px-3 py-3"><button onClick={() => setSignal(issue.id)} className="block max-w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><span className="block truncate font-semibold">{issue.title}</span><span className="mt-0.5 block truncate text-[11px] text-[var(--muted-foreground)]">{issue.summary}</span></button></td>
                  <td className="px-3 py-3"><Badge tone={statusTone[issue.status]}>{issue.status}</Badge></td>
                  <td className="px-3 py-3"><Badge tone={severityTone[issue.severity]}>{issue.severity}</Badge></td>
                  <td className="px-3 py-3 font-semibold text-[var(--warning)]">+{issue.growthPercent}%</td>
                  <td className="px-3 py-3 font-medium">{issue.conversationCount}</td>
                  <td className="px-3 py-3">{issue.uniqueCustomerCount}</td>
                  <td className="px-3 py-3">{issue.relatedProductArea}</td>
                  <td className="px-3 py-3 text-[var(--muted-foreground)]">{ageLabel(issue.firstSeenAt)}</td>
                  <td className="px-3 py-3 text-[var(--muted-foreground)]">{ageLabel(issue.lastActivityAt)}</td>
                  <td className="px-3 py-3"><Badge tone={issue.evidenceState === "sufficient" ? "success" : issue.evidenceState === "limited" ? "warning" : "neutral"}>{issue.evidenceState.replace("_", " ")}</Badge></td>
                  <td className="px-3 py-3 text-[var(--muted-foreground)]">{issue.owner ?? "Unassigned"}</td>
                  <td className="px-3 py-3 text-right"><Link href={`/intelligence/${issue.id}`} aria-label={`Investigate ${issue.title}`} className="inline-flex size-7 items-center justify-center rounded-md hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ArrowRight className="size-3.5" /></Link></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <div className="grid min-h-40 place-items-center p-6 text-center"><div><Search className="mx-auto size-5 text-[var(--muted-foreground)]" /><div className="mt-2 text-sm font-medium">No issue clusters match these filters</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Reduce minimum sample size or widen the time range.</div></div></div> : null}
      </Surface>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_0.8fr]">
        <SignalChart issue={selected} />
        <div className="space-y-4">
          <Surface className="p-4">
            <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-[var(--warning)]" /><h2 className="text-sm font-semibold">High-impact signal</h2></div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div><div className="text-2xl font-semibold">{selected.conversationCount}</div><div className="text-xs text-[var(--muted-foreground)]">conversations</div></div>
              <div><div className="text-2xl font-semibold">{selected.uniqueCustomerCount}</div><div className="text-xs text-[var(--muted-foreground)]">customers</div></div>
              <div><div className="text-2xl font-semibold text-[var(--warning)]">+{selected.growthPercent}%</div><div className="text-xs text-[var(--muted-foreground)]">vs baseline</div></div>
              <div><div className="text-2xl font-semibold">{Math.floor(selected.activeMinutes / 60)}h {selected.activeMinutes % 60}m</div><div className="text-xs text-[var(--muted-foreground)]">active</div></div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs"><ShieldCheck className="size-3.5 text-[var(--warning)]" /><span>Potential customer impact · evidence state: <strong>{selected.evidenceState.replace("_", " ")}</strong></span></div>
            {mockStates[selected.id] ? <div className="mt-2 text-xs font-medium text-[var(--accent)]">Mock state: {mockStates[selected.id]}</div> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => act(selected.id, "investigating", "Issue marked for investigation")}><Search className="size-3.5" />Investigate</Button>
              <Link href={`/inbox?q=${encodeURIComponent(selected.commonPhrases[0]?.phrase ?? selected.title)}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]"><MessageSquareText className="size-3.5" />View conversations</Link>
              <Link href={`/knowledge?tab=sources&source=${selected.relatedKnowledgeIds[0] ?? ""}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]"><DatabaseZap className="size-3.5" />Related knowledge</Link>
              <Link href={selected.id === "issue-duplicate-payment" ? "/automation?tab=procedures&procedure=procedure-refund" : selected.id === "issue-subscription-pause" ? "/automation?tab=procedures&procedure=procedure-subscription-cancel" : "/automation?tab=rollouts"} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]"><ShieldCheck className="size-3.5" />Affected automation</Link>
              <Button size="sm" onClick={() => act(selected.id, "watching", "Issue added to watch list")}><BellRing className="size-3.5" />Watch</Button>
              <Button size="sm" onClick={() => act(selected.id, "incident draft", "Incident draft created")}><AlertTriangle className="size-3.5" />Create incident</Button>
            </div>
          </Surface>

          <Surface className="p-4">
            <div className="flex items-center gap-2"><GitCommitHorizontal className="size-4 text-[var(--ai)]" /><h2 className="text-sm font-semibold">Signal categories</h2></div>
            <div className="mt-3 space-y-2.5">
              {categoryCounts.map(([label, count]) => <div key={label}><div className="flex items-center justify-between text-xs"><span>{label}</span><span className="text-[var(--muted-foreground)]">{count}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]"><div className="h-full rounded-full bg-[var(--info)]" style={{ width: `${Math.max(6, (count / maxCategory) * 100)}%` }} /></div></div>)}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
