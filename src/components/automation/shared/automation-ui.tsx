"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { ApprovalRequest, AutomationAuditEvent, PolicyDecision, ReadinessExplanation } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function CompactStat({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const valueClass =
    tone === "success" ? "text-[var(--success)]" :
    tone === "warning" ? "text-[var(--warning)]" :
    tone === "danger" ? "text-[var(--danger)]" : "";
  return (
    <div className="min-w-0 border-r border-[var(--border)] px-3 last:border-r-0">
      <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", valueClass)}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{note}</div>
    </div>
  );
}

export function DecisionBadge({ decision }: { decision: PolicyDecision["decision"] }) {
  const tone = decision === "allowed" ? "success" : decision === "blocked" ? "danger" : "warning";
  const label =
    decision === "confirm_customer" ? "customer confirmation" :
    decision === "human_approval" ? "human approval" : decision;
  return <Badge tone={tone}>{label}</Badge>;
}

export function StateMark({ state, children }: { state: "pass" | "warning" | "block"; children: ReactNode }) {
  const Icon = state === "pass" ? CheckCircle2 : state === "block" ? CircleSlash2 : AlertTriangle;
  const tone = state === "pass" ? "text-[var(--success)]" : state === "block" ? "text-[var(--danger)]" : "text-[var(--warning)]";
  return <div className="flex items-start gap-2 text-xs"><Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} /><div>{children}</div></div>;
}

export function ReadinessInspector({ explanation, onClose }: { explanation: ReadinessExplanation; onClose: () => void }) {
  return (
    <aside
      aria-label="Automation readiness details"
      className="fixed inset-y-12 right-0 z-50 w-[min(96vw,430px)] overflow-auto border-l border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl xl:sticky xl:top-12 xl:z-auto xl:h-[calc(100dvh-68px)] xl:w-auto xl:shadow-none"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Why this intent is / is not eligible</div>
          <h2 className="mt-1 text-sm font-semibold">{explanation.intent}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={explanation.currentMode === "controlled_automation" ? "success" : explanation.currentMode === "human_only" ? "danger" : "warning"}>{explanation.currentMode.replaceAll("_", " ")}</Badge>
            <Badge>{explanation.rolloutPercent}% rollout</Badge>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close readiness inspector" className="grid size-7 place-items-center rounded-md hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button>
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Last decision</div>
          <div className="mt-1 font-semibold">{explanation.lastDecision}</div>
        </div>
        <div className="space-y-3">
          {explanation.dimensions.map((dimension) => (
            <div key={dimension.label} className="rounded-md border border-[var(--border)] p-3">
              <StateMark state={dimension.state}>
                <div className="font-semibold">{dimension.label}</div>
                <div className="mt-0.5 leading-5 text-[var(--muted-foreground)]">{dimension.detail}</div>
                {dimension.href ? <Link href={dimension.href} className="mt-1 inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline">Inspect evidence <ArrowRight className="size-3" /></Link> : null}
              </StateMark>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function ApprovalPreview({
  request,
  actionLabel,
  onApprove,
  onReject,
  onClose,
  secondStep = false,
  confirmApprove,
}: {
  request: ApprovalRequest;
  actionLabel: string;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
  secondStep?: boolean;
  confirmApprove?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Approval action preview" onMouseDown={(event) => event.stopPropagation()} className="max-h-[90dvh] w-full max-w-xl overflow-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-4 py-3">
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Action preview</div><h2 className="mt-1 text-base font-semibold">{actionLabel}</h2></div>
          <button onClick={onClose} aria-label="Close action preview" className="grid size-7 place-items-center rounded-md hover:bg-[var(--surface-2)]"><X className="size-3.5" /></button>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Customer", request.customerName],
              ["Conversation", request.conversationId],
              ["Affected entity", request.affectedEntity],
              ["Amount", request.amount === undefined ? "—" : `$${request.amount.toFixed(2)}`],
              ["Identity", request.identity],
              ["Policy", request.policyVersion],
              ["Knowledge", request.knowledgeState],
              ["Customer confirmation", request.confirmation],
              ["Reversibility", request.reversibility],
            ].map(([label, value]) => <div key={label} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 font-semibold">{value}</div></div>)}
          </div>
          <div className="rounded-md border border-[var(--border)] p-3 text-xs"><div className="font-semibold">Why approval is needed</div><p className="mt-1 leading-5 text-[var(--muted-foreground)]">{request.reason}</p></div>
          <div className="rounded-md border border-[var(--border)] p-3 text-xs"><div className="font-semibold">Expected external change</div><p className="mt-1 leading-5 text-[var(--muted-foreground)]">{request.expectedExternalChange}</p></div>
          {secondStep ? (
            <div className="rounded-md border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_5%,var(--surface-1))] p-3">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 text-[var(--warning)]" /><div><div className="text-sm font-semibold">Confirm financial action</div><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">This is a mock approval only. The demo records the decision but sends no real refund.</p></div></div>
              <div className="mt-3 flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={confirmApprove}>Confirm mock approval</Button></div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--border)] pt-4">
              <Link href={`/inbox/${request.conversationId}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Open conversation <ArrowRight className="size-3" /></Link>
              <div className="flex gap-2"><Button onClick={onReject}>Reject</Button><Button variant="primary" onClick={onApprove}>Review & approve</Button></div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function AuditLifecycle({ event }: { event: AutomationAuditEvent }) {
  return (
    <div className="space-y-0">
      {event.lifecycle.map((item, index) => {
        const fail = item.state === "blocked" || item.state === "failed";
        return (
          <div key={`${item.state}-${item.at}`} className="grid grid-cols-[26px_1fr] gap-2 pb-3 last:pb-0">
            <div className="relative flex justify-center">
              {index < event.lifecycle.length - 1 ? <div className="absolute bottom-0 top-5 w-px bg-[var(--border)]" /> : null}
              <div className={cn("z-10 mt-0.5 grid size-5 place-items-center rounded-full border bg-[var(--surface-1)]", fail ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--border-strong)] text-[var(--muted-foreground)]")}>
                {fail ? <AlertTriangle className="size-2.5" /> : item.state === "result_verified" ? <CheckCircle2 className="size-2.5 text-[var(--success)]" /> : <Clock3 className="size-2.5" />}
              </div>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{item.state.replaceAll("_", " ")}</span><span className="text-[10px] text-[var(--muted-foreground)]">{new Date(item.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" })} UTC</span></div>
              <div className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{item.detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ControlPrinciples() {
  return (
    <Surface className="p-4">
      <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-[var(--success)]" /><h2 className="text-sm font-semibold">Execution principles</h2></div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {["Identity before mutation", "Explicit policy authority", "Idempotency for mutations", "Verify result before claiming success"].map((item) => <div key={item} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">{item}</div>)}
      </div>
    </Surface>
  );
}
