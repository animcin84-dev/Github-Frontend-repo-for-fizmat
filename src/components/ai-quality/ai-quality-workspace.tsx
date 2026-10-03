"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  DatabaseZap,
  FileSearch,
  GitCompareArrows,
  Languages,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserRoundCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-state";
import { Surface } from "@/components/ui/surface";
import type {
  AIFailure,
  AIOutcome,
  AutomationReadiness,
  EvaluationCase,
  EvaluationSuite,
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

function TabButton({ value, active, onClick, children }: { value: Tab; active: Tab; onClick: (value: Tab) => void; children: React.ReactNode }) {
  const selected = value === active;
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={() => onClick(value)}
      className={cn(
        "relative h-10 shrink-0 px-3 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
        selected && "text-[var(--foreground)] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]",
      )}
    >
      {children}
    </button>
  );
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

function OverviewView({
  data,
  range,
  setRange,
  metric,
  setMetric,
  inspectCause,
}: {
  data: WorkspaceData;
  range: string;
  setRange: (value: string | null) => void;
  metric: string;
  setMetric: (value: string | null) => void;
  inspectCause: (cause: FailureCause) => void;
}) {
  const comparison = useMemo(() => compareWindow(data.outcomes, range), [data.outcomes, range]);
  const failures = useMemo(() => filterByRange(data.failures, range), [data.failures, range]);
  const rates = comparison.currentRates;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><RangeSelect range={range} setRange={setRange} /></div>
      <Surface className="overflow-hidden"><div className="grid grid-cols-2 gap-y-3 py-3 sm:grid-cols-4 xl:grid-cols-8">
        <CompactMetric label="Accepted" value={pct(rates.acceptance)} note="unchanged + minor edit" delta={comparison.deltas.acceptance} />
        <CompactMetric label="Unchanged" value={pct(rates.unchanged)} note="sent without edit" delta={comparison.deltas.unchanged} />
        <CompactMetric label="Minor edit" value={pct(rates.minor)} note="light human correction" delta={comparison.deltas.minor} />
        <CompactMetric label="Major edit" value={pct(rates.major)} note="substantial correction" delta={comparison.deltas.major} inverseDelta />
        <CompactMetric label="Rejected" value={pct(rates.rejected)} note="draft not used" delta={comparison.deltas.rejected} inverseDelta />
        <CompactMetric label="Human takeover" value={pct(rates.takeover)} note="not automatically a failure" delta={comparison.deltas.takeover} />
        <CompactMetric label="Reopened" value={pct(rates.reopened)} note="customer returned" delta={comparison.deltas.reopened} inverseDelta />
        <CompactMetric label="Unsupported claim" value={pct(rates.unsupported)} note="grounding failure" delta={comparison.deltas.unsupported} inverseDelta />
      </div></Surface>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.35fr]">
        <OutcomeFunnel outcomes={comparison.current} />
        <QualityTrend trend={data.trend} range={range} metric={metric} setMetric={setMetric} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <RootCauseDecomposition failures={failures} onSelect={inspectCause} />
        <Surface className="p-4">
          <div className="flex items-center gap-2"><Bot className="size-4 text-[var(--ai)]" /><h2 className="text-sm font-semibold">Deployment context</h2></div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Quality comparisons keep model, prompt, retriever, policy and knowledge snapshot visible so regressions can be localized.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[["Model", "support-model-b"], ["Prompt", "support-draft-v15"], ["Retriever", "retriever-r8"], ["Policy", "policy-2026.09"], ["Knowledge", "knowledge-2026.10.03"]].map(([label, value]) => <div key={label} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 truncate text-xs font-semibold">{value}</div></div>)}
          </div>
          <div className="mt-4 rounded-md border border-[var(--border)] p-3 text-xs"><div className="font-semibold">Current comparison</div><div className="mt-1 text-[var(--muted-foreground)]">support-model-a / support-draft-v14 / retriever-r7 → support-model-b / support-draft-v15 / retriever-r8. These are neutral demo identifiers, not claims about third-party model performance.</div></div>
        </Surface>
      </div>

      <SourceQualityTable outcomes={comparison.current} sources={data.knowledgeSources} />
      <CohortBreakdowns outcomes={comparison.current} />
      <Recommendations items={data.recommendations} />
    </div>
  );
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
    <aside className="fixed inset-y-12 right-0 z-50 w-[min(96vw,480px)] overflow-auto border-l border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl xl:sticky xl:top-12 xl:z-auto xl:h-[calc(100dvh-68px)] xl:w-auto xl:shadow-none" aria-label="Failure execution trace">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3"><div><div className="flex flex-wrap gap-1.5"><Badge tone="danger">{failure.type.replaceAll("_", " ")}</Badge><Badge>{failure.severity}</Badge><Badge>{failure.locale}</Badge></div><h2 className="mt-2 text-sm font-semibold">{failure.customerName} · {failure.intent.replaceAll("_", " ")}</h2><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{failure.modelVersion} · {new Date(failure.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</div></div><button onClick={onClose} aria-label="Close failure inspector" className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button></div>
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
}: {
  data: WorkspaceData;
  range: string;
  setRange: (value: string | null) => void;
  cause: string;
  setCause: (value: string | null) => void;
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

  const columns = useMemo<ColumnDef<AIFailure>[]>(() => [
    { accessorKey: "conversationId", header: "Conversation", cell: ({ row }) => <div><div className="font-semibold">{row.original.conversationId}</div><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{row.original.customerName}</div></div> },
    { accessorKey: "locale", header: "Locale" },
    { accessorKey: "intent", header: "Intent", cell: ({ getValue }) => titleize(String(getValue())) },
    { accessorKey: "type", header: "Failure", cell: ({ row }) => <Badge tone="danger">{row.original.type.replaceAll("_", " ")}</Badge> },
    { accessorKey: "severity", header: "Severity", cell: ({ row }) => <Badge tone={row.original.severity === "critical" ? "danger" : row.original.severity === "high" ? "warning" : "neutral"}>{row.original.severity}</Badge> },
    { accessorKey: "knowledgeState", header: "Knowledge", cell: ({ row }) => <Badge tone={row.original.knowledgeState === "healthy" ? "success" : row.original.knowledgeState === "missing" || row.original.knowledgeState === "conflict" ? "danger" : "warning"}>{row.original.knowledgeState}</Badge> },
    { accessorKey: "modelVersion", header: "Model" },
    { accessorKey: "outcome", header: "Outcome" },
    { accessorKey: "timestamp", header: "Time", cell: ({ row }) => new Date(row.original.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) },
  ], []);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { pagination: { pageIndex, pageSize: 60 } },
    onPaginationChange: (updater) => {
      const current = { pageIndex, pageSize: 60 };
      const next = typeof updater === "function" ? updater(current) : updater;
      setPageIndex(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selected = data.failures.find((item) => item.id === failureId);
  const resetPage = () => setPageIndex(0);
  const selectClass = "h-8 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  const intents = Array.from(new Set(data.failures.map((item) => item.intent))).sort();
  const sourceOptions = data.knowledgeSources.filter((item) => data.failures.some((failure) => failure.sourceIds.includes(item.id)));
  const failureTypes = Array.from(new Set(data.failures.map((item) => item.type))).sort();

  return (
    <div className="space-y-4">
      <Surface className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-sm font-semibold">Failure Explorer</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Trace observed failure outcomes back to knowledge, policy, retrieval, triage or generation.</p></div><div className="flex items-center gap-2"><Badge>{filtered.length.toLocaleString()} failures</Badge><RangeSelect range={range} setRange={(value) => { setRange(value); resetPage(); }} /></div></div>
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-2">
          <select className={selectClass} aria-label="Failure type" value={failureType} onChange={(e) => { setFailureType(e.target.value || null); resetPage(); }}><option value="">All failure types</option>{failureTypes.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
          <select className={selectClass} aria-label="Failure locale" value={locale} onChange={(e) => { setLocale(e.target.value || null); resetPage(); }}><option value="">All locales</option>{Object.entries(localeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select className={selectClass} aria-label="Failure intent" value={intent} onChange={(e) => { setIntent(e.target.value || null); resetPage(); }}><option value="">All intents</option>{intents.map((value) => <option key={value} value={value}>{titleize(value)}</option>)}</select>
          <select className={selectClass} aria-label="Failure model" value={model} onChange={(e) => { setModel(e.target.value || null); resetPage(); }}><option value="">All models</option>{data.modelVersions.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select>
          <select className={selectClass} aria-label="Knowledge health" value={knowledge} onChange={(e) => { setKnowledge(e.target.value || null); resetPage(); }}><option value="">Any knowledge state</option>{["healthy","aging","stale","conflict","missing"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select className={selectClass} aria-label="Failure source" value={source} onChange={(e) => { setSource(e.target.value || null); resetPage(); }}><option value="">All sources</option>{sourceOptions.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select>
          <select className={selectClass} aria-label="Failure channel" value={channel} onChange={(e) => { setChannel(e.target.value || null); resetPage(); }}><option value="">All channels</option>{["email","web","telegram","whatsapp","api"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select className={selectClass} aria-label="Root cause" value={cause} onChange={(e) => { setCause(e.target.value || null); resetPage(); }}><option value="">All root causes</option>{Object.entries(rootCauseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>

        <div className={cn("grid min-h-[520px]", selected ? "xl:grid-cols-[minmax(0,1fr)_480px]" : "grid-cols-1")}>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                {table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} className="border-b border-[var(--border)] px-3 py-2 font-medium">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => <tr key={row.id} className={cn("border-b border-[var(--border)] hover:bg-[var(--surface-2)]", row.original.id === failureId && "bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-1))]")}>{row.getVisibleCells().map((cell, cellIndex) => <td key={cell.id} className="max-w-[220px] px-3 py-2.5 align-top">{cellIndex === 0 ? <button onClick={() => setFailureId(row.original.id)} aria-label={`Inspect failure ${row.original.id}`} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{flexRender(cell.column.columnDef.cell, cell.getContext())}</button> : flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
              </tbody>
            </table>
            {!filtered.length ? <div className="grid min-h-56 place-items-center p-6 text-center"><div><FileSearch className="mx-auto size-5 text-[var(--muted-foreground)]" /><div className="mt-2 text-sm font-medium">No failures match these filters</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Widen the time range or clear one of the URL-backed filters.</div></div></div> : null}
            {filtered.length ? <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2 text-xs"><span className="text-[var(--muted-foreground)]">Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())} · 60 rows/page</span><div className="flex gap-1"><Button size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button><Button size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button></div></div> : null}
          </div>
          {selected ? <><button aria-label="Close failure inspector" onClick={() => setFailureId(null)} className="fixed inset-0 top-12 z-40 bg-black/25 xl:hidden" /><FailureInspector failure={selected} sources={data.knowledgeSources} onClose={() => setFailureId(null)} /></> : null}
        </div>
      </Surface>
    </div>
  );
}

function EvaluationSuiteTable({ suites, selected, onSelect }: { suites: EvaluationSuite[]; selected: string; onSelect: (id: string | null) => void }) {
  return (
    <Surface className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Evaluation suites</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Pass rate describes the evaluation rubric; it is not a universal “accuracy” score.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left text-xs"><thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"><tr>{["Evaluation", "Pass rate", "Cases", "Δ previous", "Last run", "Status"].map((label) => <th key={label} className="border-b border-[var(--border)] px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{suites.map((suite) => {
        const delta = (suite.passRate - suite.previousPassRate) * 100;
        return <tr key={suite.id} onClick={() => onSelect(suite.id)} className={cn("cursor-pointer border-b border-[var(--border)] hover:bg-[var(--surface-2)]", selected === suite.id && "bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-1))]")}><td className="px-3 py-3"><div className="font-semibold">{suite.name}</div><div className="mt-0.5 max-w-[360px] text-[10px] text-[var(--muted-foreground)]">{suite.description}</div></td><td className="px-3 py-3 text-lg font-semibold">{pct(suite.passRate)}</td><td className="px-3 py-3">{suite.caseCount.toLocaleString()}</td><td className={cn("px-3 py-3 font-semibold", toneForDelta(delta))}>{pp(delta)}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{new Date(suite.lastRunAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</td><td className="px-3 py-3"><Badge tone={suite.status === "passing" ? "success" : suite.status === "regression" ? "danger" : "warning"}>{suite.status}</Badge></td></tr>;
      })}</tbody></table></div>
    </Surface>
  );
}

function EvaluationCases({ cases }: { cases: EvaluationCase[] }) {
  const summary = {
    passed: cases.filter((item) => item.result === "passed").length,
    failed: cases.filter((item) => item.result === "failed").length,
    regressions: cases.filter((item) => item.change === "regression").length,
    improved: cases.filter((item) => item.change === "improved").length,
  };
  return (
    <Surface className="overflow-hidden">
      <div className="grid grid-cols-4 border-b border-[var(--border)] py-3"><CompactMetric label="Passed" value={String(summary.passed)} note="sampled cases shown" /><CompactMetric label="Failed" value={String(summary.failed)} note="needs review" /><CompactMetric label="Regressions" value={String(summary.regressions)} note="vs previous version" /><CompactMetric label="Improved" value={String(summary.improved)} note="vs previous version" /></div>
      <div className="divide-y divide-[var(--border)]">{cases.map((item) => <article key={item.id} className="grid gap-3 p-4 xl:grid-cols-[1fr_1fr_1fr_0.8fr]"><div><div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Input</div><div className="mt-1 text-xs leading-5">{item.input}</div></div><div><div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Expected</div><div className="mt-1 text-xs leading-5">{item.expectedBehavior}</div></div><div><div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Observed</div><div className="mt-1 text-xs leading-5">{item.observedBehavior}</div></div><div><div className="flex gap-1.5"><Badge tone={item.result === "passed" ? "success" : "danger"}>{item.result}</Badge><Badge tone={item.change === "regression" ? "danger" : item.change === "improved" ? "success" : "neutral"}>{item.change}</Badge></div><div className="mt-2 text-[11px] text-[var(--muted-foreground)]">Evidence: {item.evidence}</div><div className="mt-1 text-[10px] font-medium">{item.version}</div></div></article>)}</div>
    </Surface>
  );
}

function EvaluationsView({ data }: { data: WorkspaceData }) {
  const [suiteId, setSuiteId] = useQueryState("suite", { defaultValue: "grounding" });
  const selected = data.evaluationSuites.find((suite) => suite.id === suiteId) ?? data.evaluationSuites[0];
  const cases = data.evaluationCases.filter((item) => item.suiteId === selected.id);
  const run = data.evaluationRun;
  const delta = (run.overallPassRate - run.previousPassRate) * 100;

  return (
    <div className="space-y-4">
      <Surface className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><Badge tone="info">Version comparison</Badge><span className="text-xs font-semibold">{run.previousModelVersion} → {run.modelVersion}</span></div><div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-semibold">{pct(run.overallPassRate)}</span><span className={cn("text-xs font-semibold", toneForDelta(delta))}>{pp(delta)} overall</span></div><p className="mt-1 text-xs text-[var(--muted-foreground)]">Aggregate improvement does not establish statistical significance and must not hide segment regressions.</p></div><div className="text-xs text-[var(--muted-foreground)]">Run {new Date(run.runAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{run.segmentChanges.map((segment) => <div key={segment.segment} className={cn("rounded-md border p-3", segment.deltaPercentagePoints < 0 ? "border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_4%,var(--surface-1))]" : "border-[var(--border)] bg-[var(--surface-2)]")}><div className="text-xs font-semibold">{segment.segment}</div><div className={cn("mt-1 text-lg font-semibold", toneForDelta(segment.deltaPercentagePoints))}>{pp(segment.deltaPercentagePoints)}</div><div className="mt-1 text-[10px] leading-4 text-[var(--muted-foreground)]">{segment.note}</div></div>)}</div>
      </Surface>
      <EvaluationSuiteTable suites={data.evaluationSuites} selected={selected.id} onSelect={setSuiteId} />
      <EvaluationCases cases={cases} />
    </div>
  );
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

function ShadowView({ data }: { data: WorkspaceData }) {
  const [shadowId, setShadowId] = useQueryState("shadowId", { defaultValue: "shadow-001" });
  const selected = data.shadowSimulations.find((item) => item.id === shadowId) ?? data.shadowSimulations[0];
  const summary = data.shadowSummary;
  return (
    <div className="space-y-4">
      <Surface className="overflow-hidden"><div className="grid grid-cols-2 gap-y-3 py-3 sm:grid-cols-5"><CompactMetric label="Historical analyzed" value={summary.analyzed.toLocaleString()} note="shadow-only; no messages sent" /><CompactMetric label="Draft possible" value={summary.draftPossible.toLocaleString()} note="grounded draft possible" /><CompactMetric label="Human review" value={summary.humanReview.toLocaleString()} note="approval required" /><CompactMetric label="Human-only" value={summary.humanOnly.toLocaleString()} note="policy blocks autonomy" /><CompactMetric label="Insufficient knowledge" value={summary.insufficientKnowledge.toLocaleString()} note="draft withheld" /></div></Surface>
      <Surface className="border-[color-mix(in_srgb,var(--ai)_28%,var(--border))] p-4"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--ai)]" /><div><div className="text-sm font-semibold">Shadow Mode never sends customer replies</div><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">This surface answers “what would AI have proposed on historical conversations if enabled today?” Actual customer outcomes remain the comparison baseline; simulation does not execute actions.</p></div></div></Surface>
      <ReadinessTable rows={data.automationReadiness} />
      <Surface className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Historical simulation samples</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Select a conversation to compare the actual resolution with today’s proposed AI behavior.</p></div><select aria-label="Shadow simulation" value={selected.id} onChange={(event) => setShadowId(event.target.value)} className="h-8 max-w-sm rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs">{data.shadowSimulations.map((simulation) => <option key={simulation.id} value={simulation.id}>{simulation.conversationId} · {titleize(simulation.intent)}</option>)}</select></div><ShadowDiff simulation={selected} sources={data.knowledgeSources} /></Surface>
      <Recommendations items={data.recommendations} />
    </div>
  );
}

export function AIQualityWorkspace() {
  const query = useQuery({ queryKey: ["ai-quality-workspace"], queryFn: getAIQualityWorkspace });
  const [tabRaw, setTabRaw] = useQueryState("tab", { defaultValue: "overview" });
  const [range, setRange] = useQueryState("range", { defaultValue: "30d" });
  const [metric, setMetric] = useQueryState("metric", { defaultValue: "acceptedRate" });
  const [cause, setCause] = useQueryState("cause", { defaultValue: "" });

  if (query.isLoading || !query.data) return <LoadingState label="Loading AI quality diagnostics…" />;

  const validTabs: Tab[] = ["overview", "failures", "evaluations", "shadow"];
  const tab: Tab = validTabs.includes(tabRaw as Tab) ? tabRaw as Tab : "overview";
  const setTab = (value: Tab) => setTabRaw(value);
  const inspectCause = (value: FailureCause) => {
    setCause(value);
    setTab("failures");
  };

  return (
    <div className="si-page mx-auto max-w-[1720px]">
      <div className="si-page-header">
        <div><h1 className="si-page-title">AI Quality</h1><p className="si-page-subtitle">Where AI is reliable, where it fails, why it fails, and what should change before more support work is automated.</p></div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><CircleDot className="size-3.5 text-[var(--success)]" />Deterministic evaluation snapshot · 09:15 UTC</div>
      </div>

      <Surface className="mb-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-2">
          <div role="tablist" aria-label="AI Quality workspace views" className="flex overflow-x-auto">
            <TabButton value="overview" active={tab} onClick={setTab}>Overview</TabButton>
            <TabButton value="failures" active={tab} onClick={setTab}>Failures <Badge tone="danger" className="ml-1">{query.data.failures.length}</Badge></TabButton>
            <TabButton value="evaluations" active={tab} onClick={setTab}>Evaluations</TabButton>
            <TabButton value="shadow" active={tab} onClick={setTab}>Shadow Mode</TabButton>
          </div>
          <div className="hidden items-center gap-1 text-[10px] text-[var(--muted-foreground)] md:flex"><ShieldCheck className="size-3.5" />No universal AI confidence score</div>
        </div>
      </Surface>

      {tab === "overview" ? <OverviewView data={query.data} range={range} setRange={setRange} metric={metric} setMetric={setMetric} inspectCause={inspectCause} /> : null}
      {tab === "failures" ? <FailuresView data={query.data} range={range} setRange={setRange} cause={cause} setCause={setCause} /> : null}
      {tab === "evaluations" ? <EvaluationsView data={query.data} /> : null}
      {tab === "shadow" ? <ShadowView data={query.data} /> : null}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--muted-foreground)]"><span className="inline-flex items-center gap-1"><ShieldCheck className="size-3 text-[var(--success)]" />Human-only policy can be correct quality behavior</span><span className="inline-flex items-center gap-1"><AlertTriangle className="size-3 text-[var(--warning)]" />Correlation is not treated as root cause</span><span className="inline-flex items-center gap-1"><Languages className="size-3" />Locale conclusions always retain sample size</span></div>
    </div>
  );
}
