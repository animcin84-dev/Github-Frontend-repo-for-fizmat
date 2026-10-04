"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  LockKeyhole,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Search,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DetailBand, FilterHinge, OperationalWorkspace, ReferenceSummary, RouteHeader, WorkspaceTabs } from "@/components/reference/reference-layout";
import { ConversationAnalysisPanel } from "@/components/inbox/conversation-analysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDialogFocus } from "@/components/ui/use-dialog-focus";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import type { ConversationDetail, ConversationListItem, ConversationPriority, PolicyDecision } from "@/lib/domain";
import { getConversationDetail, getConversationList, getInboxIntegrationStatus, sendConversationReply, syncInboxNow } from "@/lib/client/conversation-api";
import { cn } from "@/lib/utils";
import { resolveInboxConversationId } from "@/lib/conversation-selection";

const priorityTone: Record<ConversationPriority, "neutral" | "info" | "warning" | "danger"> = { untriaged: "neutral", low: "neutral", medium: "info", high: "warning", critical: "danger" };

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
  const [flags, setFlags] = useState({ ready: false, narrow: false, showQueues: true, showInspector: true });
  useEffect(() => {
    const update = () => setFlags({
      ready: true,
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

function FilterBar({ q, setQ, priority, setPriority, channel, setChannel, ai, setAi, sla, setSla }: { q: string; setQ: (value: string | null) => void; priority: string; setPriority: (value: string | null) => void; channel: string; setChannel: (value: string | null) => void; ai: string; setAi: (value: string | null) => void; sla: string; setSla: (value: string | null) => void }) {
  const activeCount = [q, priority, channel, ai, sla].filter(Boolean).length;
  return <FilterHinge count={activeCount}>{[
    ["priority", priority, setPriority, ["untriaged", "high", "critical"]],
    ["channel", channel, setChannel, ["email", "web", "telegram", "whatsapp"]],
    ["AI state", ai, setAi, ["needs_review", "human_only", "auto_eligible"]],
    ["SLA", sla, setSla, ["warning", "breach"]],
  ].map(([label, value, setter, options]) => <select key={String(label)} value={String(value)} onChange={(event) => (setter as (value: string | null) => void)(event.target.value || null)} aria-label={String(label)}><option value="">{String(label)}</option>{(options as string[]).map((option) => <option value={option} key={option}>{option.replaceAll("_", " ")}</option>)}</select>)}<div className="si-inbox-search"><Search size={13} aria-hidden="true"/><input aria-label="Search conversations" value={q} onChange={(event) => setQ(event.target.value || null)} placeholder="Search conversations" />{q ? <button onClick={() => setQ(null)} aria-label="Clear search"><X size={13} /></button> : null}</div></FilterHinge>;
}

function ConversationList({ items, selectedId, onSelect }: { items: ConversationListItem[]; selectedId: string; onSelect: (id: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual intentionally returns imperative helpers; React Compiler skips memoizing this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => 96, overscan: 12 });
  return <div ref={parentRef} className="si-conversation-list h-full overflow-auto scrollbar-gutter-stable"><div style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>{virtualizer.getVirtualItems().map((row) => {
    const item = items[row.index];
    const selected = item.id === selectedId;
    const real = item.source === "gmail" || item.source === "whatsapp";
    return <button key={item.id} data-index={row.index} ref={virtualizer.measureElement} onClick={() => onSelect(item.id)} className={cn("si-inbox-row absolute left-0 top-0 w-full text-left focus-visible:z-10", selected && "is-selected")} style={{ transform: `translateY(${row.start}px)` }}>
      <div className="flex items-start gap-2"><span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.unread ? "bg-[var(--accent)]" : "bg-transparent")} aria-label={item.unread ? "Unread" : undefined} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-xs font-semibold">{item.customer.name}</span>{real ? <Badge>{item.providerLabel}</Badge> : null}<span className="ml-auto shrink-0 text-[10px] text-[var(--muted-foreground)]">{formatDistanceToNowStrict(new Date(item.updatedAt), { addSuffix: true })}</span></div><div className="mt-0.5 truncate text-xs font-medium">{item.subject}</div><div className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{item.preview}</div><div className="mt-1.5 flex items-center gap-1.5">{real ? <><Badge tone={priorityTone[item.priority]}>{item.priority}</Badge><Badge>Analysis {item.analysisState}</Badge></> : <><Badge tone={priorityTone[item.priority]}>{item.priority}</Badge>{item.slaRisk !== "none" ? <Badge tone={item.slaRisk === "breach" ? "danger" : "warning"}>SLA {item.slaRisk}</Badge> : null}{item.aiState === "needs_review" ? <Badge tone="ai">Review</Badge> : item.aiState === "human_only" ? <Badge tone="danger">Human only</Badge> : null}</>}</div></div></div>
    </button>;
  })}</div></div>;
}

function ReadinessSummary({ detail }: { detail: ConversationDetail }) {
  const blocked = detail.policyDecisions.some((decision) => decision.decision === "blocked");
  const noEvidence = detail.evidence.length === 0;
  const stale = detail.evidence.some((source) => source.freshness === "stale");
  return <div className="grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2"><div className="text-[var(--muted-foreground)]">Knowledge coverage</div><div className={cn("mt-1 font-medium", noEvidence ? "text-[var(--danger)]" : stale ? "text-[var(--warning)]" : "text-[var(--success)]")}>{noEvidence ? "Missing" : stale ? "Needs review" : "Supported"}</div></div><div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2"><div className="text-[var(--muted-foreground)]">Action policy</div><div className={cn("mt-1 font-medium", blocked ? "text-[var(--danger)]" : "text-[var(--success)]")}>{blocked ? "Blocked / escalate" : "Allowed with current gate"}</div></div></div>;
}

function ThreadPanel({ detail, onOpenInspector }: { detail: ConversationDetail; onOpenInspector?: () => void }) {
  const real = detail.source === "gmail" || detail.source === "whatsapp";
  return <div className="si-thread flex h-full min-h-0 flex-col"><div className="si-thread-header flex h-[58px] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4"><div className="grid size-8 place-items-center rounded-full bg-[var(--surface-2)] text-xs font-semibold">{detail.customer.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-semibold">{detail.subject}</h2>{(detail.source === "gmail" || detail.source === "whatsapp") ? <Badge>{detail.providerLabel}</Badge> : null}<Badge tone={priorityTone[detail.priority]}>{detail.priority}</Badge></div><div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]"><span>{detail.customer.name}</span><span>·</span><span>{detail.customer.company ?? detail.customer.email ?? detail.customer.phone}</span><span>·</span><span>{real && detail.analysisState !== "completed" ? `Analysis ${detail.analysisState}` : detail.category}</span></div></div>{detail.policyDecisions[0] ? <Link aria-label="Open action preview" href={`/automation?tab=procedures&preview=${automationPreviewForDecision(detail.policyDecisions[0])}`} className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ChevronRight className="size-4" /></Link> : null}<Button variant="ghost" size="sm" aria-label="More conversation actions"><MoreHorizontal className="size-4" /></Button></div>
  <div className="min-h-0 flex-1 overflow-auto px-4 py-4"><div className="mx-auto max-w-3xl space-y-4">{real ? <div className="si-detail-grid"><div className="si-detail-tile"><span>Category</span><strong>{detail.category}</strong><span>{detail.analysisState === "completed" ? "Real triage" : "Analysis pending"}</span></div><div className="si-detail-tile"><span>Priority</span><strong className="capitalize">{detail.priority}</strong><span>{detail.analysis?.priorityReasons?.[0] ?? "Not assigned yet"}</span></div><div className="si-detail-tile"><span>Knowledge readiness</span><strong>Pending</strong><span>Evidence not generated</span></div></div> : <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="size-3.5 text-[var(--ai)]" />AI summary</div><p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{detail.summary}</p>{detail.triageSignals.length ? <div className="mt-3 flex flex-wrap gap-1.5">{detail.triageSignals.map((signal) => <Badge key={signal.label} tone={signal.kind === "risk" ? "warning" : signal.kind === "policy" ? "ai" : "neutral"}>{signal.label}</Badge>)}</div> : null}</div>}
  <div className="space-y-3">{detail.messages.map((message) => <div key={message.id} className={cn("flex", message.author === "agent" ? "justify-end" : "justify-start")}><div className={cn("max-w-[82%] rounded-lg border px-3 py-2.5 text-sm leading-6", message.author === "customer" && "border-[var(--border)] bg-[var(--surface-1)]", message.author === "agent" && "border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-1))]", message.author === "system" && "max-w-full border-dashed bg-[var(--surface-2)] text-xs text-[var(--muted-foreground)]", message.author === "ai" && "border-[color-mix(in_srgb,var(--ai)_30%,var(--border))] bg-[color-mix(in_srgb,var(--ai)_7%,var(--surface-1))]")}><div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{message.author === "customer" ? <UserRound className="size-3" /> : message.author === "agent" ? <MessageSquareText className="size-3" /> : message.author === "ai" ? <Bot className="size-3" /> : <FileText className="size-3" />}{message.author}<span className="font-normal normal-case tracking-normal">· {new Date(message.createdAt).toLocaleString()}</span></div>{(detail.source === "gmail" || detail.source === "whatsapp") ? <div className="mb-2 text-[10px] leading-4 text-[var(--muted-foreground)]">{message.from ? <>From {message.from}</> : null}{message.to?.length ? <> · To {message.to.join(", ")}</> : null}{message.providerMessageId ? <div className="font-mono">{detail.providerLabel} message {message.providerMessageId}</div> : null}</div> : null}<div className="whitespace-pre-wrap">{message.body}</div>{message.attachments?.length ? <div className="mt-2 flex flex-wrap gap-1">{message.attachments.map((attachment) => <Badge key={`${message.id}-${attachment.filename}`}>{attachment.filename} · {attachment.mimeType}</Badge>)}</div> : null}</div></div>)}</div>{real ? <ConversationAnalysisPanel detail={detail} /> : null}</div></div>
  <DetailBand metrics={[{label:"Messages",value:detail.messages.length},{label:"Provider",value:detail.providerLabel ?? "Demo"},{label:"Analysis",value:detail.analysisState ?? "Simulation"}]} action={onOpenInspector ? <Button variant="primary" size="sm" onClick={onOpenInspector}>{detail.replyMode === "gmail_real" ? "Reply" : detail.replyMode === "unavailable" ? "Details" : "AI & evidence"}<ChevronRight size={13} /></Button> : undefined} />
  </div>;
}

function EvidenceInspector({ detail, draftText, setDraftText, actionState, setActionState, reserveCloseButtonSpace = false }: { detail: ConversationDetail; draftText: string; setDraftText: (value: string) => void; actionState: string; setActionState: (value: string) => void; reserveCloseButtonSpace?: boolean }) {
  const blocked = detail.aiDraft?.state === "blocked" || detail.policyDecisions.some((decision) => decision.decision === "blocked");
  const [reviewingRealReply, setReviewingRealReply] = useState(false);
  const [realRequestId, setRealRequestId] = useState("");
  const [sendingRealReply, setSendingRealReply] = useState(false);
  const approve = () => { setActionState("sent"); toast.success("Reply approved and marked sent in mock state"); };
  const reject = () => { setActionState("rejected"); toast("Draft rejected", { description: "Stored as mock feedback for evaluation." }); };
  const escalate = () => { setActionState("escalated"); toast.warning("Escalated to human owner"); };

  if (detail.replyMode === "unavailable") {
    return <div className="p-4"><h3 className="text-sm font-semibold">WhatsApp conversation</h3><div className="mt-3 flex gap-2"><Badge>Analysis pending</Badge><Badge tone="warning">Replies unavailable</Badge></div><p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">Manual WhatsApp replies are not enabled yet. Incoming messages are stored in the unified Inbox.</p><p className="mt-3 text-xs text-[var(--muted-foreground)]">Customer: {detail.customer.phone}</p></div>;
  }

  if (detail.replyMode === "gmail_real") {
    const reviewRealReply = () => {
      if (!draftText.trim()) {
        toast.error("Write a reply before review");
        return;
      }
      if (!realRequestId) setRealRequestId(crypto.randomUUID());
      setReviewingRealReply(true);
    };
    const sendRealReply = async () => {
      if (!realRequestId || !draftText.trim()) return;
      setSendingRealReply(true);
      try {
        const result = await sendConversationReply(detail.id, { text: draftText, clientRequestId: realRequestId });
        if (result.status !== "sent") throw new Error("Gmail send is still pending");
        setActionState("sent");
        setReviewingRealReply(false);
        toast.success("Real Gmail reply sent", { description: "The provider confirmed a reply in the same Gmail thread. Reload to see the persisted outbound copy." });
      } catch (error) {
        setActionState("failed");
        toast.error("Send failed", { description: error instanceof Error ? error.message : "Gmail did not confirm the send. Retry keeps the same idempotency key." });
      } finally {
        setSendingRealReply(false);
      }
    };

    return <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]"><div className={cn("flex h-[58px] shrink-0 items-center justify-between border-b border-[var(--border)] px-3", reserveCloseButtonSpace && "pr-12")}><div><div className="text-xs font-semibold">Real Gmail reply</div><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">Explicit operator action · no AI auto-send</div></div><Badge tone="success">REAL</Badge></div>
      <div className="min-h-0 flex-1 overflow-auto p-3"><div className="space-y-3">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"><div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold">Provider provenance</div><Badge>{detail.providerLabel}</Badge></div><div className="mt-2 break-all font-mono text-[10px] text-[var(--muted-foreground)]">Integration {detail.integrationAccountId} · thread {detail.providerConversationId}</div></section>
        <section className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs font-semibold">Analysis boundary</div><div className="mt-3 grid gap-2 text-xs"><div className="flex items-center justify-between"><span>AI analysis</span><Badge tone={detail.analysisState === "completed" ? "success" : "warning"}>{detail.analysisState}</Badge></div><div className="flex items-center justify-between"><span>Knowledge evidence</span><Badge>Not generated</Badge></div><div className="flex items-center justify-between"><span>Automation</span><Badge>Not evaluated</Badge></div></div></section>
        <section className="rounded-lg border border-[var(--border)]"><div className="border-b border-[var(--border)] px-3 py-2"><div className="flex items-center gap-2 text-xs font-semibold"><Mail className="size-3.5" />Manual reply</div></div><div className="p-3">
          <textarea aria-label="Manual Gmail reply" value={draftText} onChange={(event) => { setDraftText(event.target.value); if (actionState === "failed") setActionState(""); }} disabled={actionState === "sent" || sendingRealReply} rows={9} placeholder="Write a deliberate human reply…" className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs leading-5 outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-60" />
          {actionState ? <div className="mt-2 text-[11px] font-medium text-[var(--muted-foreground)]">Send state: {actionState}</div> : null}
          {!reviewingRealReply ? <div className="mt-3"><Button variant="primary" size="sm" onClick={reviewRealReply} disabled={actionState === "sent" || sendingRealReply}><Send className="size-3.5" />Review real send</Button></div> : <div className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_5%,var(--surface-1))] p-3"><div className="text-xs font-semibold">Confirm real Gmail send</div><p className="mt-1 text-[11px] leading-5 text-[var(--muted-foreground)]">This will send a real email to <strong>{detail.customer.email}</strong> in Gmail thread <span className="font-mono">{detail.providerConversationId}</span>. Phase E actions remain simulations.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="primary" size="sm" onClick={sendRealReply} disabled={sendingRealReply}>{sendingRealReply ? "Sending…" : actionState === "failed" ? "Retry real send" : "Send real email"}</Button><Button size="sm" onClick={() => setReviewingRealReply(false)} disabled={sendingRealReply}>Back</Button></div></div>}
        </div></section>
      </div></div>
    </div>;
  }

  return <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]"><div className={cn("flex h-[58px] shrink-0 items-center justify-between border-b border-[var(--border)] px-3", reserveCloseButtonSpace && "pr-12")}><div><div className="flex items-center gap-1.5 text-xs font-semibold">AI & evidence <Badge>SIMULATION</Badge></div><div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">Deterministic fixture mode · measured readiness, not self-reported confidence</div></div><Badge tone={blocked ? "danger" : "success"}>{blocked ? "Needs human" : "Grounded"}</Badge></div>
  <div className="min-h-0 flex-1 overflow-auto p-3"><div className="space-y-3"><ReadinessSummary detail={detail} />
  <section className="rounded-lg border border-[var(--border)]"><div className="border-b border-[var(--border)] px-3 py-2"><div className="flex items-center gap-2 text-xs font-semibold"><FileText className="size-3.5" />Evidence <Badge>{detail.evidence.length}</Badge></div></div><div className="divide-y divide-[var(--border)]">{detail.evidence.length ? detail.evidence.map((source) => {
    const knowledgeSourceId = resolveKnowledgeSourceId(source);
    return <details key={source.id} className="group px-3 py-2"><summary className="flex cursor-pointer list-none items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{source.title}</div><div className="mt-1 flex gap-1"><Badge tone={source.authority === "authoritative" ? "success" : "neutral"}>{source.authority}</Badge><Badge tone={source.freshness === "fresh" ? "success" : source.freshness === "stale" ? "warning" : "neutral"}>{source.freshness}</Badge></div></div><ChevronRight className="mt-1 size-3.5 text-[var(--muted-foreground)] transition-transform group-open:rotate-90" /></summary><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{source.excerpt}</p>{knowledgeSourceId ? <Link href={`/knowledge?tab=sources&source=${knowledgeSourceId}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline">Open knowledge source <ChevronRight className="size-3" /></Link> : <div className="mt-2 text-[10px] text-[var(--muted-foreground)]">System evidence is not treated as a reusable knowledge source.</div>}</details>;
  }) : <div className="px-3 py-3 text-xs text-[var(--danger)]">No authoritative evidence found for this request.</div>}</div></section>
  {detail.policyDecisions.map((decision: PolicyDecision) => <section key={decision.action} className={cn("rounded-lg border p-3", decision.decision === "blocked" ? "border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]" : decision.decision === "human_approval" ? "border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)]" : "border-[color-mix(in_srgb,var(--success)_28%,var(--border))] bg-[color-mix(in_srgb,var(--success)_5%,transparent)]")}><div className="flex items-center gap-2 text-xs font-semibold">{decision.decision === "blocked" ? <LockKeyhole className="size-3.5 text-[var(--danger)]" /> : <CheckCircle2 className="size-3.5 text-[var(--success)]" />}{decision.action}</div><div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{decision.decision.replaceAll("_", " ")}</div><ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">{decision.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul><Link href={`/automation?tab=procedures&preview=${automationPreviewForDecision(decision)}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline">Open action preview <ChevronRight className="size-3" /></Link></section>)}
  <section className="rounded-lg border border-[color-mix(in_srgb,var(--ai)_25%,var(--border))] bg-[color-mix(in_srgb,var(--ai)_4%,var(--surface-1))]"><div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2"><div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="size-3.5 text-[var(--ai)]" />AI draft</div>{detail.aiDraft?.state === "needs_review" ? <Badge tone="warning">Needs review</Badge> : detail.aiDraft?.state === "blocked" ? <Badge tone="danger">Paused</Badge> : <Badge tone="success">Ready</Badge>}</div><div className="p-3">{detail.aiDraft?.unsupportedClaims.length ? <div className="mb-2 rounded-md border border-[color-mix(in_srgb,var(--danger)_32%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_7%,transparent)] p-2 text-xs text-[var(--danger)]"><div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-3.5" />Unsupported claim removed</div><div className="mt-1 text-[11px] leading-4">{detail.aiDraft.unsupportedClaims[0].reason}</div></div> : null}<textarea aria-label="AI draft reply" value={draftText} onChange={(event) => setDraftText(event.target.value)} disabled={blocked || actionState === "sent"} rows={7} className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs leading-5 outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-60" />{actionState ? <div className="mt-2 text-[11px] font-medium text-[var(--muted-foreground)]">Mock state: {actionState}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{blocked ? <Button variant="primary" size="sm" onClick={escalate}><UserRound className="size-3.5" />Escalate</Button> : <><Button variant="primary" size="sm" onClick={approve} disabled={actionState === "sent"}><Send className="size-3.5" />Approve & send</Button><Button size="sm" onClick={reject} disabled={actionState === "sent"}><X className="size-3.5" />Reject</Button><Button variant="ghost" size="sm" onClick={escalate}><UserRound className="size-3.5" />Escalate</Button></>}</div></div></section>
  </div></div></div>;
}

function ConversationWorkspace({ detail }: { detail: ConversationDetail }) {
  const [draftText, setDraftText] = useState(detail.aiDraft?.text ?? "");
  const [actionState, setActionState] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);
  const inspectorRef = useDialogFocus(inspectorOpen, closeInspector);
  const real = detail.source === "gmail" || detail.source === "whatsapp";
  return <div className="si-conversation-workspace relative h-full min-h-0">
    <ThreadPanel detail={detail} onOpenInspector={() => setInspectorOpen(true)} />
    {!real ? <details open className="si-mock-evidence"><summary>AI & evidence · simulation</summary><EvidenceInspector detail={detail} draftText={draftText} setDraftText={setDraftText} actionState={actionState} setActionState={setActionState} /></details> : null}
    {inspectorOpen ? <>
      <button aria-label="Close conversation inspector" onClick={() => setInspectorOpen(false)} className="fixed inset-0 z-40 bg-black/30" />
      <aside ref={inspectorRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={detail.replyMode === "gmail_real" ? "Gmail reply inspector" : detail.replyMode === "unavailable" ? "WhatsApp conversation details" : "AI and evidence inspector"} className="si-reply-sheet">
        <button onClick={() => setInspectorOpen(false)} aria-label="Close conversation inspector" className="absolute right-3 top-3 z-10 si-circle-control"><X size={14} /></button>
        <EvidenceInspector detail={detail} draftText={draftText} setDraftText={setDraftText} actionState={actionState} setActionState={setActionState} reserveCloseButtonSpace />
      </aside>
    </> : null}
  </div>;
}

function MobileConversationWorkspace({ detail, onBack }: { detail: ConversationDetail; onBack: () => void }) {
  const [draftText, setDraftText] = useState(detail.aiDraft?.text ?? "");
  const [actionState, setActionState] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const closeEvidence = useCallback(() => setEvidenceOpen(false), []);
  const evidenceRef = useDialogFocus(evidenceOpen, closeEvidence);

  return <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-2">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-3.5" />Inbox</Button>
      <Button size="sm" onClick={() => setEvidenceOpen(true)}>{detail.replyMode === "gmail_real" ? <><Send className="size-3.5" />Reply</> : detail.replyMode === "unavailable" ? <>Details</> : <><Sparkles className="size-3.5" />AI & evidence</>}</Button>
    </div>
    <div className="min-h-0 flex-1"><ThreadPanel detail={detail} /></div>
    {evidenceOpen ? <>
      <button aria-label="Close AI and evidence inspector" onClick={() => setEvidenceOpen(false)} className="fixed inset-0 top-12 z-40 bg-black/30" />
      <aside ref={evidenceRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={detail.replyMode === "gmail_real" ? "Gmail reply inspector" : detail.replyMode === "unavailable" ? "WhatsApp conversation details" : "AI and evidence inspector"} className="fixed inset-y-12 right-0 z-50 w-[min(94vw,420px)] border-l border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl">
        <button onClick={() => setEvidenceOpen(false)} aria-label="Close AI and evidence inspector" className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-md bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button>
        <EvidenceInspector detail={detail} draftText={draftText} setDraftText={setDraftText} actionState={actionState} setActionState={setActionState} reserveCloseButtonSpace />
      </aside>
    </> : null}
  </div>;
}

export function InboxWorkspace({ initialConversationId }: { initialConversationId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const flags = useViewportFlags();
  const [q, setQ] = useQueryState("q", { defaultValue: "" });
  const [priority, setPriority] = useQueryState("priority", { defaultValue: "" });
  const [channel, setChannel] = useQueryState("channel", { defaultValue: "" });
  const [ai, setAi] = useQueryState("ai", { defaultValue: "" });
  const [sla, setSla] = useQueryState("sla", { defaultValue: "" });
  const [queueView, setQueueView] = useState("all");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(initialConversationId));

  const listQuery = useQuery({ queryKey: ["conversations"], queryFn: getConversationList });
  const integrationQuery = useQuery({ queryKey: ["inbox-integration-status"], queryFn: getInboxIntegrationStatus });
  const resolvedSelectedId = useMemo(() => {
    if (!listQuery.isSuccess || !integrationQuery.isSuccess) return undefined;
    return resolveInboxConversationId(listQuery.data, initialConversationId, integrationQuery.data.mode);
  }, [initialConversationId, listQuery.data, listQuery.isSuccess, integrationQuery.data, integrationQuery.isSuccess]);
  const detailQuery = useQuery({
    queryKey: ["conversation", resolvedSelectedId],
    queryFn: () => getConversationDetail(resolvedSelectedId!),
    enabled: Boolean(resolvedSelectedId),
    refetchInterval: (query) => query.state.data?.analysis?.status === "running" || (query.state.data?.analysis?.status === "pending" && query.state.data.analysis.id) ? 3_000 : false,
  });
  const recoveredSelectedId = detailQuery.isSuccess && detailQuery.data === null
    ? resolveInboxConversationId(listQuery.data ?? [], undefined, integrationQuery.data?.mode ?? "mock")
    : resolvedSelectedId;

  const filtered = useMemo(() => {
    const items = listQuery.data ?? [];
    const needle = q.trim().toLowerCase();
    return items.filter((item) => (queueView !== "unread" || item.unread) && (!needle || `${item.customer.name} ${item.subject} ${item.preview}`.toLowerCase().includes(needle)) && (!priority || item.priority === priority) && (!channel || item.channel === channel) && (!ai || item.aiState === ai) && (!sla || item.slaRisk === sla));
  }, [listQuery.data, q, priority, channel, ai, sla, queueView]);

  const counts = useMemo(() => {
    const items = listQuery.data ?? [];
    return { all: items.length, unread: items.filter((item) => item.unread).length, sla: items.filter((item) => item.slaRisk !== "none").length, critical: items.filter((item) => item.priority === "critical").length };
  }, [listQuery.data]);

  useEffect(() => {
    if (!flags.ready || !listQuery.isSuccess || !integrationQuery.isSuccess || detailQuery.isError) return;
    // Keep the mobile list route open until the operator selects a conversation.
    if (flags.narrow && !initialConversationId) return;
    if (recoveredSelectedId === initialConversationId) return;
    const query = searchParams.toString();
    const path = recoveredSelectedId ? `/inbox/${recoveredSelectedId}` : "/inbox";
    router.replace(`${path}${query ? `?${query}` : ""}`, { scroll: false });
  }, [initialConversationId, recoveredSelectedId, listQuery.isSuccess, integrationQuery.isSuccess, detailQuery.isError, flags.ready, flags.narrow, router, searchParams]);


  const select = useCallback((id: string) => {
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
      const index = filtered.findIndex((item) => item.id === resolvedSelectedId);
      if (index < 0) return;
      const delta = event.key === "j" || event.key === "ArrowDown" ? 1 : -1;
      const next = filtered[Math.min(filtered.length - 1, Math.max(0, index + delta))];
      if (next) select(next.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, resolvedSelectedId, select]);

  if (listQuery.isError || integrationQuery.isError) {
    return <ErrorState detail={listQuery.error?.message ?? integrationQuery.error?.message ?? "Could not load inbox"} />;
  }
  if (listQuery.isLoading || integrationQuery.isLoading) return <LoadingState label="Loading inbox…" />;
  const detail = detailQuery.data;

  const listPane = <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-[48px] shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-3">
      <div><div className="flex items-center gap-1.5 text-xs font-semibold">Inbox <Badge tone={integrationQuery.data?.mode === "database" ? "success" : "neutral"}>{integrationQuery.data?.mode === "database" ? "REAL" : "MOCK"}</Badge></div><div className="text-[10px] text-[var(--muted-foreground)]">{filtered.length.toLocaleString()} of {counts.all.toLocaleString()}</div></div>
      <div className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><kbd className="rounded border px-1">J/K</kbd><span>next</span></div>
    </div>
    {filtered.length ? <div className="min-h-0 flex-1"><ConversationList items={filtered} selectedId={resolvedSelectedId ?? ""} onSelect={select} /></div> : integrationQuery.data?.mode === "database" && counts.all === 0 ? <div className="grid flex-1 place-items-center p-6 text-center"><div><Mail className="mx-auto size-5 text-[var(--muted-foreground)]" /><div className="mt-2 text-sm font-medium">No Gmail conversations synced yet.</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">This real inbox is empty; it does not fall back to deterministic fixtures.</div><Button className="mt-3" size="sm" onClick={async () => { try { const result = await syncInboxNow(); toast.success("Gmail sync complete", { description: `${result.messagesInserted} imported · ${result.messagesSkipped} duplicates skipped` }); await queryClient.invalidateQueries({ queryKey: ["conversations"] }); await queryClient.invalidateQueries({ queryKey: ["inbox-integration-status"] }); } catch (error) { toast.error(error instanceof Error ? error.message : "Sync failed"); } }}><Mail className="size-3.5" />Sync now</Button></div></div> : <div className="grid flex-1 place-items-center p-6 text-center"><div><Search className="mx-auto size-5 text-[var(--muted-foreground)]" /><div className="mt-2 text-sm font-medium">No conversations match</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Clear one or more URL-backed filters.</div></div></div>}
  </div>;

  if (flags.narrow) {
    const closeMobileDetail = () => {
      setMobileDetailOpen(false);
      const query = searchParams.toString();
      router.replace(`/inbox${query ? `?${query}` : ""}`, { scroll: false });
    };
    if (mobileDetailOpen && detailQuery.isError) return <div className="flex h-[calc(100dvh-48px)] flex-col">
      <div className="border-b border-[var(--border)] p-2"><Button variant="ghost" size="sm" onClick={closeMobileDetail}><ArrowLeft className="size-3.5" />Inbox</Button></div>
      <ErrorState detail={detailQuery.error.message} />
    </div>;
    return <div className="h-[calc(100dvh-60px)] min-w-0 overflow-hidden">
      {mobileDetailOpen && detail ? <MobileConversationWorkspace key={detail.id} detail={detail} onBack={closeMobileDetail} /> : <div className="flex h-full flex-col"><RouteHeader title="Inbox" note={<Badge>{integrationQuery.data?.mode === "database" ? "Database" : "Demo"}</Badge>} /><FilterBar q={q} setQ={setQ} priority={priority} setPriority={setPriority} channel={channel} setChannel={setChannel} ai={ai} setAi={setAi} sla={sla} setSla={setSla} /><div className="si-mobile-inbox-list min-h-0 flex-1">{listPane}</div></div>}
    </div>;
  }
  const items = listQuery.data ?? [];
  const real = integrationQuery.data?.mode === "database";
  const channelCounts = [{label:"Gmail",value:items.filter((item) => item.source === "gmail").length},{label:"WhatsApp",value:items.filter((item) => item.source === "whatsapp").length},{label:real ? "Other" : "Demo",value:items.filter((item) => item.source !== "gmail" && item.source !== "whatsapp").length}];
  const summary = <ReferenceSummary metrics={[{label:"Total open",value:items.filter((item) => item.status !== "resolved").length.toLocaleString()},{label:"Unread",value:counts.unread.toLocaleString()},{label:"Needs review",value:items.filter((item) => item.aiState === "needs_review" || item.priority === "untriaged").length.toLocaleString()}]} activity={channelCounts.map((item) => ({...item,marker:item.label.slice(0,1)}))} activityLabel="Stored conversations by provider" signal={{label:"Channels · stored conversations",value:counts.all.toLocaleString(),note:real ? "Database" : "Demo",options:channelCounts,active:channel === "whatsapp" ? 1 : 0,action:<Button size="sm" onClick={async () => { try { const result = await syncInboxNow(); toast.success("Gmail sync complete", {description:`${result.messagesInserted} imported · ${result.messagesSkipped} duplicates skipped`}); await Promise.all([queryClient.invalidateQueries({queryKey:["conversations"]}),queryClient.invalidateQueries({queryKey:["conversation"]}),queryClient.invalidateQueries({queryKey:["inbox-integration-status"]})]); } catch(error) { toast.error(error instanceof Error ? error.message : "Sync failed"); } }} disabled={!real || !integrationQuery.data?.connected}>Sync now</Button>}} />;
  const workspaceDetail = detail ? <ConversationWorkspace key={detail.id} detail={detail} /> : real && counts.all === 0 ? <div className="si-empty-inset"><Mail className="mx-auto mb-3" size={20} /><h2>No Gmail conversation selected</h2><p>Run a sync after connecting the dedicated support mailbox.</p></div> : detailQuery.isError ? <ErrorState detail={detailQuery.error.message} /> : <LoadingState label="Loading conversation detail…" />;
  return <div className="si-page si-inbox-page"><RouteHeader title="Inbox" note={<Badge tone={real ? "info" : "neutral"}>{real ? "Database workspace" : "Demo workspace"}</Badge>} />{summary}<FilterBar q={q} setQ={setQ} priority={priority} setPriority={setPriority} channel={channel} setChannel={setChannel} ai={ai} setAi={setAi} sla={sla} setSla={setSla} /><OperationalWorkspace className="si-inbox-workspace" master={listPane} detail={workspaceDetail} tabs={<WorkspaceTabs items={[{id:"all",label:"All",count:counts.all},{id:"unread",label:"Unread",count:counts.unread},{id:"critical",label:"Critical",count:counts.critical}]} active={queueView} onChange={(id) => {setQueueView(id);setPriority(id === "critical" ? "critical" : null);}} />} /></div>;
}
