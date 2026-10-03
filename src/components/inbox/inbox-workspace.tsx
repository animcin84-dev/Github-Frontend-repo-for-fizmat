"use client";

import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  Inbox,
  LockKeyhole,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-state";
import type { ConversationDetail, ConversationListItem, PolicyDecision, Priority } from "@/lib/domain";
import { getConversationDetail, getConversationList } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";

const priorityTone: Record<Priority, "neutral" | "info" | "warning" | "danger"> = { low: "neutral", medium: "info", high: "warning", critical: "danger" };

const knowledgeSourceForEvidence: Record<string, string> = {
  "ev-payment-policy": "ks-payment-auth",
  "ev-subscription-legacy": "ks-subscription-legacy",
};

function resolveKnowledgeSourceId(source: ConversationDetail["evidence"][number]) {
  if (knowledgeSourceForEvidence[source.id]) return knowledgeSourceForEvidence[source.id];
  if (source.title === "Delivery operations guide") return "ks-delivery-guide";
  if (source.title === "Customer operations handbook") return "ks-customer-handbook";
  return null;
}

function automationPreviewForDecision(decision: PolicyDecision) {
  const action = decision.action.toLowerCase();
  if (action.includes("refund")) return "refund";
  if (action.includes("address")) return "addressChange";
  if (action.includes("email") || action.includes("security") || action.includes("credential")) return "security";
  return decision.decision === "human_approval" ? "refund" : decision.decision === "blocked" ? "security" : "safeReadOnly";
}



function useViewportFlags() {
  const [flags, setFlags] = useState({ narrow: false, showQueues: true, showInspector: true });
  useEffect(() => {
    const update = () => setFlags({
      narrow: window.innerWidth < 768,
      showQueues: window.innerWidth >= 1120,
      showInspector: window.innerWidth >= 1360,
    });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return flags;
}

function QueueRail({ counts, setPriority, setSla }: { counts: { all: number; unread: number; sla: number; critical: number }; setPriority: (value: string | null) => void; setSla: (value: string | null) => void }) {
  const rows = [
    { label: "All conversations", count: counts.all, icon: Inbox, action: () => { setPriority(null); setSla(null); } },
    { label: "Unread", count: counts.unread, icon: Mail, action: () => { setPriority(null); setSla(null); } },
    { label: "SLA risk", count: counts.sla, icon: Clock3, action: () => setSla("warning") },
    { label: "Critical", count: counts.critical, icon: ShieldAlert, action: () => setPriority("critical") },
  ];
  return <div className="flex h-full flex-col bg-[var(--sidebar)]"><div className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-foreground)]">Queues</div><div className="space-y-0.5 px-2">{rows.map(({ label, count, icon: Icon, action }) => <button key={label} onClick={action} className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><Icon className="size-3.5 text-[var(--muted-foreground)]" /><span className="min-w-0 flex-1 truncate">{label}</span><span className="text-[11px] text-[var(--muted-foreground)]">{count}</span></button>)}</div><div className="mt-4 px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-foreground)]">AI views</div><div className="space-y-0.5 px-2"><button className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-[var(--surface-2)]"><Sparkles className="size-3.5 text-[var(--ai)]" />Needs review</button><button className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-[var(--surface-2)]"><LockKeyhole className="size-3.5 text-[var(--danger)]" />Human only</button></div></div>;
}

function FilterBar({ q, setQ, priority, setPriority, channel, setChannel, ai, setAi, sla, setSla }: { q: string; setQ: (value: string | null) => void; priority: string; setPriority: (value: string | null) => void; channel: string; setChannel: (value: string | null) => void; ai: string; setAi: (value: string | null) => void; sla: string; setSla: (value: string | null) => void }) {
  const activeCount = [priority, channel, ai, sla].filter(Boolean).length;
  return <div className="border-b border-[var(--border)] bg-[var(--surface-1)]"><div className="flex h-11 items-center gap-2 px-3"><div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2"><Search className="size-3.5 text-[var(--muted-foreground)]" /><input value={q} onChange={(event) => setQ(event.target.value || null)} placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />{q ? <button onClick={() => setQ(null)} aria-label="Clear search"><X className="size-3.5 text-[var(--muted-foreground)]" /></button> : null}</div><Badge tone={activeCount ? "info" : "neutral"}><Filter className="size-3" />{activeCount || "Filters"}</Badge></div><div className="flex gap-1 overflow-x-auto px-3 pb-2">{[
    ["priority", priority, setPriority, ["high", "critical"]],
    ["channel", channel, setChannel, ["email", "web", "telegram", "whatsapp"]],
    ["AI state", ai, setAi, ["needs_review", "human_only", "auto_eligible"]],
    ["SLA", sla, setSla, ["warning", "breach"]],
  ].map(([label, value, setter, options]) => <select key={String(label)} value={String(value)} onChange={(event) => (setter as (value: string | null) => void)(event.target.value || null)} aria-label={String(label)} className="h-7 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-[11px] text-[var(--muted-foreground)] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"><option value="">{String(label)}</option>{(options as string[]).map((option) => <option value={option} key={option}>{option.replaceAll("_", " ")}</option>)}</select>)}</div></div>;
}

function ConversationList({ items, selectedId, onSelect }: { items: ConversationListItem[]; selectedId: string; onSelect: (id: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual intentionally returns imperative helpers; React Compiler skips memoizing this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => 76, overscan: 12 });
  return <div ref={parentRef} className="h-full overflow-auto bg-[var(--surface-1)] scrollbar-gutter-stable"><div style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>{virtualizer.getVirtualItems().map((row) => {
    const item = items[row.index];
    const selected = item.id === selectedId;
    return <button key={item.id} data-index={row.index} ref={virtualizer.measureElement} onClick={() => onSelect(item.id)} className={cn("absolute left-0 top-0 w-full border-b border-[var(--border)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]", selected && "bg-[var(--surface-2)]")} style={{ transform: `translateY(${row.start}px)` }}>
      <div className="flex items-start gap-2"><span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.unread ? "bg-[var(--accent)]" : "bg-transparent")} aria-label={item.unread ? "Unread" : undefined} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-xs font-semibold">{item.customer.name}</span><span className="ml-auto shrink-0 text-[10px] text-[var(--muted-foreground)]">{formatDistanceToNowStrict(new Date(item.updatedAt), { addSuffix: true })}</span></div><div className="mt-0.5 truncate text-xs font-medium">{item.subject}</div><div className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{item.preview}</div><div className="mt-1.5 flex items-center gap-1.5"><Badge tone={priorityTone[item.priority]}>{item.priority}</Badge>{item.slaRisk !== "none" ? <Badge tone={item.slaRisk === "breach" ? "danger" : "warning"}>SLA {item.slaRisk}</Badge> : null}{item.aiState === "needs_review" ? <Badge tone="ai">Review</Badge> : item.aiState === "human_only" ? <Badge tone="danger">Human only</Badge> : null}</div></div></div>
    </button>;
  })}</div></div>;
}

function ReadinessSummary({ detail }: { detail: ConversationDetail }) {
  const blocked = detail.policyDecisions.some((decision) => decision.decision === "blocked");
  const noEvidence = detail.evidence.length === 0;
  const stale = detail.evidence.some((source) => source.freshness === "stale");
  return <div className="grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2"><div className="text-[var(--muted-foreground)]">Knowledge coverage</div><div className={cn("mt-1 font-medium", noEvidence ? "text-[var(--danger)]" : stale ? "text-[var(--warning)]" : "text-[var(--success)]")}>{noEvidence ? "Missing" : stale ? "Needs review" : "Supported"}</div></div><div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2"><div className="text-[var(--muted-foreground)]">Action policy</div><div className={cn("mt-1 font-medium", blocked ? "text-[var(--danger)]" : "text-[var(--success)]")}>{blocked ? "Blocked / escalate" : "Allowed with current gate"}</div></div></div>;
}

function ThreadPanel({ detail }: { detail: ConversationDetail }) {
  return <div className="flex h-full min-h-0 flex-col bg-[var(--background)]"><div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4"><div className="grid size-8 place-items-center rounded-full bg-[var(--surface-2)] text-xs font-semibold">{detail.customer.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-semibold">{detail.subject}</h2><Badge tone={priorityTone[detail.priority]}>{detail.priority}</Badge></div><div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]"><span>{detail.customer.name}</span><span>·</span><span>{detail.customer.company ?? detail.customer.email}</span><span>·</span><span>{detail.category}</span></div></div>{detail.policyDecisions[0] ? <Link aria-label="Open action preview" href={`/automation?tab=procedures&preview=${automationPreviewForDecision(detail.policyDecisions[0])}`} className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ChevronRight className="size-4" /></Link> : null}<Button variant="ghost" size="sm" aria-label="More conversation actions"><MoreHorizontal className="size-4" /></Button></div>
  <div className="min-h-0 flex-1 overflow-auto px-4 py-4"><div className="mx-auto max-w-3xl space-y-4"><div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="size-3.5 text-[var(--ai)]" />AI summary</div><p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{detail.summary}</p>{detail.triageSignals.length ? <div className="mt-3 flex flex-wrap gap-1.5">{detail.triageSignals.map((signal) => <Badge key={signal.label} tone={signal.kind === "risk" ? "warning" : signal.kind === "policy" ? "ai" : "neutral"}>{signal.label}</Badge>)}</div> : null}</div>
  <div className="space-y-3">{detail.messages.map((message) => <div key={message.id} className={cn("flex", message.author === "agent" ? "justify-end" : "justify-start")}><div className={cn("max-w-[78%] rounded-lg border px-3 py-2.5 text-sm leading-6", message.author === "customer" && "border-[var(--border)] bg-[var(--surface-1)]", message.author === "agent" && "border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-1))]", message.author === "system" && "max-w-full border-dashed bg-[var(--surface-2)] text-xs text-[var(--muted-foreground)]", message.author === "ai" && "border-[color-mix(in_srgb,var(--ai)_30%,var(--border))] bg-[color-mix(in_srgb,var(--ai)_7%,var(--surface-1))]")}><div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{message.author === "customer" ? <UserRound className="size-3" /> : message.author === "agent" ? <MessageSquareText className="size-3" /> : message.author === "ai" ? <Bot className="size-3" /> : <FileText className="size-3" />}{message.author}</div>{message.body}</div></div>)}</div></div></div>
  </div>;
}

function EvidenceInspector({ detail, draftText, setDraftText, actionState, setActionState }: { detail: ConversationDetail; draftText: string; setDraftText: (value: string) => void; actionState: string; setActionState: (value: string) => void }) {
  const blocked = detail.aiDraft?.state === "blocked" || detail.policyDecisions.some((decision) => decision.decision === "blocked");
  const approve = () => { setActionState("sent"); toast.success("Reply approved and marked sent in mock state"); };
  const reject = () => { setActionState("rejected"); toast("Draft rejected", { description: "Stored as mock feedback for evaluation." }); };
  const escalate = () => { setActionState("escalated"); toast.warning("Escalated to human owner"); };
  return <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]"><div className="flex h-[58px] shrink-0 items-center justify-between border-b border-[var(--border)] px-3"><div><div className="text-xs font-semibold">AI & evidence</div><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">Measured readiness, not self-reported confidence</div></div><Badge tone={blocked ? "danger" : "success"}>{blocked ? "Needs human" : "Grounded"}</Badge></div>
  <div className="min-h-0 flex-1 overflow-auto p-3"><div className="space-y-3"><ReadinessSummary detail={detail} />
  <section className="rounded-lg border border-[var(--border)]"><div className="border-b border-[var(--border)] px-3 py-2"><div className="flex items-center gap-2 text-xs font-semibold"><FileText className="size-3.5" />Evidence <Badge>{detail.evidence.length}</Badge></div></div><div className="divide-y divide-[var(--border)]">{detail.evidence.length ? detail.evidence.map((source) => {
    const knowledgeSourceId = resolveKnowledgeSourceId(source);
    return <details key={source.id} className="group px-3 py-2"><summary className="flex cursor-pointer list-none items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{source.title}</div><div className="mt-1 flex gap-1"><Badge tone={source.authority === "authoritative" ? "success" : "neutral"}>{source.authority}</Badge><Badge tone={source.freshness === "fresh" ? "success" : source.freshness === "stale" ? "warning" : "neutral"}>{source.freshness}</Badge></div></div><ChevronRight className="mt-1 size-3.5 text-[var(--muted-foreground)] transition-transform group-open:rotate-90" /></summary><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{source.excerpt}</p>{knowledgeSourceId ? <Link href={`/knowledge?tab=sources&source=${knowledgeSourceId}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline">Open knowledge source <ChevronRight className="size-3" /></Link> : <div className="mt-2 text-[10px] text-[var(--muted-foreground)]">System evidence is not treated as a reusable knowledge source.</div>}</details>;
  }) : <div className="px-3 py-3 text-xs text-[var(--danger)]">No authoritative evidence found for this request.</div>}</div></section>
  {detail.policyDecisions.map((decision: PolicyDecision) => <section key={decision.action} className={cn("rounded-lg border p-3", decision.decision === "blocked" ? "border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]" : decision.decision === "human_approval" ? "border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)]" : "border-[color-mix(in_srgb,var(--success)_28%,var(--border))] bg-[color-mix(in_srgb,var(--success)_5%,transparent)]")}><div className="flex items-center gap-2 text-xs font-semibold">{decision.decision === "blocked" ? <LockKeyhole className="size-3.5 text-[var(--danger)]" /> : <CheckCircle2 className="size-3.5 text-[var(--success)]" />}{decision.action}</div><div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{decision.decision.replaceAll("_", " ")}</div><ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">{decision.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul><Link href={`/automation?tab=procedures&preview=${automationPreviewForDecision(decision)}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline">Open action preview <ChevronRight className="size-3" /></Link></section>)}
  <section className="rounded-lg border border-[color-mix(in_srgb,var(--ai)_25%,var(--border))] bg-[color-mix(in_srgb,var(--ai)_4%,var(--surface-1))]"><div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2"><div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="size-3.5 text-[var(--ai)]" />AI draft</div>{detail.aiDraft?.state === "needs_review" ? <Badge tone="warning">Needs review</Badge> : detail.aiDraft?.state === "blocked" ? <Badge tone="danger">Paused</Badge> : <Badge tone="success">Ready</Badge>}</div><div className="p-3">{detail.aiDraft?.unsupportedClaims.length ? <div className="mb-2 rounded-md border border-[color-mix(in_srgb,var(--danger)_32%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_7%,transparent)] p-2 text-xs text-[var(--danger)]"><div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-3.5" />Unsupported claim removed</div><div className="mt-1 text-[11px] leading-4">{detail.aiDraft.unsupportedClaims[0].reason}</div></div> : null}<textarea aria-label="AI draft reply" value={draftText} onChange={(event) => setDraftText(event.target.value)} disabled={blocked || actionState === "sent"} rows={7} className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs leading-5 outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-60" />{actionState ? <div className="mt-2 text-[11px] font-medium text-[var(--muted-foreground)]">Mock state: {actionState}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{blocked ? <Button variant="primary" size="sm" onClick={escalate}><UserRound className="size-3.5" />Escalate</Button> : <><Button variant="primary" size="sm" onClick={approve} disabled={actionState === "sent"}><Send className="size-3.5" />Approve & send</Button><Button size="sm" onClick={reject} disabled={actionState === "sent"}><X className="size-3.5" />Reject</Button><Button variant="ghost" size="sm" onClick={escalate}><UserRound className="size-3.5" />Escalate</Button></>}</div></div></section>
  </div></div></div>;
}

function ConversationWorkspace({ detail, showInspector }: { detail: ConversationDetail; showInspector: boolean }) {
  const [draftText, setDraftText] = useState(detail.aiDraft?.text ?? "");
  const [actionState, setActionState] = useState("");

  return <Group orientation="horizontal" className="h-full">
    <Panel id="thread" minSize="420px"><ThreadPanel detail={detail} /></Panel>
    {showInspector ? <>
      <Separator className="w-1 bg-[var(--border)] transition-colors hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)]" />
      <Panel id="inspector" defaultSize="390px" minSize="340px" maxSize="460px" groupResizeBehavior="preserve-pixel-size">
        <EvidenceInspector detail={detail} draftText={draftText} setDraftText={setDraftText} actionState={actionState} setActionState={setActionState} />
      </Panel>
    </> : null}
  </Group>;
}

function MobileConversationWorkspace({ detail, onBack }: { detail: ConversationDetail; onBack: () => void }) {
  const [draftText, setDraftText] = useState(detail.aiDraft?.text ?? "");
  const [actionState, setActionState] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  return <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-2">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-3.5" />Inbox</Button>
      <Button size="sm" onClick={() => setEvidenceOpen(true)}><Sparkles className="size-3.5" />AI & evidence</Button>
    </div>
    <div className="min-h-0 flex-1"><ThreadPanel detail={detail} /></div>
    {evidenceOpen ? <>
      <button aria-label="Close AI and evidence inspector" onClick={() => setEvidenceOpen(false)} className="fixed inset-0 top-12 z-40 bg-black/30" />
      <aside role="dialog" aria-modal="true" aria-label="AI and evidence inspector" className="fixed inset-y-12 right-0 z-50 w-[min(94vw,420px)] border-l border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl">
        <button onClick={() => setEvidenceOpen(false)} aria-label="Close AI and evidence inspector" className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-md bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button>
        <EvidenceInspector detail={detail} draftText={draftText} setDraftText={setDraftText} actionState={actionState} setActionState={setActionState} />
      </aside>
    </> : null}
  </div>;
}

export function InboxWorkspace({ initialConversationId }: { initialConversationId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const flags = useViewportFlags();
  const [q, setQ] = useQueryState("q", { defaultValue: "" });
  const [priority, setPriority] = useQueryState("priority", { defaultValue: "" });
  const [channel, setChannel] = useQueryState("channel", { defaultValue: "" });
  const [ai, setAi] = useQueryState("ai", { defaultValue: "" });
  const [sla, setSla] = useQueryState("sla", { defaultValue: "" });
  const [selectedId, setSelectedId] = useState(initialConversationId ?? "conv-00001");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(initialConversationId));

  const listQuery = useQuery({ queryKey: ["conversations"], queryFn: getConversationList });
  const detailQuery = useQuery({ queryKey: ["conversation", selectedId], queryFn: () => getConversationDetail(selectedId) });

  const filtered = useMemo(() => {
    const items = listQuery.data ?? [];
    const needle = q.trim().toLowerCase();
    return items.filter((item) => (!needle || `${item.customer.name} ${item.subject} ${item.preview}`.toLowerCase().includes(needle)) && (!priority || item.priority === priority) && (!channel || item.channel === channel) && (!ai || item.aiState === ai) && (!sla || item.slaRisk === sla));
  }, [listQuery.data, q, priority, channel, ai, sla]);

  const counts = useMemo(() => {
    const items = listQuery.data ?? [];
    return { all: items.length, unread: items.filter((item) => item.unread).length, sla: items.filter((item) => item.slaRisk !== "none").length, critical: items.filter((item) => item.priority === "critical").length };
  }, [listQuery.data]);


  const select = useCallback((id: string) => {
    setSelectedId(id);
    if (flags.narrow) setMobileDetailOpen(true);
    const query = searchParams.toString();
    router.replace(`/inbox/${id}${query ? `?${query}` : ""}`, { scroll: false });
  }, [flags.narrow, router, searchParams]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!["j", "k", "ArrowDown", "ArrowUp"].includes(event.key)) return;
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !event.altKey) return;
      event.preventDefault();
      const index = filtered.findIndex((item) => item.id === selectedId);
      if (index < 0) return;
      const delta = event.key === "j" || event.key === "ArrowDown" ? 1 : -1;
      const next = filtered[Math.min(filtered.length - 1, Math.max(0, index + delta))];
      if (next) select(next.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, selectedId, select]);

  if (listQuery.isLoading) return <LoadingState label="Loading 5,200-conversation mock queue…" />;
  const detail = detailQuery.data;

  const listPane = <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-[48px] shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-3">
      <div><div className="text-xs font-semibold">Inbox</div><div className="text-[10px] text-[var(--muted-foreground)]">{filtered.length.toLocaleString()} of {counts.all.toLocaleString()}</div></div>
      <div className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><kbd className="rounded border px-1">J/K</kbd><span>next</span></div>
    </div>
    <FilterBar q={q} setQ={setQ} priority={priority} setPriority={setPriority} channel={channel} setChannel={setChannel} ai={ai} setAi={setAi} sla={sla} setSla={setSla} />
    {filtered.length ? <div className="min-h-0 flex-1"><ConversationList items={filtered} selectedId={selectedId} onSelect={select} /></div> : <div className="grid flex-1 place-items-center p-6 text-center"><div><Search className="mx-auto size-5 text-[var(--muted-foreground)]" /><div className="mt-2 text-sm font-medium">No conversations match</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Clear one or more URL-backed filters.</div></div></div>}
  </div>;

  if (flags.narrow) {
    const closeMobileDetail = () => {
      setMobileDetailOpen(false);
      const query = searchParams.toString();
      router.replace(`/inbox${query ? `?${query}` : ""}`, { scroll: false });
    };
    return <div className="h-[calc(100dvh-48px)] min-w-0 overflow-hidden border-t-0 border-[var(--border)]">
      {mobileDetailOpen && detail ? <MobileConversationWorkspace key={detail.id} detail={detail} onBack={closeMobileDetail} /> : listPane}
    </div>;
  }

  return <div className="h-[calc(100dvh-48px)] min-w-0 overflow-hidden border-t-0 border-[var(--border)]"><Group orientation="horizontal" className="h-full">
    {flags.showQueues ? <><Panel id="queues" defaultSize="196px" minSize="160px" maxSize="240px" groupResizeBehavior="preserve-pixel-size"><QueueRail counts={counts} setPriority={setPriority} setSla={setSla} /></Panel><Separator className="w-1 bg-[var(--border)] transition-colors hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)]" /></> : null}
    <Panel id="list" defaultSize="350px" minSize="300px" maxSize="430px" groupResizeBehavior="preserve-pixel-size">{listPane}</Panel>
    <Separator className="w-1 bg-[var(--border)] transition-colors hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)]" />
    <Panel id="workspace" minSize="420px"><div className="h-full">{detail ? <ConversationWorkspace key={detail.id} detail={detail} showInspector={flags.showInspector} /> : <LoadingState label="Loading conversation detail…" />}</div></Panel>
  </Group></div>;
}
