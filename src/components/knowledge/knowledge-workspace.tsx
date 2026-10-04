"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileSearch,
  GitCompareArrows,
  Languages,
  Link2,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-state";
import { DetailBand, FilterHinge, OperationalWorkspace, ReferenceSummary, RouteHeader, WorkspaceTabs } from "@/components/reference/reference-layout";
import type { KnowledgeConflict, KnowledgeCoverage, KnowledgeGap, KnowledgeSource } from "@/lib/domain";
import { getKnowledgeWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";

const automationPolicyForSource: Record<string, string> = {
  "ks-refund-policy": "policy-refund",
  "ks-refund-help-ru": "policy-refund",
  "ks-subscription-legacy": "policy-subscription-cancel",
  "ks-subscription-policy-2026": "policy-subscription-cancel",
  "ks-identity-policy": "policy-account-email",
  "ks-security-runbook": "policy-account-email",
  "ks-delivery-guide": "policy-order-lookup",
  "ks-carrier-status": "policy-order-lookup",
  "ks-payment-auth": "policy-payment-lookup",
};

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
  const action = (message: string) => toast.success(message, { description: "Review opened. Source content remains unchanged." });

  return (
    <aside className="flex min-h-0 flex-1 flex-col" aria-label="Knowledge source details">
      <div className="si-detail-header">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-1.5"><Badge tone={statusTone[source.status]}>{source.status.replace("_", " ")}</Badge><Badge tone={authorityTone[source.authority]}>{source.authority}</Badge></div><h2 className="mt-2">{source.title}</h2><div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{source.type}</div></div>
        <button onClick={onClose} aria-label="Close source details" className="grid size-7 place-items-center rounded-md hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button>
      </div>

      <div className="si-detail-scroll space-y-4">
        <div className="si-detail-grid"><div className="si-detail-tile">AI usage<strong>{source.usedInRecentAnswers}</strong>Recent answer uses</div><div className="si-detail-tile">Source freshness<strong>{age}d</strong>{source.freshnessTargetDays} day target</div><div className="si-detail-tile">Source provenance<strong>{source.type}</strong>Version history unavailable</div></div>
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Metadata</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div><dt className="text-[var(--muted-foreground)]">Owner</dt><dd className="mt-0.5 font-medium">{source.owner ?? "Missing owner"}</dd></div>
            <div><dt className="text-[var(--muted-foreground)]">Authority</dt><dd className="mt-0.5 font-medium">{source.authority}</dd></div>
            <div><dt className="text-[var(--muted-foreground)]">Updated</dt><dd className="mt-0.5 font-medium">{new Date(source.lastUpdatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</dd></div>
            <div><dt className="text-[var(--muted-foreground)]">Valid from</dt><dd className="mt-0.5 font-medium">{source.validFrom ? new Date(source.validFrom).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "Not specified"}</dd></div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">{source.summary}</p>{source.primaryClaim ? <blockquote className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3 text-xs leading-5">“{source.primaryClaim}”</blockquote> : null}
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
          {automationPolicyForSource[source.id] ? <Link href={`/automation?tab=policies&policy=${automationPolicyForSource[source.id]}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Affected automation policy <ArrowRight className="size-3.5" /></Link> : null}
        </div>
      </div>
      <DetailBand metrics={[{ label: "Retrievals · 30d", value: source.retrievalCount30d }, { label: "Claim conflicts", value: relatedConflicts.length }, { label: "Version", value: "Not tracked" }]} action={<Button variant="primary" size="sm" onClick={() => action("Source update review opened")}>Review update</Button>} />
    </aside>
  );
}

function GapsView({ gaps }: { gaps: KnowledgeGap[] }) {
  const [states, setStates] = useState<Record<string, string>>({});
  const act = (gap: KnowledgeGap, state: string, message: string) => {
    setStates((current) => ({ ...current, [gap.id]: state }));
    toast.success(message, { description: "Decision recorded for this session." });
  };
  return <div className="divide-y divide-[var(--border)]">{gaps.map((gap) => <article key={gap.id} className="grid grid-cols-2 gap-4 py-2 [&>div:first-child]:col-span-2 [&>div:last-child]:col-span-2">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{gap.topic}</h3><Badge tone={states[gap.id] === "resolved" ? "success" : gap.status === "drafted" ? "info" : "warning"}>{states[gap.id] ?? gap.status}</Badge>{gap.relatedIssueId ? <Link href={`/intelligence/${gap.relatedIssueId}`} className="text-[11px] font-medium text-[var(--accent)] hover:underline">Related issue</Link> : null}</div><blockquote className="mt-2 border-l-2 border-[var(--border-strong)] pl-3 text-xs leading-5 text-[var(--muted-foreground)]">“{gap.exampleQuestion}”</blockquote><div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]"><Languages className="size-3.5" />{gap.affectedLanguages.map((language) => <Badge key={language}>{language}</Badge>)}</div></div>
    <div><div className="text-xl font-semibold">{gap.conversationCount}</div><div className="text-[11px] text-[var(--muted-foreground)]">conversations</div></div>
    <div><div className="text-xl font-semibold text-[var(--warning)]">+{gap.trendPercent}%</div><div className="text-[11px] text-[var(--muted-foreground)]">trend</div></div>
    <div className="text-xs"><div className="text-[var(--muted-foreground)]">Suggested owner</div><div className="mt-1 font-medium">{gap.suggestedOwner ?? "Unassigned"}</div><div className="mt-1 text-[11px] text-[var(--muted-foreground)]">First seen {new Date(gap.firstSeenAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}</div><div className="mt-1 text-[11px] text-[var(--danger)]">No authoritative answer found.</div></div>
    <div className="flex flex-wrap gap-1.5 lg:justify-end"><Link href={`/inbox?q=${encodeURIComponent(gap.exampleQuestion.split(" ").slice(0, 4).join(" "))}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-[11px] font-medium hover:bg-[var(--surface-2)]">Conversations <ArrowRight className="size-3" /></Link><Button size="sm" onClick={() => act(gap, "drafted", "Knowledge article draft staged")}>Draft article</Button><Button size="sm" onClick={() => act(gap, "assigned", "Suggested owner selected")}>Assign</Button><Button size="sm" onClick={() => act(gap, "resolved", "Gap marked resolved for this session")}>Resolve</Button></div>
  </article>)}</div>;
}

function ConflictCard({ conflict, sources }: { conflict: KnowledgeConflict; sources: KnowledgeSource[] }) {
  const [state, setState] = useState(conflict.status);
  const sourceA = sources.find((source) => source.id === conflict.sourceAId);
  const sourceB = sources.find((source) => source.id === conflict.sourceBId);
  if (!sourceA || !sourceB) return null;
  const act = (next: KnowledgeConflict["status"], message: string) => { setState(next); toast.success(message, { description: "Review updated for this session. Source content remains unchanged." }); };

  const sourcePanel = (source: KnowledgeSource, claim: string) => <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold">{source.title}</div><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{source.owner ?? "Missing owner"} · updated {daysOld(source.lastUpdatedAt)}d ago</div></div><Badge tone={authorityTone[source.authority]}>{source.authority}</Badge></div><div className="mt-3 rounded border border-[var(--border)] bg-[var(--surface-1)] p-2.5 text-xs leading-5">“{claim}”</div><div className="mt-2 text-[11px] text-[var(--muted-foreground)]">{source.retrievalCount30d} retrievals in 30d · {source.usedInRecentAnswers} recent answer uses</div></div>;

  return <article className="border-b border-[var(--border)] p-4 last:border-b-0">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><GitCompareArrows className="size-4 text-[var(--danger)]" /><h3 className="text-sm font-semibold">{conflict.topic}</h3><Badge tone={state === "resolved" ? "success" : state === "reviewing" ? "info" : "danger"}>{state}</Badge></div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{conflict.affectedDraftCount} AI drafts retrieved both sources · {conflict.humanReviewCount} required human review</div></div>{conflict.relatedIssueId ? <Link href={`/intelligence/${conflict.relatedIssueId}`} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">Open related issue <ArrowRight className="size-3" /></Link> : null}</div>
    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_28px_1fr] lg:items-stretch">{sourcePanel(sourceA, conflict.claimA)}<div className="grid place-items-center"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">vs</span></div>{sourcePanel(sourceB, conflict.claimB)}</div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><Link href={`/inbox/${conflict.affectedConversationIds[0]}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Affected conversations <ArrowRight className="size-3" /></Link><Button size="sm" onClick={() => act("reviewing", "Conflict review started")}>Review conflict</Button><Button size="sm" onClick={() => act("reviewing", "Newer-source preference staged")}>Prefer newer source</Button><Button size="sm" onClick={() => act("resolved", "Legacy source deprecation staged")}>Mark legacy deprecated</Button></div>
  </article>;
}

function CoverageView({ coverage, sources }: { coverage: KnowledgeCoverage[]; sources: KnowledgeSource[] }) {
  const coverageTone = (value: KnowledgeCoverage["coverage"]) => value === "strong" ? "success" : value === "medium" ? "info" : value === "weak" ? "warning" : "danger";
  return <div>{coverage.map((row) => <article key={row.topic}>
    <div className="si-detail-header"><div><div className="si-label">Topic coverage</div><h2>{row.topic}</h2></div><Badge tone={coverageTone(row.coverage)}>{row.coverage}</Badge></div>
    <div className="si-detail-grid"><div className="si-detail-tile">Coverage<strong>{row.coverage}</strong>Topic source scope</div><div className="si-detail-tile">Authority<strong>{row.authority}</strong>Independent of similarity</div><div className="si-detail-tile">Freshness<strong>{row.freshness}</strong>Source status</div></div>
    <h3 className="text-xs font-semibold">Supporting sources</h3><div className="mt-3 flex flex-col gap-2">{row.sourceIds.map((id) => { const source = sources.find((item) => item.id === id); return <Link key={id} href={`/knowledge?tab=sources&source=${id}`} className="flex items-center justify-between rounded-2xl bg-[var(--surface-2)] p-3 text-xs">{source?.title ?? id}<ArrowRight className="size-3.5" /></Link>; })}</div>
    <p className="mt-4 text-xs leading-5">{row.coverage === "strong" && row.authority === "strong" ? "No immediate coverage action" : row.authority === "missing" ? "Authoritative policy needed" : "Review source freshness / scope"}</p>
  </article>)}</div>;
}

export function KnowledgeWorkspace() {
  const query = useQuery({ queryKey: ["knowledge-workspace"], queryFn: getKnowledgeWorkspace });
  const [tab, setTab] = useQueryState("tab", { defaultValue: "sources" });
  const [sourceId, setSourceId] = useQueryState("source", { defaultValue: "" });
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState("");
  const [freshness, setFreshness] = useState("");
  const [linked, setLinked] = useState(false);
  const [closed, setClosed] = useState(false);
  const [selectedGap, setSelectedGap] = useState("");
  const [selectedConflict, setSelectedConflict] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  if (query.isLoading || !query.data) return <LoadingState label="Loading knowledge health…" />;

  const { sources, gaps, conflicts, coverage } = query.data;
  const healthy = sources.filter((source) => source.status === "healthy").length;
  const stale = sources.filter((source) => source.status === "stale" || source.status === "aging").length;
  const missingOwners = sources.filter((source) => !source.owner || source.status === "missing_owner").length;
  const coverageRisk = coverage.filter((row) => row.coverage === "weak" || row.coverage === "missing" || row.authority === "missing").length;
  const ready = sources.filter((source) => source.authority === "authoritative" && source.status === "healthy" && daysOld(source.lastUpdatedAt) <= source.freshnessTargetDays).length;
  const needle = search.trim().toLowerCase();
  const visible = sources.filter((source) => (!needle || `${source.title} ${source.owner ?? ""} ${source.coverageTopics.join(" ")}`.toLowerCase().includes(needle)) && (!type || source.type === type) && (!owner || (owner === "unassigned" ? !source.owner : source.owner === owner)) && (!freshness || source.status === freshness) && (!linked || conflicts.some((conflict) => conflict.relatedIssueId && (conflict.sourceAId === source.id || conflict.sourceBId === source.id))));
  const source = closed ? undefined : sources.find((item) => item.id === sourceId) ?? (!sourceId ? visible[0] : undefined);
  const visibleGaps = gaps.filter((gap) => !needle || `${gap.topic} ${gap.exampleQuestion}`.toLowerCase().includes(needle));
  const gap = visibleGaps.find((item) => item.id === selectedGap) ?? visibleGaps[0];
  const visibleConflicts = conflicts.filter((item) => !needle || item.topic.toLowerCase().includes(needle));
  const conflict = visibleConflicts.find((item) => item.id === selectedConflict) ?? visibleConflicts[0];
  const visibleTopics = coverage.filter((item) => !needle || item.topic.toLowerCase().includes(needle));
  const topic = visibleTopics.find((item) => item.topic === selectedTopic) ?? visibleTopics[0];
  const pickSource = (id: string) => { setClosed(false); void setSourceId(id); };
  const activeFilters = [search, type, owner, freshness, linked].filter(Boolean).length;
  const row = (id: string, title: string, subtitle: string, value: string | number, selected: boolean, pick: () => void) => <button key={id} className={cn("si-reference-row", selected && "is-selected")} aria-pressed={selected} onClick={pick}><span className="si-mini-avatar"><FileSearch className="size-3.5" /></span><span className="si-row-copy"><strong>{title}</strong><span>{subtitle}</span></span><span className="si-row-value">{value}</span></button>;
  let master;
  let detail;
  if (tab === "sources") {
    master = <>{visible.map((item) => row(item.id, item.title, `${item.owner ?? "Missing owner"} · ${item.status.replace("_", " ")} · ${daysOld(item.lastUpdatedAt)}d`, item.retrievalCount30d, item.id === source?.id, () => pickSource(item.id)))}{!visible.length ? <div className="si-empty-inset">No sources match these filters.</div> : null}</>;
    detail = source ? <SourceInspector source={source} conflicts={conflicts} sources={sources} onClose={() => { setClosed(true); void setSourceId(null); }} /> : <div className="si-empty-inset">{sourceId ? "Knowledge source not found." : "Select a source to inspect provenance and freshness."}</div>;
  } else if (tab === "gaps") {
    master = visibleGaps.map((item) => row(item.id, item.topic, `${item.status} · ${item.suggestedOwner ?? "Unassigned"}`, item.conversationCount, item.id === gap?.id, () => setSelectedGap(item.id)));
    detail = gap ? <><div className="si-detail-header"><div><div className="si-label">Unanswered intent</div><h2>{gap.topic}</h2></div><Badge tone="warning">Knowledge gap</Badge></div><div className="si-detail-scroll"><GapsView gaps={[gap]} /></div><DetailBand metrics={[{label:"Conversations",value:gap.conversationCount},{label:"Trend",value:`+${gap.trendPercent}%`},{label:"Suggested owner",value:gap.suggestedOwner ?? "Unassigned"}]} /></> : <div className="si-empty-inset">No matching knowledge gaps.</div>;
  } else if (tab === "conflicts") {
    master = visibleConflicts.map((item) => row(item.id, item.topic, `${item.status} · claim disagreement`, item.affectedDraftCount, item.id === conflict?.id, () => setSelectedConflict(item.id)));
    detail = conflict ? <><div className="si-detail-header"><div><div className="si-label">Claim comparison</div><h2>{conflict.topic}</h2></div><Badge tone="danger">Source conflict</Badge></div><div className="si-detail-scroll"><ConflictCard key={conflict.id} conflict={conflict} sources={sources} /></div><DetailBand metrics={[{label:"Affected drafts",value:conflict.affectedDraftCount},{label:"Human reviews",value:conflict.humanReviewCount},{label:"Sources compared",value:2}]} /></> : <div className="si-empty-inset">No matching conflicts.</div>;
  } else if (tab === "coverage") {
    master = visibleTopics.map((item) => row(item.topic, item.topic, `${item.authority} authority · ${item.freshness}`, item.coverage, item.topic === topic?.topic, () => setSelectedTopic(item.topic)));
    detail = topic ? <><div className="si-detail-scroll"><CoverageView coverage={[topic]} sources={sources} /></div><DetailBand metrics={[{label:"Supporting sources",value:topic.sourceIds.length},{label:"Coverage",value:topic.coverage},{label:"Authority",value:topic.authority}]} /></> : <div className="si-empty-inset">No matching topics.</div>;
  } else {
    master = <div className="si-empty-inset">Choose a knowledge view.</div>;
    detail = <div className="si-empty-inset">Unknown knowledge view</div>;
  }

  return <div className="si-page">
    <RouteHeader title="Knowledge" note={<Badge>Knowledge workspace</Badge>} actions={<Button size="sm" onClick={() => toast.info("Article draft staged", {description:"Draft prepared for review. Publishing is not connected."})}>Create article</Button>} />
    <ReferenceSummary metrics={[{label:"Total sources",value:sources.length,note:"Content inventory"},{label:"Strong coverage",value:`${coverage.filter((item) => item.coverage === "strong").length}/${coverage.length}`,note:"Topics with strong source coverage"},{label:"Stale / needs review",value:stale,note:"Freshness rules"}]} activityLabel="Content freshness" activity={[{label:"Healthy",value:healthy,marker:"H"},{label:"Aging / stale",value:stale,marker:"R"},{label:"Missing owners",value:missingOwners,marker:"O"},{label:"Open gaps",value:gaps.filter((item) => item.status !== "resolved").length,marker:"G"}]} signal={{label:"Knowledge readiness",value:`${ready}/${sources.length}`,note:"authoritative & fresh",options:[{label:"Healthy",value:healthy},{label:"Review",value:stale},{label:"Conflicts",value:conflicts.filter((item) => item.status !== "resolved").length}],active:1}} />
    <FilterHinge count={activeFilters}>
      <select aria-label="Source category" value={type} disabled={tab !== "sources"} onChange={(event) => setType(event.target.value)}><option value="">All categories</option>{[...new Set(sources.map((item) => item.type))].map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Source owner" value={owner} disabled={tab !== "sources"} onChange={(event) => setOwner(event.target.value)}><option value="">All owners</option><option value="unassigned">Missing owner</option>{[...new Set(sources.flatMap((item) => item.owner ? [item.owner] : []))].map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Source freshness" value={freshness} disabled={tab !== "sources"} onChange={(event) => setFreshness(event.target.value)}><option value="">Any freshness</option>{Object.keys(statusTone).map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select>
      <button className="si-action-pill" aria-pressed={linked} disabled={tab !== "sources"} onClick={() => setLinked(!linked)}>Linked issues</button>
      <label className="si-inbox-search"><Search className="size-3.5" /><input aria-label="Search knowledge sources" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sources, owners, topics" /></label>
    </FilterHinge>
    <OperationalWorkspace detailKey={`${tab}:${tab === "sources" ? source?.id : tab === "gaps" ? gap?.id : tab === "conflicts" ? conflict?.id : topic?.topic}`} className="si-route-workspace" title={tab === "sources" ? "Knowledge documents" : tab === "gaps" ? "Knowledge gaps" : tab === "conflicts" ? "Conflicting sources" : "Topic coverage"} master={master} detail={detail} tabs={<WorkspaceTabs label="Knowledge workspace views" items={[{id:"sources",label:"Sources",count:sources.length},{id:"gaps",label:"Gaps",count:gaps.length},{id:"conflicts",label:"Conflicts",count:conflicts.length},{id:"coverage",label:"Coverage"}]} active={tab} onChange={(value) => { setClosed(false); void setTab(value); }} />} />
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--muted-foreground)]"><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3" />Authority is independent from semantic similarity</span><span className="inline-flex items-center gap-1"><AlertTriangle className="size-3" />Snapshot: 3 Oct 2026 · no live RAG telemetry</span><span className="inline-flex items-center gap-1"><Link2 className="size-3" />Risk views link to conversations and intelligence</span><span>{coverageRisk} topics need coverage review</span></div>
  </div>;
}
