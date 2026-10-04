"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  DatabaseZap,
  GitCompareArrows,
  Languages,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-state";
import { Surface } from "@/components/ui/surface";
import { DetailBand, FilterHinge, OperationalWorkspace, ReferenceSummary, RouteHeader, WorkspaceTabs } from "@/components/reference/reference-layout";
import type {
  AIFailure,
  AIOutcome,
  AutomationReadiness,
  FailureCause,
  KnowledgeSource,
  QualityRecommendation,
  QualityTrendPoint,
  ShadowSimulation,
} from "@/lib/domain";
import { getAIQualityWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";

const QUALITY_NOW = Date.parse("2026-10-03T09:15:00Z");

type WorkspaceData = Awaited<ReturnType<typeof getAIQualityWorkspace>>;
type Tab = "overview" | "failures" | "evaluations" | "shadow";

const rangeMs: Record<string, number> = {
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
  "90d": 90 * 24 * 60 * 60_000,
};

const rootCauseLabels: Record<FailureCause, string> = {
  knowledge: "Knowledge issue",
  policy: "Policy issue",
  retrieval: "Retrieval issue",
  intent_triage: "Intent / triage",
  identity: "Missing identity",
  generation: "Generation issue",
  other: "Other",
};

const localeLabels: Record<AIOutcome["locale"], string> = {
  en: "English",
  "ru-KZ": "Russian",
  "kk-KZ": "Kazakh",
  "ru-kk-mixed": "RU/KZ mixed",
};

function pct(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function pp(value: number, digits = 1) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}pp`;
}

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function toneForDelta(delta: number, inverse = false) {
  const positive = inverse ? delta < 0 : delta > 0;
  const negative = inverse ? delta > 0 : delta < 0;
  return positive ? "text-[var(--success)]" : negative ? "text-[var(--danger)]" : "text-[var(--muted-foreground)]";
}

function filterByRange<T extends { timestamp: string }>(items: T[], range: string) {
  const cutoff = QUALITY_NOW - (rangeMs[range] ?? rangeMs["30d"]);
  return items.filter((item) => Date.parse(item.timestamp) >= cutoff);
}

function CompactMetric({
  label,
  value,
  note,
  delta,
  inverseDelta = false,
}: {
  label: string;
  value: string;
  note: string;
  delta?: number;
  inverseDelta?: boolean;
}) {
  return (
    <div className="min-w-0 border-r border-[var(--border)] px-3 last:border-r-0">
      <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-lg font-semibold">{value}</div>
        {delta !== undefined ? <div className={cn("text-[10px] font-semibold", toneForDelta(delta, inverseDelta))}>{pp(delta)}</div> : null}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{note}</div>
    </div>
  );
}

function RangeSelect({ range, setRange }: { range: string; setRange: (value: string | null) => void }) {
  return (
    <select
      aria-label="AI quality time range"
      value={range}
      onChange={(event) => setRange(event.target.value)}
      className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      <option value="24h">24h</option>
      <option value="7d">7d</option>
      <option value="30d">30d</option>
      <option value="90d">90d</option>
    </select>
  );
}

function OutcomeFunnel({ outcomes }: { outcomes: AIOutcome[] }) {
  const unchanged = outcomes.filter((item) => item.decision === "unchanged").length;
  const minor = outcomes.filter((item) => item.decision === "minor_edit").length;
  const major = outcomes.filter((item) => item.decision === "major_edit").length;
  const rejected = outcomes.filter((item) => item.decision === "rejected").length;
  const takeover = outcomes.filter((item) => item.decision === "human_takeover").length;
  const accepted = unchanged + minor;
  const reopened = outcomes.filter((item) => item.reopened).length;
  const unsupported = outcomes.filter((item) => item.unsupportedClaim).length;
  const maximum = Math.max(outcomes.length, 1);
  const rows = [
    ["AI drafts generated", outcomes.length, "neutral"],
    ["Accepted", accepted, "success"],
    ["Unchanged", unchanged, "success"],
    ["Minor edit", minor, "info"],
    ["Major edit", major, "warning"],
    ["Rejected", rejected, "danger"],
    ["Human takeover", takeover, "ai"],
    ["Reopened", reopened, "warning"],
    ["Unsupported claim", unsupported, "danger"],
  ] as const;

  return (
    <Surface className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">Outcome composition</h2>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Human takeover is shown separately from failure; policy-safe handoff can be the correct outcome.</p>
      </div>
      <div className="p-4">
        <div className="space-y-2.5">
          {rows.map(([label, value, tone], index) => (
            <div key={label} className={cn("grid grid-cols-[126px_1fr_58px] items-center gap-3 text-xs", index === 1 && "border-t border-[var(--border)] pt-2.5")}>
              <span className={index <= 1 ? "font-semibold" : "text-[var(--muted-foreground)]"}>{label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className={cn(
                    "h-full rounded-full",
                    tone === "success" ? "bg-[var(--success)]" :
                    tone === "warning" ? "bg-[var(--warning)]" :
                    tone === "danger" ? "bg-[var(--danger)]" :
                    tone === "ai" ? "bg-[var(--ai)]" :
                    tone === "info" ? "bg-[var(--info)]" : "bg-[var(--border-strong)]",
                  )}
                  style={{ width: `${Math.max(value ? 1.5 : 0, (value / maximum) * 100)}%` }}
                />
              </div>
              <span className="text-right font-semibold tabular-nums">{value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </Surface>
  );
}

function QualityTrend({
  trend,
  range,
  metric,
  setMetric,
}: {
  trend: QualityTrendPoint[];
  range: string;
  metric: string;
  setMetric: (value: string | null) => void;
}) {
  const visible = useMemo(() => filterByRange(trend, range), [trend, range]);
  const metrics = {
    acceptedRate: { label: "Accepted", tone: "var(--success)" },
    majorEditRate: { label: "Major edits", tone: "var(--warning)" },
    rejectionRate: { label: "Rejected", tone: "var(--danger)" },
    unsupportedClaimRate: { label: "Unsupported claims", tone: "var(--ai)" },
    reopenRate: { label: "Reopened", tone: "var(--info)" },
  } as const;
  const chosen = metrics[metric as keyof typeof metrics] ?? metrics.acceptedRate;

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-sm font-semibold">Quality trend</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Observed outcome rate over time. Trend direction is descriptive, not a significance claim.</p></div>
        <select aria-label="Quality trend metric" value={metric} onChange={(event) => setMetric(event.target.value)} className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs">
          {Object.entries(metrics).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
        </select>
      </div>
      <div className="h-[280px] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={visible} margin={{ left: -8, right: 10, top: 10, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })} minTickGap={34} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} domain={[0, 1]} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={38} />
            <Tooltip formatter={(value) => pct(Number(value))} labelFormatter={(value) => new Date(String(value)).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"} contentStyle={{ borderRadius: 8, borderColor: "var(--border)", background: "var(--surface-1)", fontSize: 12 }} />
            <Area type="monotone" dataKey={metric} name={chosen.label} stroke={chosen.tone} fill={`color-mix(in srgb, ${chosen.tone} 12%, transparent)`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Surface>
  );
}

function deriveDecisionRates(items: AIOutcome[]) {
  const total = Math.max(items.length, 1);
  const count = (decision: AIOutcome["decision"]) => items.filter((item) => item.decision === decision).length / total;
  return {
    acceptance: count("unchanged") + count("minor_edit"),
    unchanged: count("unchanged"),
    minor: count("minor_edit"),
    major: count("major_edit"),
    rejected: count("rejected"),
    takeover: count("human_takeover"),
    reopened: items.filter((item) => item.reopened).length / total,
    unsupported: items.filter((item) => item.unsupportedClaim).length / total,
  };
}

function compareWindow(outcomes: AIOutcome[], range: string) {
  const duration = rangeMs[range] ?? rangeMs["30d"];
  const currentStart = QUALITY_NOW - duration;
  const previousStart = currentStart - duration;
  const current = outcomes.filter((item) => {
    const time = Date.parse(item.timestamp);
    return time >= currentStart && time <= QUALITY_NOW;
  });
  const previous = outcomes.filter((item) => {
    const time = Date.parse(item.timestamp);
    return time >= previousStart && time < currentStart;
  });
  const currentRates = deriveDecisionRates(current);
  const previousRates = deriveDecisionRates(previous);
  const delta = (key: keyof typeof currentRates) => (currentRates[key] - previousRates[key]) * 100;
  return { current, currentRates, deltas: {
    acceptance: delta("acceptance"),
    unchanged: delta("unchanged"),
    minor: delta("minor"),
    major: delta("major"),
    rejected: delta("rejected"),
    takeover: delta("takeover"),
    reopened: delta("reopened"),
    unsupported: delta("unsupported"),
  }};
}

function RootCauseDecomposition({ failures, onSelect }: { failures: AIFailure[]; onSelect: (cause: FailureCause) => void }) {
  const entries = useMemo(() => {
    const total = Math.max(failures.length, 1);
    const counts = new Map<FailureCause, number>();
    for (const failure of failures) counts.set(failure.rootCause, (counts.get(failure.rootCause) ?? 0) + 1);
    return [...counts.entries()].map(([cause, count]) => ({ cause, count, share: count / total })).sort((a, b) => b.count - a.count);
  }, [failures]);
  return (
    <Surface className="p-4">
      <div className="flex items-center gap-2"><GitCompareArrows className="size-4 text-[var(--info)]" /><h2 className="text-sm font-semibold">Root-cause decomposition</h2></div>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">Failures are attributed to product components, not collapsed into “LLM bad”. Click a category to inspect cases.</p>
      <div className="mt-4 space-y-3">
        {entries.map(({ cause, count, share }) => (
          <button key={cause} onClick={() => onSelect(cause)} className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <div className="flex items-center justify-between text-xs"><span className="font-medium">{rootCauseLabels[cause]}</span><span className="tabular-nums text-[var(--muted-foreground)]">{pct(share, 0)} · {count}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]"><div className="h-full rounded-full bg-[var(--info)]" style={{ width: `${Math.max(3, share * 100)}%` }} /></div>
          </button>
        ))}
      </div>
    </Surface>
  );
}

function SourceQualityTable({ outcomes, sources }: { outcomes: AIOutcome[]; sources: KnowledgeSource[] }) {
  const rows = useMemo(() => {
    return sources.map((source) => {
      const uses = outcomes.filter((item) => item.sourceIds.includes(source.id));
      if (!uses.length) return null;
      const total = uses.length;
      return {
        source,
        uses: total,
        major: uses.filter((item) => item.decision === "major_edit").length / total,
        rejected: uses.filter((item) => item.decision === "rejected").length / total,
        unsupported: uses.filter((item) => item.unsupportedClaim).length / total,
        reopened: uses.filter((item) => item.reopened).length / total,
      };
    }).filter((row): row is NonNullable<typeof row> => Boolean(row)).sort((a, b) => b.uses - a.uses).slice(0, 10);
  }, [outcomes, sources]);

  return (
    <Surface className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Knowledge quality × AI quality</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">High correction rates can originate in stale, conflicting or incomplete sources rather than model generation alone.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-xs">
          <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"><tr>{["Source", "Uses", "Major edit", "Rejected", "Unsupported", "Reopen"].map((label) => <th key={label} className="border-b border-[var(--border)] px-3 py-2 font-medium">{label}</th>)}</tr></thead>
          <tbody>{rows.map(({ source, uses, major, rejected, unsupported, reopened }) => <tr key={source.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
            <td className="px-3 py-2.5"><Link href={`/knowledge?tab=sources&source=${source.id}`} className="font-semibold hover:text-[var(--accent)] hover:underline">{source.title}</Link><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{source.authority} · {source.status.replace("_", " ")}</div></td>
            <td className="px-3 py-2.5 tabular-nums">{uses}</td><td className="px-3 py-2.5 tabular-nums">{pct(major)}</td><td className="px-3 py-2.5 tabular-nums">{pct(rejected)}</td><td className="px-3 py-2.5 tabular-nums">{pct(unsupported)}</td><td className="px-3 py-2.5 tabular-nums">{pct(reopened)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </Surface>
  );
}

function CohortBreakdowns({ outcomes }: { outcomes: AIOutcome[] }) {
  const intentRows = useMemo(() => {
    const intents = Array.from(new Set(outcomes.map((item) => item.intent)));
    return intents.map((intent) => {
      const items = outcomes.filter((item) => item.intent === intent);
      const rates = deriveDecisionRates(items);
      return { intent, sample: items.length, ...rates };
    }).sort((a, b) => b.sample - a.sample);
  }, [outcomes]);

  const localeRows = useMemo(() => {
    return (Object.keys(localeLabels) as AIOutcome["locale"][]).map((locale) => {
      const items = outcomes.filter((item) => item.locale === locale);
      const rates = deriveDecisionRates(items);
      const retrievalMiss = items.filter((item) => item.knowledgeState === "missing").length / Math.max(items.length, 1);
      return { locale, sample: items.length, retrievalMiss, ...rates };
    });
  }, [outcomes]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Intent / topic quality</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Policy-safe behavior matters: a human-only security path is not a quality failure.</p></div>
        <div className="divide-y divide-[var(--border)]">
          {intentRows.slice(0, 8).map((row) => <div key={row.intent} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_88px_88px_96px] sm:items-center"><div><div className="text-xs font-semibold">{titleize(row.intent)}</div><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{row.sample} conversations</div></div><div className="text-xs"><span className="text-[var(--muted-foreground)]">Accepted </span><strong>{pct(row.acceptance, 0)}</strong></div><div className="text-xs"><span className="text-[var(--muted-foreground)]">Major </span><strong>{pct(row.major, 0)}</strong></div><div className="text-xs"><span className="text-[var(--muted-foreground)]">Takeover </span><strong>{pct(row.takeover, 0)}</strong></div></div>)}
        </div>
      </Surface>
      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Language / locale quality</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Every rate keeps its sample size visible; small cohorts are not treated as model-level conclusions.</p></div>
        <div className="divide-y divide-[var(--border)]">
          {localeRows.map((row) => <div key={row.locale} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><div className="text-xs font-semibold">{localeLabels[row.locale]}</div>{row.sample < 300 ? <Badge tone="warning">Low sample</Badge> : null}</div><span className="text-[10px] text-[var(--muted-foreground)]">{row.sample} conversations</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5"><span>Accepted <strong>{pct(row.acceptance, 0)}</strong></span><span>Major <strong>{pct(row.major, 0)}</strong></span><span>Retrieval miss <strong>{pct(row.retrievalMiss, 0)}</strong></span><span>Unsupported <strong>{pct(row.unsupported, 1)}</strong></span><span>Escalations <strong>{pct(row.takeover, 0)}</strong></span></div></div>)}
        </div>
      </Surface>
    </div>
  );
}

function Recommendations({ items }: { items: QualityRecommendation[] }) {
  return (
    <Surface className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Evidence-derived recommendations</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Recommended changes are tied to mock evidence; impact is not invented when it has not been measured.</p></div>
      <div className="grid gap-0 lg:grid-cols-3 lg:divide-x lg:divide-[var(--border)]">
        {items.map((item) => <article key={item.id} className="p-4"><div className="flex items-center gap-2"><Badge tone={item.priority === "high" ? "danger" : "warning"}>{item.priority} impact</Badge><h3 className="text-xs font-semibold">{item.topic}</h3></div><ul className="mt-3 space-y-1 text-xs leading-5 text-[var(--muted-foreground)]">{item.evidence.map((evidence) => <li key={evidence}>• {evidence}</li>)}</ul><div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs"><div className="font-semibold">Recommended</div><div className="mt-1 text-[var(--muted-foreground)]">{item.recommendation}</div><div className="mt-2 text-[10px] font-medium text-[var(--muted-foreground)]">Expected impact: cannot be reliably estimated yet.</div></div><div className="mt-3 flex gap-2">{item.relatedKnowledgeId ? <Link href={`/knowledge?tab=sources&source=${item.relatedKnowledgeId}`} className="text-xs font-medium text-[var(--accent)] hover:underline">Knowledge source</Link> : null}{item.relatedIssueId ? <Link href={`/intelligence/${item.relatedIssueId}`} className="text-xs font-medium text-[var(--accent)] hover:underline">Issue</Link> : null}</div></article>)}
      </div>
    </Surface>
  );
}

function SampleHeader({ failure }: { failure: AIFailure }) {
  return <><div className="si-detail-header"><div><div className="si-label">{failure.conversationId} · Demo sample</div><h2>{failure.customerName} · {titleize(failure.intent)}</h2></div><Badge tone="danger">{failure.type.replaceAll("_", " ")}</Badge></div><div className="si-detail-grid"><div className="si-detail-tile"><div className="si-label">Model</div><strong>{failure.modelVersion.replace("support-", "")}</strong><span>Provider not recorded</span></div><div className="si-detail-tile"><div className="si-label">Evidence</div><strong>{failure.sourceIds.length} sources</strong><span>{failure.knowledgeState}</span></div><div className="si-detail-tile"><div className="si-label">Human outcome</div><strong>{titleize(failure.outcome)}</strong><span>{failure.severity} severity · {failure.locale}</span></div></div></>;
}

function FailureRows({ failures, selectedId, onSelect }: { failures: AIFailure[]; selectedId?: string; onSelect: (id: string) => void }) {
  return <div>{failures.map((failure) => <button key={failure.id} className={cn("si-reference-row", selectedId === failure.id && "is-selected")} aria-label={`Inspect failure ${failure.id}`} aria-pressed={selectedId === failure.id} onClick={() => onSelect(failure.id)}><span className="si-mini-avatar">{failure.customerName.slice(0, 1)}</span><span className="si-row-copy min-w-0 flex-1"><strong>{titleize(failure.intent)}</strong><span>{failure.customerName} · {failure.modelVersion}</span><span>{failure.type.replaceAll("_", " ")} · {new Date(failure.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}</span></span><Badge tone={failure.severity === "critical" ? "danger" : "warning"}>{failure.severity}</Badge></button>)}</div>;
}

function OverviewView({ data, range, metric, setMetric, inspectCause, tabs, openTrace }: {
  data: WorkspaceData; range: string; metric: string; setMetric: (value: string | null) => void;
  inspectCause: (cause: FailureCause) => void; tabs: React.ReactNode; openTrace: (id: string) => void;
}) {
  const [sampleId, setSampleId] = useState("");
  const comparison = useMemo(() => compareWindow(data.outcomes, range), [data.outcomes, range]);
  const failures = useMemo(() => filterByRange(data.failures, range).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)), [data.failures, range]);
  const selected = failures.find((item) => item.id === sampleId) ?? failures[0];
  return <OperationalWorkspace className="si-route-workspace si-quality-workspace" title="Evaluation samples" detailKey={selected?.id} tabs={tabs}
    master={<><FailureRows failures={failures.slice(0, 12)} selectedId={selected?.id} onSelect={setSampleId} /><div className="px-3 py-2 text-[10px] text-[var(--muted-foreground)]">Latest {Math.min(12, failures.length)} demo samples · open Failures for all cases.</div></>}
    detail={<>{selected ? <SampleHeader failure={selected} /> : <div className="si-detail-header"><h2>No failures in this range</h2></div>}<div role="region" aria-label="Selected quality sample and diagnostics" tabIndex={0} className="si-detail-scroll si-quality-diagnostics space-y-3">{selected ? <section aria-label="Selected sample summary" className="grid gap-3 rounded-2xl border border-white/25 p-3 sm:grid-cols-2">{[["Extracted triage", selected.trace.triage], ["Failure reason", selected.trace.problem], ["Human override", selected.trace.humanAction], ["Recorded outcome", selected.trace.finalOutcome]].map(([label, value]) => <div key={label}><h3 className="si-label">{label}</h3><p className="mt-1 text-xs leading-5">{value}</p></div>)}</section> : null}<div className="grid gap-3"><OutcomeFunnel outcomes={comparison.current} /><QualityTrend trend={data.trend} range={range} metric={metric} setMetric={setMetric} /><RootCauseDecomposition failures={failures} onSelect={inspectCause} /><section className="grid grid-cols-2 gap-y-3 rounded-2xl border border-white/25 py-3 sm:grid-cols-4" aria-label="Outcome rate comparison">{([
      ["Accepted", "acceptance", "unchanged + minor edit", false], ["Unchanged", "unchanged", "sent without edit", false], ["Minor edit", "minor", "light human correction", false], ["Major edit", "major", "substantial correction", true], ["Rejected", "rejected", "draft not used", true], ["Human takeover", "takeover", "policy handoff may be correct", false], ["Reopened", "reopened", "customer returned", true], ["Unsupported claim", "unsupported", "grounding failure", true],
    ] as const).map(([label, key, note, inverse]) => <CompactMetric key={key} label={label} value={pct(comparison.currentRates[key])} note={note} delta={comparison.deltas[key]} inverseDelta={inverse} />)}</section><SourceQualityTable outcomes={comparison.current} sources={data.knowledgeSources} /><CohortBreakdowns outcomes={comparison.current} /><Recommendations items={data.recommendations} /></div><section className="rounded-2xl border border-white/25 p-3 text-xs"><h3 className="font-semibold">Deployment context</h3><p className="mt-1">support-model-a / support-draft-v14 / retriever-r7 → support-model-b / support-draft-v15 / retriever-r8. Neutral demo identifiers; no third-party performance claim.</p><p className="mt-2">Policy policy-2026.09 · knowledge-2026.10.03</p></section></div><DetailBand metrics={[{ label: "Accepted drafts", value: pct(comparison.currentRates.acceptance) }, { label: "Unsupported claims", value: pct(comparison.currentRates.unsupported) }, { label: "Sample size", value: comparison.current.length.toLocaleString() }]} action={<button className="si-action-pill is-primary" disabled={!selected} onClick={() => selected && openTrace(selected.id)}>Open trace <ArrowRight size={13} /></button>} /></>}
  />;
}

function FailureInspector({ failure, sources, onClose }: { failure: AIFailure; sources: KnowledgeSource[]; onClose: () => void }) {
  const sourceObjects = failure.sourceIds.map((id) => sources.find((source) => source.id === id)).filter((source): source is KnowledgeSource => Boolean(source));
  const steps = [
    ["Conversation", failure.trace.customerMessage, MessageSquareText],
    ["Triage", failure.trace.triage, Search],
    ["Retrieval", failure.trace.retrieval.join("\n"), DatabaseZap],
    ["Draft", failure.trace.draft, Sparkles],
    ["Problem", failure.trace.problem, AlertTriangle],
    ["Human action", failure.trace.humanAction, UserRoundCheck],
    ["Final outcome", failure.trace.finalOutcome, CheckCircle2],
  ] as const;

  return (
    <aside className="min-w-0" aria-label="Failure execution trace">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-3 py-2"><div><div className="flex flex-wrap gap-1.5"><Badge tone="danger">{failure.type.replaceAll("_", " ")}</Badge><Badge>{failure.severity}</Badge><Badge>{failure.locale}</Badge></div><h2 className="mt-2 text-sm font-semibold">{failure.customerName} · {failure.intent.replaceAll("_", " ")}</h2><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{failure.modelVersion} · {new Date(failure.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</div></div><button onClick={onClose} aria-label="Close failure inspector" className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button></div>
      <div className="p-4">
        <div className="relative space-y-0">
          {steps.map(([label, value, Icon], index) => <section key={label} className="relative grid grid-cols-[30px_1fr] gap-2 pb-4 last:pb-0"><div className="relative flex justify-center">{index < steps.length - 1 ? <div className="absolute bottom-0 top-6 w-px bg-[var(--border)]" /> : null}<div className={cn("z-10 grid size-6 place-items-center rounded-full border bg-[var(--surface-1)]", label === "Problem" ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--border-strong)] text-[var(--muted-foreground)]")}><Icon className="size-3" /></div></div><div><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">{label}</div><div className={cn("mt-1 whitespace-pre-line rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs leading-5", label === "Problem" && "border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_5%,var(--surface-1))]")}>{value}</div></div></section>)}
        </div>

        <section className="mt-5 border-t border-[var(--border)] pt-4"><h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Retrieved sources</h3><div className="mt-2 space-y-2">{sourceObjects.map((source) => <Link key={source.id} href={`/knowledge?tab=sources&source=${source.id}`} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--surface-2)]"><span className="min-w-0"><span className="block truncate font-medium">{source.title}</span><span className="mt-0.5 block text-[10px] text-[var(--muted-foreground)]">{source.authority} · {source.status.replace("_", " ")}</span></span><ArrowRight className="size-3.5 shrink-0" /></Link>)}</div></section>
        <div className="mt-4 flex flex-wrap gap-2"><Link href={`/inbox/${failure.conversationId}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Open conversation <ArrowRight className="size-3" /></Link>{failure.relatedIssueId ? <Link href={`/intelligence/${failure.relatedIssueId}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Repeated issue <ArrowRight className="size-3" /></Link> : null}{["policy_block", "identity_missing", "incorrect_action"].includes(failure.type) ? <Link href={`/automation?tab=policies&intent=${failure.intent}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Automation policy <ArrowRight className="size-3" /></Link> : null}</div>
      </div>
    </aside>
  );
}

function FailuresView({
  data,
  range,
  setRange,
  cause,
  setCause,
  tabs,
}: {
  data: WorkspaceData;
  range: string;
  setRange: (value: string | null) => void;
  cause: string;
  setCause: (value: string | null) => void;
  tabs: React.ReactNode;
}) {
  const [failureType, setFailureType] = useQueryState("failure", { defaultValue: "" });
  const [locale, setLocale] = useQueryState("locale", { defaultValue: "" });
  const [intent, setIntent] = useQueryState("intent", { defaultValue: "" });
  const [model, setModel] = useQueryState("model", { defaultValue: "" });
  const [knowledge, setKnowledge] = useQueryState("knowledge", { defaultValue: "" });
  const [source, setSource] = useQueryState("source", { defaultValue: "" });
  const [channel, setChannel] = useQueryState("channel", { defaultValue: "" });
  const [failureId, setFailureId] = useQueryState("failureId", { defaultValue: "" });
  const [pageIndex, setPageIndex] = useState(0);
  const [inspectorClosed, setInspectorClosed] = useState(false);

  const filtered = useMemo(() => {
    return filterByRange(data.failures, range).filter((item) =>
      (!failureType || item.type === failureType) &&
      (!locale || item.locale === locale) &&
      (!intent || item.intent === intent) &&
      (!model || item.modelVersion === model) &&
      (!knowledge || item.knowledgeState === knowledge) &&
      (!source || item.sourceIds.includes(source)) &&
      (!channel || item.channel === channel) &&
      (!cause || item.rootCause === cause)
    ).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }, [data.failures, range, failureType, locale, intent, model, knowledge, source, channel, cause]);

  const pageSize = 60;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = data.failures.find((item) => item.id === failureId) ?? (!inspectorClosed ? pageRows[0] : undefined);
  const resetPage = () => setPageIndex(0);
  const selectClass = "h-8 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  const intents = Array.from(new Set(data.failures.map((item) => item.intent))).sort();
  const sourceOptions = data.knowledgeSources.filter((item) => data.failures.some((failure) => failure.sourceIds.includes(item.id)));
  const failureTypes = Array.from(new Set(data.failures.map((item) => item.type))).sort();

  return <><FilterHinge count={[failureType, locale, intent, model, knowledge, source, channel, cause].filter(Boolean).length}>
    <RangeSelect range={range} setRange={(value) => { setRange(value); resetPage(); }} />
          <select className={selectClass} aria-label="Failure type" value={failureType} onChange={(e) => { setFailureType(e.target.value || null); resetPage(); }}><option value="">All failure types</option>{failureTypes.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
          <select className={selectClass} aria-label="Failure locale" value={locale} onChange={(e) => { setLocale(e.target.value || null); resetPage(); }}><option value="">All locales</option>{Object.entries(localeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select className={selectClass} aria-label="Failure intent" value={intent} onChange={(e) => { setIntent(e.target.value || null); resetPage(); }}><option value="">All intents</option>{intents.map((value) => <option key={value} value={value}>{titleize(value)}</option>)}</select>
          <select className={selectClass} aria-label="Failure model" value={model} onChange={(e) => { setModel(e.target.value || null); resetPage(); }}><option value="">All models</option>{data.modelVersions.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select>
          <select className={selectClass} aria-label="Knowledge health" value={knowledge} onChange={(e) => { setKnowledge(e.target.value || null); resetPage(); }}><option value="">Any knowledge state</option>{["healthy","aging","stale","conflict","missing"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select className={selectClass} aria-label="Failure source" value={source} onChange={(e) => { setSource(e.target.value || null); resetPage(); }}><option value="">All sources</option>{sourceOptions.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select>
          <select className={selectClass} aria-label="Failure channel" value={channel} onChange={(e) => { setChannel(e.target.value || null); resetPage(); }}><option value="">All channels</option>{["email","web","telegram","whatsapp","api"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select className={selectClass} aria-label="Root cause" value={cause} onChange={(e) => { setCause(e.target.value || null); resetPage(); }}><option value="">All root causes</option>{Object.entries(rootCauseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
  </FilterHinge><OperationalWorkspace className="si-route-workspace si-quality-workspace" title="Failure Explorer" detailKey={selected?.id} tabs={tabs}
    master={<><FailureRows failures={pageRows} selectedId={selected?.id} onSelect={(id) => { setInspectorClosed(false); setFailureId(id); }} />{!filtered.length ? <div className="p-4 text-xs">No failures match these filters. Widen the time range or clear one of the URL-backed filters.</div> : null}<div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-2 text-[10px]"><span>Page {currentPage + 1} of {pageCount} · 60 rows/page</span><div className="flex gap-1"><Button size="sm" disabled={currentPage === 0} onClick={() => setPageIndex(currentPage - 1)}>Previous</Button><Button size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPageIndex(currentPage + 1)}>Next</Button></div></div></>}
    detail={<>{selected ? <><SampleHeader failure={selected} /><div className="si-detail-scroll si-quality-diagnostics"><FailureInspector failure={selected} sources={data.knowledgeSources} onClose={() => { setInspectorClosed(true); setFailureId(null); }} /></div><DetailBand metrics={[{ label: "Root cause", value: rootCauseLabels[selected.rootCause] }, { label: "Outcome", value: titleize(selected.outcome) }, { label: "Sources", value: selected.sourceIds.length }]} action={<Link className="si-action-pill is-primary" href={`/inbox/${selected.conversationId}`}>Open conversation <ArrowRight size={13} /></Link>} /></> : <div className="flex flex-1 flex-col justify-center p-4"><h2 className="text-lg font-medium">Select a failure sample</h2><p className="mt-2 text-xs">Review the recorded execution trace, evidence and final human outcome.</p></div>}</>}
  /></>;
}

function EvaluationsView({ data, tabs }: { data: WorkspaceData; tabs: React.ReactNode }) {
  const [suiteId, setSuiteId] = useQueryState("suite", { defaultValue: "grounding" });
  const [caseId, setCaseId] = useState("");
  const suite = data.evaluationSuites.find((item) => item.id === suiteId) ?? data.evaluationSuites[0];
  const cases = data.evaluationCases.filter((item) => item.suiteId === suite.id);
  const selected = cases.find((item) => item.id === caseId) ?? cases[0];
  const run = data.evaluationRun;
  return <OperationalWorkspace className="si-route-workspace si-quality-workspace" title="Evaluation suites" detailKey={`${suite.id}:${selected?.id}`} tabs={tabs}
    master={<><div>{data.evaluationSuites.map((item) => <button key={item.id} className={cn("si-reference-row", item.id === suite.id && "is-selected")} aria-pressed={item.id === suite.id} onClick={() => { setSuiteId(item.id); setCaseId(""); }}><span className="si-mini-avatar">{item.name.slice(0, 1)}</span><span className="si-row-copy min-w-0 flex-1"><strong>{item.name}</strong><span>{item.caseCount.toLocaleString()} cases · {item.status} · {pp((item.passRate - item.previousPassRate) * 100)}</span></span><span className="text-sm tabular-nums">{pct(item.passRate)}</span></button>)}</div><div className="si-pane-heading mt-3">Sampled cases</div>{cases.map((item, index) => <button key={item.id} className={cn("si-reference-row", item.id === selected?.id && "is-selected")} aria-pressed={item.id === selected?.id} onClick={() => setCaseId(item.id)}><span className="si-row-copy min-w-0 flex-1"><strong className="line-clamp-2">{index + 1}. {item.input}</strong><span>{item.result} · {item.change}</span></span></button>)}</>}
    detail={<><div className="si-detail-header"><div><div className="si-label">{selected?.id ?? suite.id} · Demo evaluation</div><h2>{suite.name} rubric</h2></div><Badge tone={selected?.result === "passed" ? "success" : "danger"}>{selected?.result ?? suite.status}</Badge></div><div className="si-detail-grid"><div className="si-detail-tile"><div className="si-label">Suite pass rate</div><strong>{pct(suite.passRate)}</strong><span>{suite.caseCount.toLocaleString()} rubric cases</span></div><div className="si-detail-tile"><div className="si-label">Previous run</div><strong>{pp((suite.passRate - suite.previousPassRate) * 100)}</strong><span>{pct(suite.previousPassRate)} pass rate</span></div><div className="si-detail-tile"><div className="si-label">Regressions</div><strong>{cases.filter((item) => item.change === "regression").length}</strong><span>Sampled cases only</span></div></div><div role="region" aria-label="Evaluation evidence and version comparison" tabIndex={0} className="si-detail-scroll si-quality-diagnostics space-y-3">{selected ? <section aria-label="Selected evaluation case" className="grid gap-3 rounded-2xl border border-white/25 p-3 sm:grid-cols-2">{[["Input", selected.input], ["Retrieval / evidence", selected.evidence], ["Model output", selected.observedBehavior], ["Judge result", `${selected.result} · ${selected.change}. Expected: ${selected.expectedBehavior}`]].map(([label, value]) => <div key={label}><h3 className="si-label">{label}</h3><p className="mt-1 text-xs leading-5">{value}</p></div>)}</section> : null}<section className="rounded-2xl border border-white/25 p-3"><div className="flex flex-wrap items-center gap-2"><Badge tone="info">Version comparison</Badge><span className="text-xs">{run.previousModelVersion} → {run.modelVersion}</span></div><p className="mt-2 text-xs">Overall {pct(run.overallPassRate)} · {pp((run.overallPassRate - run.previousPassRate) * 100)}. Aggregate improvement does not establish significance or hide segment regressions.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{run.segmentChanges.map((segment) => <div key={segment.segment} className="rounded-xl border border-white/25 p-2"><div className="text-xs font-semibold">{segment.segment}</div><div className={cn("mt-1 text-lg font-semibold", toneForDelta(segment.deltaPercentagePoints))}>{pp(segment.deltaPercentagePoints)}</div><p className="mt-1 text-[10px] leading-4">{segment.note}</p></div>)}</div></section><p className="text-xs">{suite.description} Last run {new Date(suite.lastRunAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC. Provider and independent factuality scores are not recorded in this demo.</p></div><DetailBand metrics={[{ label: "Draft version", value: selected?.version ?? "Unavailable" }, { label: "Result", value: selected?.result ?? suite.status }, { label: "Case evidence", value: selected ? "Recorded" : "Unavailable" }]} action={<button className="si-action-pill is-primary" disabled={!selected} onClick={() => document.querySelector('[aria-label="Selected evaluation case"]')?.scrollIntoView({ block: "nearest" })}>Open trace <ArrowRight size={13} /></button>} /></>}
  />;
}

function ReadinessTable({ rows }: { rows: AutomationReadiness[] }) {
  const recommendationLabel: Record<AutomationReadiness["recommendation"], string> = { controlled_automation: "Eligible for controlled automation", copilot_only: "Copilot only", never_autonomous: "Never autonomous" };
  return (
    <Surface className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Automation readiness by intent</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">No single confidence score: recommendation combines coverage, freshness, conflicts, policy and historical evaluation behavior.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[940px] border-collapse text-left text-xs"><thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"><tr>{["Intent", "Sample", "Coverage", "Freshness", "Conflicts", "Policy", "Historical pass", "Recommendation"].map((label) => <th key={label} className="border-b border-[var(--border)] px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.intent} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]"><td className="px-3 py-3 font-semibold">{row.intent}</td><td className="px-3 py-3">{row.sampleSize.toLocaleString()}</td><td className="px-3 py-3"><Badge tone={row.coverage === "strong" ? "success" : row.coverage === "medium" ? "info" : "warning"}>{row.coverage}</Badge></td><td className="px-3 py-3"><Badge tone={row.freshness === "fresh" ? "success" : "warning"}>{row.freshness}</Badge></td><td className="px-3 py-3"><Badge tone={row.conflicts === "none" ? "success" : "danger"}>{row.conflicts}</Badge></td><td className="px-3 py-3"><Badge tone={row.policy === "auto_allowed" ? "success" : row.policy === "human_only" ? "danger" : "warning"}>{row.policy.replaceAll("_", " ")}</Badge></td><td className="px-3 py-3 font-semibold">{pct(row.historicalPassRate, 0)}</td><td className="px-3 py-3"><div className={cn("font-semibold", row.recommendation === "controlled_automation" ? "text-[var(--success)]" : row.recommendation === "never_autonomous" ? "text-[var(--danger)]" : "text-[var(--warning)]")}>{recommendationLabel[row.recommendation]}</div><Link href={`/automation?tab=rollouts&intent=${encodeURIComponent(row.intent)}`} className="mt-1 inline-flex text-[10px] text-[var(--accent)] hover:underline">Automation rollout gate</Link></td></tr>)}</tbody></table></div>
    </Surface>
  );
}

function ShadowDiff({ simulation, sources }: { simulation: ShadowSimulation; sources: KnowledgeSource[] }) {
  return (
    <Surface className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3"><div><div className="flex flex-wrap gap-1.5"><Badge tone={simulation.classification === "draft_possible" ? "success" : simulation.classification === "human_only" ? "danger" : "warning"}>{simulation.classification.replaceAll("_", " ")}</Badge><Badge>{simulation.locale}</Badge></div><h2 className="mt-2 text-sm font-semibold">{titleize(simulation.intent)} · {simulation.conversationId}</h2></div><Link href={`/inbox/${simulation.conversationId}`} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">Conversation <ArrowRight className="size-3" /></Link></div>
      <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-[var(--border)]">
        <div className="p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Actual historical resolution</div><div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs leading-5">{simulation.actualResolution}</div></div>
        <div className="p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">What AI would propose today</div><div className="mt-2 rounded-md border border-[color-mix(in_srgb,var(--ai)_25%,var(--border))] bg-[color-mix(in_srgb,var(--ai)_4%,var(--surface-1))] p-3 text-xs leading-5">{simulation.aiProposal}</div></div>
      </div>
      <div className="border-t border-[var(--border)] px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Differences</div><div className="mt-2 flex flex-wrap gap-1.5">{simulation.differences.map((difference) => <Badge key={difference} tone={difference === "wording" ? "neutral" : "warning"}>{difference.replaceAll("_", " ")}</Badge>)}</div><div className="mt-3 flex flex-wrap gap-2">{simulation.sourceIds.map((id) => { const source = sources.find((item) => item.id === id); return <Link key={id} href={`/knowledge?tab=sources&source=${id}`} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] hover:bg-[var(--surface-2)]">{source?.title ?? id}<ChevronRight className="size-3" /></Link>; })}</div></div>
    </Surface>
  );
}

function ShadowView({ data, tabs }: { data: WorkspaceData; tabs: React.ReactNode }) {
  const [shadowId, setShadowId] = useQueryState("shadowId", { defaultValue: "shadow-001" });
  const selected = data.shadowSimulations.find((item) => item.id === shadowId) ?? data.shadowSimulations[0];
  const summary = data.shadowSummary;
  return <OperationalWorkspace className="si-route-workspace si-quality-workspace" title="Historical simulation samples" detailKey={selected.id} tabs={tabs}
    master={<>{data.shadowSimulations.map((item) => <button key={item.id} className={cn("si-reference-row", selected.id === item.id && "is-selected")} aria-pressed={selected.id === item.id} onClick={() => setShadowId(item.id)}><span className="si-mini-avatar">{item.locale.slice(0, 2).toUpperCase()}</span><span className="si-row-copy min-w-0 flex-1"><strong>{titleize(item.intent)}</strong><span>{item.conversationId} · {item.classification.replaceAll("_", " ")}</span></span></button>)}<div className="mt-4 p-3 text-xs"><LockKeyhole size={15} className="mb-2" /><strong>Shadow Mode never sends customer replies</strong><p className="mt-2 text-[var(--muted-foreground)]">Demo historical comparisons. Simulation does not execute actions.</p></div></>}
    detail={<><div className="si-detail-header"><div><div className="si-label">{selected.id} · Demo shadow sample</div><h2>{titleize(selected.intent)}</h2></div><select aria-label="Shadow simulation" value={selected.id} onChange={(event) => setShadowId(event.target.value)} className="max-w-[48%] rounded-full border border-white/30 bg-white/25 px-2 py-1.5 text-xs">{data.shadowSimulations.map((item) => <option key={item.id} value={item.id}>{item.conversationId}</option>)}</select></div><div className="si-detail-grid"><div className="si-detail-tile"><div className="si-label">Historical analyzed</div><strong>{summary.analyzed.toLocaleString()}</strong><span>No messages sent</span></div><div className="si-detail-tile"><div className="si-label">Draft possible</div><strong>{summary.draftPossible.toLocaleString()}</strong><span>{summary.humanReview.toLocaleString()} need review</span></div><div className="si-detail-tile"><div className="si-label">Human-only</div><strong>{summary.humanOnly.toLocaleString()}</strong><span>{summary.insufficientKnowledge.toLocaleString()} lack knowledge</span></div></div><div role="region" aria-label="Historical shadow comparison" tabIndex={0} className="si-detail-scroll si-quality-diagnostics space-y-3"><ShadowDiff simulation={selected} sources={data.knowledgeSources} /><ReadinessTable rows={data.automationReadiness} /><Recommendations items={data.recommendations} /></div><DetailBand metrics={[{ label: "Classification", value: titleize(selected.classification) }, { label: "Evidence", value: `${selected.sourceIds.length} sources` }, { label: "Differences", value: selected.differences.length }]} action={<Link className="si-action-pill is-primary" href={`/inbox/${selected.conversationId}`}>Open trace <ArrowRight size={13} /></Link>} /></>}
  />;
}

export function AIQualityWorkspace() {
  const query = useQuery({ queryKey: ["ai-quality-workspace"], queryFn: getAIQualityWorkspace });
  const [tabRaw, setTabRaw] = useQueryState("tab", { defaultValue: "overview" });
  const [range, setRange] = useQueryState("range", { defaultValue: "30d" });
  const [metric, setMetric] = useQueryState("metric", { defaultValue: "acceptedRate" });
  const [cause, setCause] = useQueryState("cause", { defaultValue: "" });
  const [, setFailureId] = useQueryState("failureId", { defaultValue: "" });

  if (query.isLoading || !query.data) return <LoadingState label="Loading AI quality diagnostics…" />;

  const validTabs: Tab[] = ["overview", "failures", "evaluations", "shadow"];
  const tab: Tab = validTabs.includes(tabRaw as Tab) ? tabRaw as Tab : "overview";
  const setTab = (value: Tab) => setTabRaw(value);
  const inspectCause = (value: FailureCause) => {
    setCause(value);
    setTab("failures");
  };

  const data = query.data;
  const comparison = compareWindow(data.outcomes, range);
  const rates = comparison.currentRates;
  const grounding = data.evaluationSuites.find((item) => item.id === "grounding");
  const tone = data.evaluationSuites.find((item) => item.id === "tone");
  const tabs = <WorkspaceTabs label="AI Quality workspace views" active={tab} onChange={(value) => setTab(value as Tab)} items={[{ id: "overview", label: "Overview" }, { id: "failures", label: "Failures", count: data.failures.length }, { id: "evaluations", label: "Evaluations" }, { id: "shadow", label: "Shadow Mode" }]} />;
  return <div className="si-page">
    <RouteHeader title="AI Quality" note={<Badge tone="neutral">Demo evaluation snapshot</Badge>} />
    <ReferenceSummary metrics={[{ label: "Overall pass rate", value: pct(data.evaluationRun.overallPassRate), note: "Demo evaluation rubric" }, { label: "Human override rate", value: pct(rates.minor + rates.major + rates.rejected + rates.takeover), note: `${comparison.current.length.toLocaleString()} sampled outcomes` }, { label: "Grounding pass rate", value: grounding ? pct(grounding.passRate) : "Unavailable", note: "Factuality not independently scored" }]} activityLabel="Demo evaluation suite distribution" activity={data.evaluationSuites.slice(0, 4).map((suite) => ({ label: suite.name, value: suite.caseCount, marker: suite.name.slice(0, 1) }))} signal={{ label: "Quality signal", value: pct(data.evaluationRun.overallPassRate), note: "Demo", options: [{ label: "Grounding", value: grounding ? pct(grounding.passRate) : "—" }, { label: "Factuality", value: "Unscored" }, { label: "Tone", value: tone ? pct(tone.passRate) : "—" }], active: 0, action: <button className="si-action-pill" onClick={() => setTab("failures")}>Review failures</button> }} />
    {tab !== "failures" ? <FilterHinge label="Scope" count={range !== "30d" ? 1 : 0}><RangeSelect range={range} setRange={setRange} /><span className="text-[10px] text-[var(--muted-foreground)]">Deterministic demo · 03 Oct 2026, 09:15 UTC</span></FilterHinge> : null}
    {tab === "overview" ? <OverviewView data={data} range={range} metric={metric} setMetric={setMetric} inspectCause={inspectCause} tabs={tabs} openTrace={(id) => { setFailureId(id); setTab("failures"); }} /> : null}
    {tab === "failures" ? <FailuresView data={data} range={range} setRange={setRange} cause={cause} setCause={setCause} tabs={tabs} /> : null}
    {tab === "evaluations" ? <EvaluationsView data={data} tabs={tabs} /> : null}
    {tab === "shadow" ? <ShadowView data={data} tabs={tabs} /> : null}
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-[var(--muted-foreground)]"><span className="inline-flex items-center gap-1"><ShieldCheck size={12} />Human-only policy can be correct quality behavior</span><span className="inline-flex items-center gap-1"><AlertTriangle size={12} />Correlation is not treated as root cause</span><span className="inline-flex items-center gap-1"><Languages size={12} />Locale conclusions retain sample size</span></div>
  </div>;
}
