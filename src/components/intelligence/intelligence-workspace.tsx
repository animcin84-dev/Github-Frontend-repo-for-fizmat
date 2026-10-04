"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  DatabaseZap,
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
import { DetailBand, FilterHinge, OperationalWorkspace, ReferenceLink, ReferenceSummary, RouteHeader, WorkspaceTabs } from "@/components/reference/reference-layout";
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
  const selectClass = "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  return (
    <FilterHinge count={active}>
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
    </FilterHinge>
  );
}

function SignalChart({ issue }: { issue: EmergingIssue }) {
  const marker = issue.timeline.find((point) => point.marker);
  const chartData = issue.timeline.map((point) => ({ ...point, baselineRange: [point.baselineLow, point.baselineHigh] }));
  return (
    <Surface className="si-signal-chart overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><TrendingUp className="size-4 text-[var(--warning)]" /><h2 className="text-sm font-semibold">Temporal signal</h2><Badge tone={statusTone[issue.status]}>{issue.status}</Badge></div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{issue.title} · expected {issue.baselinePerHour[0]}–{issue.baselinePerHour[1]}/h, current {issue.currentPerHour}/h</p>
        </div>
        <Link href={`/intelligence/${issue.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">Open investigation <ArrowRight className="size-3" /></Link>
      </div>
      <div className="h-[112px] p-2">
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

  if (query.isLoading || !selected) return <LoadingState label="Analyzing support telemetry…" />;

  const act = (id: string, state: string, message: string) => {
    setMockStates((current) => ({ ...current, [id]: state }));
    toast.success(message, { description: "Mock control only — no backend incident state was changed." });
  };

  const opportunities = categoryCounts.slice(0,3).map(([label,value]) => ({label,value}));
  return <div className="si-page">
    <RouteHeader title="Intelligence" note={<Badge>Demo telemetry</Badge>} actions={<ReferenceLink href="/automation?tab=procedures">Automation ↗</ReferenceLink>} />
    <ReferenceSummary metrics={[{label:"Active issue clusters",value:issues.filter((item) => item.status !== "resolved").length},{label:"Rising issues",value:emerging},{label:"Active incidents",value:activeIncidents}]} activity={issues.slice(0,4).map((item) => ({label:item.relatedProductArea,value:item.conversationCount,marker:item.title.slice(0,1)}))} activityLabel="Demonstration issue volumes" signal={{label:"Conversations represented",value:represented.toLocaleString(),note:"Demo",options:opportunities,action:<ReferenceLink href="/automation?tab=procedures">Review ↗</ReferenceLink>}} />
    <FilterBar status={status} setStatus={setStatus} severity={severity} setSeverity={setSeverity} range={range} setRange={setRange} area={area} setArea={setArea} minSample={minSample} setMinSample={setMinSample} sort={sort} setSort={setSort} areas={areas} />
    <OperationalWorkspace detailKey={selected.id} className="si-route-workspace si-intelligence-workspace" title="Issue clusters" tabs={<WorkspaceTabs label="Issue views" items={[{id:"",label:"All",count:issues.length},{id:"emerging",label:"Rising",count:emerging},{id:"incident",label:"Incidents",count:activeIncidents}]} active={status} onChange={(id) => setStatus(id || null)} />} master={<>
      {filtered.map((issue) => <div key={issue.id} className={cn("si-reference-row",selected.id === issue.id && "is-selected")}><span className="si-mini-avatar">{issue.relatedProductArea.slice(0,1)}</span><button className="si-row-copy text-left" aria-pressed={issue.id === selected.id} onClick={() => setSignal(issue.id)}><strong>{issue.title}</strong><span>{issue.conversationCount} conversations · +{issue.growthPercent}%</span></button><Badge tone={severityTone[issue.severity]}>{issue.severity}</Badge><Link href={`/intelligence/${issue.id}`} aria-label={`Investigate ${issue.title}`} className="si-circle-control"><ArrowRight size={13}/></Link></div>)}
      {!filtered.length ? <div className="si-empty-inset"><Search className="mx-auto mb-2" size={18}/><h2>No issue clusters match these filters</h2><p>Reduce minimum sample size or widen the time range.</p></div> : null}
    </>} detail={<>
      <div className="si-detail-scroll">
        <div className="si-detail-header"><div><div className="si-label">Selected issue · {selected.relatedProductArea}</div><h2>{selected.title}</h2></div><Badge tone={statusTone[selected.status]}>{selected.status}</Badge></div>
        <div className="si-detail-grid"><div className="si-detail-tile"><span>Impact</span><strong>{selected.uniqueCustomerCount} customers</strong><span>{selected.conversationCount} conversations</span></div><div className="si-detail-tile"><span>Evidence</span><strong className="capitalize">{selected.evidenceState.replaceAll("_"," ")}</strong><span>Root cause unconfirmed</span></div><div className="si-detail-tile"><span>Knowledge</span><strong>{selected.relatedKnowledgeIds.length} sources</strong><span>Linked for review</span></div></div>
        <p className="my-2 text-xs leading-5">{selected.summary}</p>
        <SignalChart issue={selected}/>
        <div className="mt-3 flex flex-wrap gap-2"><ReferenceLink href={`/inbox?q=${encodeURIComponent(selected.commonPhrases[0]?.phrase ?? selected.title)}`}>View conversations</ReferenceLink><ReferenceLink href={`/knowledge?tab=sources&source=${selected.relatedKnowledgeIds[0] ?? ""}`}><DatabaseZap size={13}/>Related knowledge</ReferenceLink><ReferenceLink href={selected.id === "issue-duplicate-payment" ? "/automation?tab=procedures&procedure=procedure-refund" : selected.id === "issue-subscription-pause" ? "/automation?tab=procedures&procedure=procedure-subscription-cancel" : "/automation?tab=rollouts"}><ShieldCheck size={13}/>Affected automation</ReferenceLink></div>
        <details className="mt-4 text-xs"><summary className="cursor-pointer">Controlled demo actions</summary><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => act(selected.id,"watching","Issue added to watch list")}><BellRing size={13}/>Watch</Button><Button size="sm" onClick={() => act(selected.id,"incident draft","Incident draft created")}><AlertTriangle size={13}/>Create incident</Button></div><p className="mt-2 text-[11px]">Local simulation only. Incident and ownership state is not persisted.</p></details>
        {mockStates[selected.id] ? <p className="mt-3 text-xs">Mock state: {mockStates[selected.id]}</p> : null}
      </div>
      <DetailBand metrics={[{label:"Conversations",value:selected.conversationCount},{label:"Customers",value:selected.uniqueCustomerCount},{label:"Growth",value:`+${selected.growthPercent}%`}]} action={<Button variant="primary" size="sm" onClick={() => act(selected.id,"investigating","Issue marked for investigation")}><Search size={13}/>Investigate</Button>} />
    </>} />
    <p className="si-metric-note mt-3">Demonstration telemetry · sample size and growth indicate signals; correlation does not confirm root cause.</p>
  </div>;
}
