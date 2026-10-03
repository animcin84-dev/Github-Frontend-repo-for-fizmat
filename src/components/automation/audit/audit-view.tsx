"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleSlash2,
  FileClock,
  RotateCcw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import type { AutomationAuditEvent } from "@/lib/domain";
import { getAutomationWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";
import { AuditLifecycle, DecisionBadge } from "@/components/automation/shared/automation-ui";

type WorkspaceData = Awaited<ReturnType<typeof getAutomationWorkspace>>;

function AuditInspector({ event, data, close }: { event: AutomationAuditEvent; data: WorkspaceData; close: () => void }) {
  const action = data.actions.find((item) => item.id === event.actionId);
  const execution = event.executionId ? data.auditEvents.find(() => false) : undefined;
  const reversible = action?.reversible ?? false;
  const failed = event.result === "failed";
  const blocked = event.result === "not_executed";

  return (
    <aside aria-label="Automation audit details" className="fixed inset-y-12 right-0 z-50 w-[min(96vw,500px)] overflow-auto border-l border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl xl:sticky xl:top-12 xl:z-auto xl:h-[calc(100dvh-68px)] xl:w-auto xl:shadow-none">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
        <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Append-only audit model</div><h2 className="mt-1 text-sm font-semibold">{action?.label ?? event.actionId} · {event.conversationId}</h2><div className="mt-2 flex flex-wrap gap-1.5"><DecisionBadge decision={event.decision} /><Badge tone={event.result === "succeeded" ? "success" : event.result === "failed" || event.result === "not_executed" ? "danger" : "warning"}>{event.result.replaceAll("_", " ")}</Badge></div></div>
        <button onClick={close} aria-label="Close audit inspector" className="grid size-7 place-items-center rounded-md hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["Timestamp", new Date(event.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC"],
            ["Intent", event.intent],
            ["Action", event.actionId],
            ["Policy version", event.policyVersion],
            ["Knowledge snapshot", event.knowledgeSnapshot],
            ["Evaluation version", event.evaluationVersion],
            ["Approver", event.approver ?? "Not required"],
            ["Execution ID", event.executionId ?? "Not executed"],
          ].map(([label, value]) => <div key={label} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 break-words font-semibold">{value}</div></div>)}
        </div>

        <section className="rounded-md border border-[var(--border)] p-3">
          <div className="text-xs font-semibold">Decision vs execution</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div className="rounded bg-[var(--surface-2)] p-2.5"><div className="text-[10px] text-[var(--muted-foreground)]">Policy decision</div><div className="mt-1 font-semibold">{event.decision.replaceAll("_", " ")}</div></div><div className="rounded bg-[var(--surface-2)] p-2.5"><div className="text-[10px] text-[var(--muted-foreground)]">Execution result</div><div className="mt-1 font-semibold">{event.result.replaceAll("_", " ")}</div></div></div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{event.reason}</p>
        </section>

        <section>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Lifecycle</div>
          <div className="mt-2"><AuditLifecycle event={event} /></div>
        </section>

        {failed ? (
          <section className="rounded-md border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_4%,var(--surface-1))] p-3">
            <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-[var(--danger)]" /><div className="text-xs font-semibold">Execution failed</div></div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Recommended operator step: verify provider state first, then decide whether an idempotent retry is safe. Do not blindly retry an uncertain mutation.</p>
          </section>
        ) : blocked ? (
          <section className="rounded-md border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_4%,var(--surface-1))] p-3">
            <div className="flex items-center gap-2"><CircleSlash2 className="size-4 text-[var(--danger)]" /><div className="text-xs font-semibold">Execution prohibited</div></div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">No provider mutation exists for this decision. Resolve the blocking prerequisite or continue through the human workflow.</p>
          </section>
        ) : (
          <section className="rounded-md border border-[color-mix(in_srgb,var(--success)_30%,var(--border))] bg-[color-mix(in_srgb,var(--success)_4%,var(--surface-1))] p-3">
            <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--success)]" /><div className="text-xs font-semibold">Result verified</div></div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">The mock lifecycle records a post-execution verification step before claiming success.</p>
          </section>
        )}

        <section className="rounded-md border border-[var(--border)] p-3">
          <div className="flex items-center gap-2"><RotateCcw className="size-4" /><div className="text-xs font-semibold">Rollback</div></div>
          <div className="mt-2"><Badge tone={reversible ? "success" : "danger"}>{reversible ? "Rollback available" : "Rollback unavailable"}</Badge></div>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">{reversible ? "This action class is modeled as reversible; a real product would preview the compensating action before execution." : "This action class is not safely reversible; recovery requires a separate operator workflow."}</p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link href={`/inbox/${event.conversationId}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Conversation <ArrowRight className="size-3" /></Link>
          <Link href="/automation?tab=policies" className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Policy <ArrowRight className="size-3" /></Link>
          <Link href="/ai-quality?tab=evaluations" className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Evaluation <ArrowRight className="size-3" /></Link>
        </div>
      </div>
    </aside>
  );
}

export function AuditView({ data }: { data: WorkspaceData }) {
  const [decision, setDecision] = useQueryState("decision", { defaultValue: "" });
  const [result, setResult] = useQueryState("result", { defaultValue: "" });
  const [auditId, setAuditId] = useQueryState("auditId", { defaultValue: "" });

  const filtered = useMemo(
    () => data.auditEvents.filter((item) => (!decision || item.decision === decision) && (!result || item.result === result)).slice(0, 120),
    [data.auditEvents, decision, result],
  );
  const selected = data.auditEvents.find((item) => item.id === auditId);

  return (
    <div className="space-y-4">
      <Surface className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><FileClock className="size-4 text-[var(--info)]" /><h2 className="text-sm font-semibold">Automation audit log</h2></div><p className="mt-1 text-xs text-[var(--muted-foreground)]">Frontend contract models append-only events. It does not claim cryptographic immutability.</p></div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Audit decision filter" value={decision} onChange={(event) => setDecision(event.target.value || null)} className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs"><option value="">All decisions</option><option value="allowed">allowed</option><option value="confirm_customer">confirmation</option><option value="human_approval">human approval</option><option value="blocked">blocked</option></select>
            <select aria-label="Audit result filter" value={result} onChange={(event) => setResult(event.target.value || null)} className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs"><option value="">All results</option><option value="succeeded">succeeded</option><option value="failed">failed</option><option value="rolled_back">rolled back</option><option value="not_executed">not executed</option></select>
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
            <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"><tr>{["Time", "Conversation", "Intent", "Action", "Decision", "Policy", "Approver", "Execution", "Result", "Reason"].map((label) => <th key={label} className="border-b border-[var(--border)] px-3 py-2 font-medium">{label}</th>)}</tr></thead>
            <tbody>{filtered.map((event) => <tr key={event.id} className={cn("border-b border-[var(--border)] hover:bg-[var(--surface-2)]", selected?.id === event.id && "bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-1))]")}>
              <td className="px-3 py-2.5"><button onClick={() => setAuditId(event.id)} aria-label={`Inspect audit event ${event.id}`} className="font-mono text-[10px] hover:text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{new Date(event.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" })}</button></td>
              <td className="px-3 py-2.5">{event.conversationId}</td><td className="px-3 py-2.5">{event.intent}</td><td className="px-3 py-2.5 font-mono text-[10px]">{event.actionId}</td><td className="px-3 py-2.5"><DecisionBadge decision={event.decision} /></td><td className="px-3 py-2.5 font-mono text-[10px]">{event.policyVersion}</td><td className="px-3 py-2.5">{event.approver ?? "—"}</td><td className="px-3 py-2.5 font-mono text-[10px]">{event.executionId ?? "—"}</td><td className="px-3 py-2.5"><Badge tone={event.result === "succeeded" ? "success" : event.result === "failed" || event.result === "not_executed" ? "danger" : "warning"}>{event.result.replaceAll("_", " ")}</Badge></td><td className="max-w-[280px] px-3 py-2.5 text-[var(--muted-foreground)]">{event.reason}</td>
            </tr>)}</tbody>
          </table>
        </div>

        <div className="divide-y divide-[var(--border)] md:hidden">
          {filtered.map((event) => <button key={event.id} aria-label={`Inspect audit event ${event.id}`} onClick={() => setAuditId(event.id)} className="block w-full px-4 py-3 text-left hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{event.actionId}</span><Badge tone={event.result === "succeeded" ? "success" : event.result === "failed" || event.result === "not_executed" ? "danger" : "warning"}>{event.result.replaceAll("_", " ")}</Badge></div><div className="mt-1 text-[10px] text-[var(--muted-foreground)]">{event.conversationId} · {event.policyVersion}</div><div className="mt-2"><DecisionBadge decision={event.decision} /></div></button>)}
        </div>
      </Surface>

      {selected ? (
        <>
          <button aria-label="Close audit inspector" onClick={() => setAuditId(null)} className="fixed inset-0 top-12 z-40 bg-black/25 xl:hidden" />
          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_500px]"><div /><AuditInspector event={selected} data={data} close={() => setAuditId(null)} /></div>
        </>
      ) : null}
    </div>
  );
}
