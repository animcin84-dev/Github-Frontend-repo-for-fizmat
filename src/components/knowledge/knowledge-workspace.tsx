"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  FileSearch,
  GitCompareArrows,
  Languages,
  Link2,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-state";
import { Surface } from "@/components/ui/surface";
import type { KnowledgeConflict, KnowledgeCoverage, KnowledgeGap, KnowledgeSource } from "@/lib/domain";
import { getKnowledgeWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";

const NOW = Date.parse("2026-10-03T09:15:00Z");

const statusTone: Record<KnowledgeSource["status"], "neutral" | "info" | "warning" | "danger" | "success"> = {
  healthy: "success",
  aging: "warning",
  stale: "warning",
  conflict: "danger",
  missing_owner: "danger",
};

const authorityTone: Record<KnowledgeSource["authority"], "success" | "info" | "neutral"> = {
  authoritative: "success",
  supporting: "info",
  unverified: "neutral",
};

function daysOld(value: string) {
  return Math.max(0, Math.floor((NOW - Date.parse(value)) / 86_400_000));
}

function TabButton({ value, active, onClick, children }: { value: string; active: string; onClick: (value: string) => void; children: React.ReactNode }) {
  const selected = value === active;
  return <button role="tab" aria-selected={selected} onClick={() => onClick(value)} className={cn("relative h-10 px-3 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]", selected && "text-[var(--foreground)] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]")}>{children}</button>;
}

function SummaryStat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "warning" | "danger" | "success" }) {
  const valueClass = tone === "danger" ? "text-[var(--danger)]" : tone === "warning" ? "text-[var(--warning)]" : tone === "success" ? "text-[var(--success)]" : "";
  return <div className="min-w-0 border-r border-[var(--border)] px-3 last:border-r-0"><div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">{label}</div><div className={cn("mt-1 text-lg font-semibold", valueClass)}>{value}</div><div className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{note}</div></div>;
}

function SourceInspector({
  source,
  conflicts,
  sources,
  onClose,
}: {
  source: KnowledgeSource;
  conflicts: KnowledgeConflict[];
  sources: KnowledgeSource[];
  onClose: () => void;
}) {
  const relatedConflicts = conflicts.filter((item) => item.sourceAId === source.id || item.sourceBId === source.id);
  const age = daysOld(source.lastUpdatedAt);
  const stale = age > source.freshnessTargetDays;
  const action = (message: string) => toast.success(message, { description: "Mock feedback only — no knowledge source was changed." });

  return (
    <aside className="fixed inset-y-12 right-0 z-40 w-[min(94vw,390px)] min-w-0 overflow-auto border-l border-[var(--border)] bg-[var(--surface-1)] shadow-2xl xl:sticky xl:top-12 xl:z-auto xl:h-[calc(100dvh-68px)] xl:w-auto xl:shadow-none" aria-label="Knowledge source details">
      <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-1.5"><Badge tone={statusTone[source.status]}>{source.status.replace("_", " ")}</Badge><Badge tone={authorityTone[source.authority]}>{source.authority}</Badge></div><h2 className="mt-2 text-sm font-semibold">{source.title}</h2><div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{source.type}</div></div>
        <button onClick={onClose} aria-label="Close source details" className="grid size-7 place-items-center rounded-md hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button>
      </div>

      <div className="space-y-4 p-4">
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Metadata</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div><dt className="text-[var(--muted-foreground)]">Owner</dt><dd className="mt-0.5 font-medium">{source.owner ?? "Missing owner"}</dd></div>
            <div><dt className="text-[var(--muted-foreground)]">Authority</dt><dd className="mt-0.5 font-medium">{source.authority}</dd></div>
            <div><dt className="text-[var(--muted-foreground)]">Updated</dt><dd className="mt-0.5 font-medium">{new Date(source.lastUpdatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</dd></div>
            <div><dt className="text-[var(--muted-foreground)]">Valid from</dt><dd className="mt-0.5 font-medium">{source.validFrom ? new Date(source.validFrom).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "Not specified"}</dd></div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">{source.summary}</p>
        </section>

        <section className={cn("rounded-md border p-3", stale ? "border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)]" : "border-[color-mix(in_srgb,var(--success)_28%,var(--border))] bg-[color-mix(in_srgb,var(--success)_4%,transparent)]")}>
          <div className="flex items-center gap-2"><Clock3 className={cn("size-4", stale ? "text-[var(--warning)]" : "text-[var(--success)]")} /><div className="text-xs font-semibold">Freshness</div></div>
          <div className="mt-2 text-lg font-semibold">Updated {age} days ago</div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">{source.type} target freshness: {source.freshnessTargetDays} days</div>
          <div className={cn("mt-2 text-[10px] font-bold uppercase tracking-[0.14em]", stale ? "text-[var(--warning)]" : "text-[var(--success)]")}>{stale ? "STALE / REVIEW" : "WITHIN TARGET"}</div>
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Coverage</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">{source.coverageTopics.map((topic) => <Badge key={topic}>{topic}</Badge>)}</div>
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Usage</h3>
          <div className="mt-2 grid grid-cols-2 gap-3"><div><div className="text-xl font-semibold">{source.retrievalCount30d}</div><div className="text-[11px] text-[var(--muted-foreground)]">retrievals · 30d</div></div><div><div className="text-xl font-semibold">{source.usedInRecentAnswers}</div><div className="text-[11px] text-[var(--muted-foreground)]">recent answer uses</div></div></div>
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Recent answer usage</h3>
          <div className="mt-2 divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">{source.recentConversationIds.length ? source.recentConversationIds.map((id) => <Link key={id} href={`/inbox/${id}`} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-[var(--surface-2)]"><span>{id}</span><ArrowRight className="size-3.5 text-[var(--muted-foreground)]" /></Link>) : <div className="px-3 py-2 text-xs text-[var(--muted-foreground)]">No recent customer-answer retrievals.</div>}</div>
        </section>

        {relatedConflicts.length ? <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Conflicts</h3>
          <div className="mt-2 space-y-3">{relatedConflicts.map((conflict) => {
            const sourceA = sources.find((item) => item.id === conflict.sourceAId);
            const sourceB = sources.find((item) => item.id === conflict.sourceBId);
            return <div key={conflict.id} className="rounded-md border border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] p-3"><div className="text-xs font-semibold">{conflict.topic}</div><div className="mt-3 grid gap-2"><div className="rounded bg-[var(--surface-2)] p-2"><div className="text-[10px] font-semibold text-[var(--muted-foreground)]">{sourceA?.title}</div><div className="mt-1 text-xs">“{conflict.claimA}”</div></div><div className="rounded bg-[var(--surface-2)] p-2"><div className="text-[10px] font-semibold text-[var(--muted-foreground)]">{sourceB?.title}</div><div className="mt-1 text-xs">“{conflict.claimB}”</div></div></div><div className="mt-2 text-[11px] text-[var(--danger)]">Conflict detected · {conflict.affectedDraftCount} AI drafts retrieved both sources</div></div>;
          })}</div>
        </section> : null}

        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
          <Button size="sm" onClick={() => action("Conflict review opened")}><GitCompareArrows className="size-3.5" />Review conflict</Button>
          <Button size="sm" onClick={() => action("Newer source preference staged")}><CheckCircle2 className="size-3.5" />Prefer newer source</Button>
          <Button size="sm" onClick={() => action("Deprecation staged for review")}><AlertTriangle className="size-3.5" />Mark deprecated</Button>
        </div>
      </div>
    </aside>
  );
}

function SourcesView({ sources, conflicts, selectedId, setSelectedId }: { sources: KnowledgeSource[]; conflicts: KnowledgeConflict[]; selectedId: string; setSelectedId: (value: string | null) => void }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sources.filter((source) => !needle || `${source.title} ${source.owner ?? ""} ${source.coverageTopics.join(" ")}`.toLowerCase().includes(needle));
  }, [sources, query]);
  const selected = sources.find((source) => source.id === selectedId);

  return (
    <div className={cn("grid min-h-[560px]", selected ? "xl:grid-cols-[minmax(0,1fr)_390px]" : "grid-cols-1")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2"><div className="flex h-8 min-w-0 max-w-md flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2"><Search className="size-3.5 text-[var(--muted-foreground)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search knowledge sources" placeholder="Search sources, owners, topics" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div><Badge>{visible.length} sources</Badge></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-xs">
            <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"><tr>{["Source", "Type", "Owner", "Authority", "Status", "Last updated", "Retrievals 30d", "Topics", "Recent answers"].map((label) => <th key={label} className="border-b border-[var(--border)] px-3 py-2 font-medium">{label}</th>)}</tr></thead>
            <tbody>{visible.map((source) => <tr key={source.id} className={cn("border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]", selectedId === source.id && "bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-1))]")}>
              <td className="max-w-[300px] px-3 py-3"><button onClick={() => setSelectedId(source.id)} className="max-w-full truncate text-left font-semibold hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{source.title}</button></td>
              <td className="px-3 py-3 text-[var(--muted-foreground)]">{source.type}</td>
              <td className="px-3 py-3">{source.owner ?? <span className="text-[var(--danger)]">Missing owner</span>}</td>
              <td className="px-3 py-3"><Badge tone={authorityTone[source.authority]}>{source.authority}</Badge></td>
              <td className="px-3 py-3"><Badge tone={statusTone[source.status]}>{source.status.replace("_", " ")}</Badge></td>
              <td className="px-3 py-3 text-[var(--muted-foreground)]">{daysOld(source.lastUpdatedAt)}d ago</td>
              <td className="px-3 py-3 font-medium">{source.retrievalCount30d}</td>
              <td className="max-w-[230px] px-3 py-3"><div className="truncate text-[var(--muted-foreground)]">{source.coverageTopics.join(", ")}</div></td>
              <td className="px-3 py-3">{source.usedInRecentAnswers}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
      {selected ? <><button aria-label="Close source details" onClick={() => setSelectedId(null)} className="fixed inset-0 top-12 z-30 bg-black/25 xl:hidden" /><SourceInspector source={selected} conflicts={conflicts} sources={sources} onClose={() => setSelectedId(null)} /></> : null}
    </div>
  );
}

function GapsView({ gaps }: { gaps: KnowledgeGap[] }) {
  const [states, setStates] = useState<Record<string, string>>({});
  const act = (gap: KnowledgeGap, state: string, message: string) => {
    setStates((current) => ({ ...current, [gap.id]: state }));
    toast.success(message, { description: "Mock knowledge workflow only — no backend state changed." });
  };
  return <div className="divide-y divide-[var(--border)]">{gaps.map((gap) => <article key={gap.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(260px,1.25fr)_120px_110px_minmax(220px,1fr)_auto] lg:items-center">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{gap.topic}</h3><Badge tone={states[gap.id] === "resolved" ? "success" : gap.status === "drafted" ? "info" : "warning"}>{states[gap.id] ?? gap.status}</Badge>{gap.relatedIssueId ? <Link href={`/intelligence/${gap.relatedIssueId}`} className="text-[11px] font-medium text-[var(--accent)] hover:underline">Related issue</Link> : null}</div><blockquote className="mt-2 border-l-2 border-[var(--border-strong)] pl-3 text-xs leading-5 text-[var(--muted-foreground)]">“{gap.exampleQuestion}”</blockquote><div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]"><Languages className="size-3.5" />{gap.affectedLanguages.map((language) => <Badge key={language}>{language}</Badge>)}</div></div>
    <div><div className="text-xl font-semibold">{gap.conversationCount}</div><div className="text-[11px] text-[var(--muted-foreground)]">conversations</div></div>
    <div><div className="text-xl font-semibold text-[var(--warning)]">+{gap.trendPercent}%</div><div className="text-[11px] text-[var(--muted-foreground)]">trend</div></div>
    <div className="text-xs"><div className="text-[var(--muted-foreground)]">Suggested owner</div><div className="mt-1 font-medium">{gap.suggestedOwner ?? "Unassigned"}</div><div className="mt-1 text-[11px] text-[var(--muted-foreground)]">First seen {new Date(gap.firstSeenAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}</div><div className="mt-1 text-[11px] text-[var(--danger)]">No authoritative answer found.</div></div>
    <div className="flex flex-wrap gap-1.5 lg:justify-end"><Link href={`/inbox?q=${encodeURIComponent(gap.exampleQuestion.split(" ").slice(0, 4).join(" "))}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-[11px] font-medium hover:bg-[var(--surface-2)]">Conversations <ArrowRight className="size-3" /></Link><Button size="sm" onClick={() => act(gap, "drafted", "Knowledge article draft staged")}>Draft article</Button><Button size="sm" onClick={() => act(gap, "assigned", "Suggested owner assigned in mock state")}>Assign</Button><Button size="sm" onClick={() => act(gap, "resolved", "Gap marked resolved in mock state")}>Resolve</Button></div>
  </article>)}</div>;
}

function ConflictCard({ conflict, sources }: { conflict: KnowledgeConflict; sources: KnowledgeSource[] }) {
  const [state, setState] = useState(conflict.status);
  const sourceA = sources.find((source) => source.id === conflict.sourceAId);
  const sourceB = sources.find((source) => source.id === conflict.sourceBId);
  if (!sourceA || !sourceB) return null;
  const act = (next: KnowledgeConflict["status"], message: string) => { setState(next); toast.success(message, { description: "Mock conflict review only — no source state changed." }); };

  const sourcePanel = (source: KnowledgeSource, claim: string) => <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold">{source.title}</div><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{source.owner ?? "Missing owner"} · updated {daysOld(source.lastUpdatedAt)}d ago</div></div><Badge tone={authorityTone[source.authority]}>{source.authority}</Badge></div><div className="mt-3 rounded border border-[var(--border)] bg-[var(--surface-1)] p-2.5 text-xs leading-5">“{claim}”</div><div className="mt-2 text-[11px] text-[var(--muted-foreground)]">{source.retrievalCount30d} retrievals in 30d · {source.usedInRecentAnswers} recent answer uses</div></div>;

  return <article className="border-b border-[var(--border)] p-4 last:border-b-0">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><GitCompareArrows className="size-4 text-[var(--danger)]" /><h3 className="text-sm font-semibold">{conflict.topic}</h3><Badge tone={state === "resolved" ? "success" : state === "reviewing" ? "info" : "danger"}>{state}</Badge></div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{conflict.affectedDraftCount} AI drafts retrieved both sources · {conflict.humanReviewCount} required human review</div></div>{conflict.relatedIssueId ? <Link href={`/intelligence/${conflict.relatedIssueId}`} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">Open related issue <ArrowRight className="size-3" /></Link> : null}</div>
    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_28px_1fr] lg:items-stretch">{sourcePanel(sourceA, conflict.claimA)}<div className="grid place-items-center"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">vs</span></div>{sourcePanel(sourceB, conflict.claimB)}</div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><Link href={`/inbox/${conflict.affectedConversationIds[0]}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Affected conversations <ArrowRight className="size-3" /></Link><Button size="sm" onClick={() => act("reviewing", "Conflict review started")}>Review conflict</Button><Button size="sm" onClick={() => act("reviewing", "Newer-source preference staged")}>Prefer newer source</Button><Button size="sm" onClick={() => act("resolved", "Legacy source deprecation staged")}>Mark legacy deprecated</Button></div>
  </article>;
}

function ConflictsView({ conflicts, sources }: { conflicts: KnowledgeConflict[]; sources: KnowledgeSource[] }) {
  return <div>{conflicts.map((conflict) => <ConflictCard key={conflict.id} conflict={conflict} sources={sources} />)}</div>;
}

function CoverageView({ coverage, sources }: { coverage: KnowledgeCoverage[]; sources: KnowledgeSource[] }) {
  const coverageTone = (value: KnowledgeCoverage["coverage"]) => value === "strong" ? "success" : value === "medium" ? "info" : value === "weak" ? "warning" : "danger";
  return <div className="overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-left text-xs"><thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"><tr>{["Topic", "Coverage", "Authority", "Freshness", "Supporting sources", "Risk / next step"].map((label) => <th key={label} className="border-b border-[var(--border)] px-4 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{coverage.map((row) => <tr key={row.topic} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]"><td className="px-4 py-3 font-semibold">{row.topic}</td><td className="px-4 py-3"><Badge tone={coverageTone(row.coverage)}>{row.coverage}</Badge></td><td className="px-4 py-3"><Badge tone={row.authority === "strong" ? "success" : row.authority === "supporting" ? "info" : "danger"}>{row.authority}</Badge></td><td className="px-4 py-3"><Badge tone={row.freshness === "fresh" ? "success" : row.freshness === "aging" ? "warning" : row.freshness === "stale" ? "danger" : "neutral"}>{row.freshness}</Badge></td><td className="max-w-[320px] px-4 py-3"><div className="flex flex-wrap gap-1">{row.sourceIds.map((id) => { const source = sources.find((item) => item.id === id); return <Link key={id} href={`/knowledge?tab=sources&source=${id}`} className="rounded border border-[var(--border)] px-1.5 py-1 text-[10px] hover:bg-[var(--surface-3)]">{source?.title ?? id}</Link>; })}</div></td><td className="px-4 py-3 text-[var(--muted-foreground)]">{row.coverage === "strong" && row.authority === "strong" ? "No immediate coverage action" : row.authority === "missing" ? "Authoritative policy needed" : "Review source freshness / scope"}</td></tr>)}</tbody></table></div>;
}

export function KnowledgeWorkspace() {
  const query = useQuery({ queryKey: ["knowledge-workspace"], queryFn: getKnowledgeWorkspace });
  const [tab, setTab] = useQueryState("tab", { defaultValue: "sources" });
  const [sourceId, setSourceId] = useQueryState("source", { defaultValue: "" });
  if (query.isLoading || !query.data) return <LoadingState label="Loading knowledge health…" />;

  const { sources, gaps, conflicts, coverage } = query.data;
  const healthy = sources.filter((source) => source.status === "healthy").length;
  const stale = sources.filter((source) => source.status === "stale" || source.status === "aging").length;
  const missingOwners = sources.filter((source) => !source.owner || source.status === "missing_owner").length;
  const coverageRisk = coverage.filter((row) => row.coverage === "weak" || row.coverage === "missing" || row.authority === "missing").length;

  return (
    <div className="si-page mx-auto max-w-[1720px]">
      <div className="si-page-header"><div><h1 className="si-page-title">Knowledge</h1><p className="si-page-subtitle">AI Knowledge Health control center: authority, freshness, conflicts and missing coverage behind customer answers.</p></div><div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><ShieldCheck className="size-4 text-[var(--success)]" />Transparent signals, no synthetic health score</div></div>

      <Surface className="mb-4 overflow-hidden"><div className="grid grid-cols-2 gap-y-3 py-3 sm:grid-cols-3 xl:grid-cols-6"><SummaryStat label="Healthy sources" value={String(healthy)} note="within authority/freshness rules" tone="success" /><SummaryStat label="Stale / aging" value={String(stale)} note="needs content review" tone="warning" /><SummaryStat label="Conflicts" value={String(conflicts.filter((item) => item.status !== "resolved").length)} note="claim-level disagreements" tone="danger" /><SummaryStat label="Missing owners" value={String(missingOwners)} note="no accountable maintainer" tone="danger" /><SummaryStat label="Open gaps" value={String(gaps.filter((gap) => gap.status !== "resolved").length)} note="repeated unanswered intents" tone="warning" /><SummaryStat label="Coverage risk" value={String(coverageRisk)} note="weak/missing topics, not a score" tone="warning" /></div></Surface>

      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-2">
          <div role="tablist" aria-label="Knowledge workspace views" className="flex overflow-x-auto"><TabButton value="sources" active={tab} onClick={(value) => setTab(value)}>Sources</TabButton><TabButton value="gaps" active={tab} onClick={(value) => setTab(value)}>Gaps <Badge className="ml-1">{gaps.length}</Badge></TabButton><TabButton value="conflicts" active={tab} onClick={(value) => setTab(value)}>Conflicts <Badge tone="danger" className="ml-1">{conflicts.length}</Badge></TabButton><TabButton value="coverage" active={tab} onClick={(value) => setTab(value)}>Coverage</TabButton></div>
          <div className="hidden items-center gap-1 text-[10px] text-[var(--muted-foreground)] md:flex"><BookOpenCheck className="size-3.5" />Sources inform AI only within their authority and freshness boundaries</div>
        </div>
        <div role="tabpanel">
          {tab === "sources" ? <SourcesView sources={sources} conflicts={conflicts} selectedId={sourceId} setSelectedId={setSourceId} /> : null}
          {tab === "gaps" ? <GapsView gaps={gaps} /> : null}
          {tab === "conflicts" ? <ConflictsView conflicts={conflicts} sources={sources} /> : null}
          {tab === "coverage" ? <CoverageView coverage={coverage} sources={sources} /> : null}
          {!["sources", "gaps", "conflicts", "coverage"].includes(tab) ? <div className="grid min-h-64 place-items-center text-sm text-[var(--muted-foreground)]"><FileSearch className="mb-2 size-5" />Unknown knowledge view</div> : null}
        </div>
      </Surface>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--muted-foreground)]"><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3 text-[var(--success)]" />Authority is independent from semantic similarity</span><span className="inline-flex items-center gap-1"><AlertTriangle className="size-3 text-[var(--warning)]" />Resolved cases can support examples but are not policy</span><span className="inline-flex items-center gap-1"><Link2 className="size-3" />Every risk view links back to conversations or intelligence</span></div>
    </div>
  );
}
