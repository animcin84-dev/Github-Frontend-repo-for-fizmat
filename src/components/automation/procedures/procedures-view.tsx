"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleSlash2,
  DatabaseZap,
  GitBranch,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { ActionDefinition, AutomationProcedure } from "@/lib/domain";
import { getAutomationWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";
import { StateMark } from "@/components/automation/shared/automation-ui";

type WorkspaceData = Awaited<ReturnType<typeof getAutomationWorkspace>>;

const stepTone: Record<AutomationProcedure["steps"][number]["type"], "neutral" | "info" | "warning" | "danger" | "success"> = {
  understand: "info",
  ask_customer: "neutral",
  retrieve_data: "info",
  validate: "warning",
  branch: "warning",
  policy_check: "warning",
  request_confirmation: "warning",
  human_approval: "warning",
  execute_action: "danger",
  verify_result: "success",
  send_response: "success",
  escalate: "danger",
};

function riskTone(risk: ActionDefinition["risk"]) {
  return risk === "read_only" ? "success" :
    risk === "low_risk_reversible" ? "info" :
    risk === "customer_impacting_reversible" ? "warning" :
    risk === "financial" || risk === "security_sensitive" || risk === "irreversible" ? "danger" : "neutral";
}

function ProcedureInspector({ procedure, data, close }: { procedure: AutomationProcedure; data: WorkspaceData; close: () => void }) {
  const simulation = data.procedureSimulations.find((item) => item.procedureId === procedure.id);
  const rollout = data.rollouts.find((item) => item.id === procedure.rolloutId);
  const [simulated, setSimulated] = useState(false);

  return (
    <aside aria-label="Automation procedure details" className="fixed inset-y-12 right-0 z-50 w-[min(96vw,520px)] overflow-auto border-l border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl xl:sticky xl:top-12 xl:z-auto xl:h-[calc(100dvh-68px)] xl:w-auto xl:shadow-none">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
        <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Procedure</div><h2 className="mt-1 text-sm font-semibold">{procedure.name}</h2><div className="mt-2 flex flex-wrap gap-1.5"><Badge>{procedure.intent}</Badge><Badge tone={procedure.status === "active" || procedure.status === "limited" ? "success" : procedure.status === "paused" ? "danger" : "warning"}>{procedure.status}</Badge></div></div>
        <button onClick={close} aria-label="Close procedure inspector" className="grid size-7 place-items-center rounded-md hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button>
      </div>

      <div className="space-y-4 p-4">
        <Surface className="p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Trigger</div>
          <p className="mt-1 text-xs leading-5">{procedure.trigger}</p>
        </Surface>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Procedure instructions</h3>
          <div className="mt-2 space-y-0">
            {procedure.steps.map((step, index) => (
              <div key={step.id} className="grid grid-cols-[28px_1fr] gap-2 pb-3 last:pb-0">
                <div className="relative flex justify-center">{index < procedure.steps.length - 1 ? <div className="absolute bottom-0 top-6 w-px bg-[var(--border)]" /> : null}<div className="z-10 grid size-6 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-1)] text-[10px] font-semibold">{index + 1}</div></div>
                <div className="rounded-md border border-[var(--border)] p-2.5">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={stepTone[step.type]}>{step.type.replaceAll("_", " ")}</Badge><span className="text-xs font-semibold">{step.title}</span></div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{step.instruction}</div>
                  {step.deterministicCondition ? <div className="mt-2 rounded bg-[var(--surface-2)] p-2 font-mono text-[10px] text-[var(--foreground)]">{step.deterministicCondition}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--border)] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Policy requirements</div><div className="mt-2 flex flex-wrap gap-1">{procedure.policyIds.map((id) => <Link key={id} href={`/automation?tab=policies&policy=${id}`}><Badge tone="warning">{id}</Badge></Link>)}</div></div>
          <div className="rounded-md border border-[var(--border)] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Connected actions</div><div className="mt-2 flex flex-wrap gap-1">{procedure.actionIds.map((id) => <Badge key={id} tone="info">{id}</Badge>)}</div></div>
          <div className="rounded-md border border-[var(--border)] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Required data</div><ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">{procedure.requiredData.map((item) => <li key={item}>• {item}</li>)}</ul></div>
          <div className="rounded-md border border-[var(--border)] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Evaluation / rollout</div><div className="mt-2 text-xs font-semibold">{Math.round(procedure.evaluation.passRate * 100)}% · {procedure.evaluation.sampleSize.toLocaleString()} cases</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{rollout?.mode} · {rollout?.percentage ?? 0}%</div></div>
        </section>

        <section className="rounded-md border border-[color-mix(in_srgb,var(--ai)_24%,var(--border))] bg-[color-mix(in_srgb,var(--ai)_4%,var(--surface-1))] p-3">
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold">Historical procedure simulation</div><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">Replay stops before any real external mutation.</p></div><Button size="sm" onClick={() => { setSimulated(true); toast.success("Historical simulation complete", { description: "No external system was mutated." }); }}><Play className="size-3.5" />Run historical replay</Button></div>
          {simulated && simulation ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["Replayed", simulation.conversationsReplayed],
                  ["Completed safely", simulation.completedSafely],
                  ["Human approval", simulation.humanApproval],
                  ["Escalated", simulation.escalated],
                  ["Blocked", simulation.blocked],
                  ["Execution failure", simulation.executionFailure],
                ].map(([label, value]) => <div key={String(label)} className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-2.5"><div className="text-[10px] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>)}
              </div>
              {simulation.regressions.length ? <div className="rounded-md border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_4%,var(--surface-1))] p-3"><div className="flex items-center gap-2"><AlertTriangle className="size-4 text-[var(--danger)]" /><span className="text-xs font-semibold">Regressions</span></div>{simulation.regressions.map((item) => <div key={item.caseId} className="mt-2 text-xs text-[var(--muted-foreground)]">{item.caseId}: {item.from} → <strong className="text-[var(--danger)]">{item.to}</strong></div>)}</div> : <div className="text-xs text-[var(--success)]">No sampled unsafe regressions in this replay.</div>}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Sample simulation trace</div>
                <div className="mt-2 space-y-2">{simulation.sampleTrace.map((item, index) => <div key={`${item.state}-${index}`} className="flex gap-2 text-xs"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--border-strong)]" /><div><strong>{item.state}</strong><div className="text-[var(--muted-foreground)]">{item.detail}</div></div></div>)}</div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

function ActionCatalog({ data }: { data: WorkspaceData }) {
  return (
    <Surface className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Controlled action catalog</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Mock registry only. No real provider API is connected.</p></div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1050px] border-collapse text-left text-xs">
          <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"><tr>{["Action", "Provider", "Risk", "Reversible", "Identity", "Confirm", "Approval", "Timeout", "Health"].map((label) => <th key={label} className="border-b border-[var(--border)] px-3 py-2 font-medium">{label}</th>)}</tr></thead>
          <tbody>{data.actions.map((action) => <tr key={action.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]"><td className="max-w-[300px] px-3 py-3"><div className="font-semibold">{action.label}</div><div className="mt-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">{action.id}</div><div className="mt-1 text-[10px] leading-4 text-[var(--muted-foreground)]">Inputs: {action.inputSchema.join(", ")} · Retry: {action.retryPolicy}</div></td><td className="px-3 py-3">{action.provider}</td><td className="px-3 py-3"><Badge tone={riskTone(action.risk)}>{action.risk.replaceAll("_", " ")}</Badge></td><td className="px-3 py-3">{action.reversible ? "Yes" : "No"}</td><td className="px-3 py-3">{action.requiresIdentity ? "Required" : "No"}</td><td className="px-3 py-3">{action.requiresConfirmation ? "Required" : "No"}</td><td className="px-3 py-3">{action.requiresHumanApproval ? "Required" : "No"}</td><td className="px-3 py-3">{action.timeoutMs / 1000}s</td><td className="px-3 py-3"><Badge tone={action.status === "available" ? "success" : action.status === "paused" ? "danger" : "warning"}>{action.status}</Badge></td></tr>)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-[var(--border)] md:hidden">{data.actions.map((action) => <div key={action.id} className="px-4 py-3"><div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold">{action.label}</div><Badge tone={riskTone(action.risk)}>{action.risk.replaceAll("_", " ")}</Badge></div><div className="mt-1 text-[10px] text-[var(--muted-foreground)]">{action.provider} · {action.status}</div><div className="mt-1 text-[10px] leading-4 text-[var(--muted-foreground)]">Inputs: {action.inputSchema.join(", ")} · {action.retryPolicy}</div></div>)}</div>
    </Surface>
  );
}

function ExecutionPreview({ data }: { data: WorkspaceData }) {
  const [scenarioRaw, setScenarioRaw] = useQueryState("preview", { defaultValue: "refund" });
  const scenario = (scenarioRaw in data.actionPreviews ? scenarioRaw : "refund") as keyof WorkspaceData["actionPreviews"];
  const setScenario = (value: keyof WorkspaceData["actionPreviews"]) => setScenarioRaw(value);
  const preview = data.actionPreviews[scenario];
  const blocked = preview.outcome === "blocked";
  const approval = preview.outcome === "human_approval";
  const isRefund = preview.actionId === "issue_refund";

  const checks = [
    ["Identity verified", preview.identity === "Verified" || preview.identity === "Authenticated"],
    ["Knowledge authoritative", !preview.knowledge.includes("conflict")],
    ["Knowledge fresh", preview.knowledge.includes("fresh")],
    ["No conflicts", !preview.knowledge.includes("conflict")],
    ["Policy allows action", !blocked],
    ["Confirmation received", preview.confirmation === "Received" || preview.confirmation === "Not required"],
    ["Approval received", !approval],
    ["External system healthy", !isRefund],
  ] as const;

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Action preview & preconditions</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Preview exactly what would change before controlled execution.</p></div><select aria-label="Action preview scenario" value={scenario} onChange={(event) => setScenario(event.target.value as keyof WorkspaceData["actionPreviews"])} className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs"><option value="safeReadOnly">Safe read-only</option><option value="addressChange">Customer confirmation</option><option value="refund">Human approval</option><option value="blockedLargeRefund">Policy blocked</option><option value="security">Security human-only</option></select></div>
      <div className="grid gap-0 lg:grid-cols-[1fr_0.9fr] lg:divide-x lg:divide-[var(--border)]">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={blocked ? "danger" : approval ? "warning" : "success"}>{blocked ? "execution blocked" : approval ? "human approval required" : "policy allows"}</Badge><span className="text-sm font-semibold">{preview.title}</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              ["Customer", preview.customer],
              ["Conversation", preview.conversationId],
              ["Entity", preview.entity],
              ["Amount", "amount" in preview ? preview.amount ?? "—" : "—"],
              ["Identity", preview.identity],
              ["Policy", preview.policy],
              ["Knowledge", preview.knowledge],
              ["Confirmation", preview.confirmation],
              ["Human approval", preview.approval],
            ].map(([label, value]) => <div key={label} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 font-semibold">{value}</div></div>)}
          </div>
          <div className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">{preview.note}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" disabled={blocked || approval || isRefund} onClick={() => toast.success("Mock action succeeded", { description: "Result verification recorded. No external API called." })}>{blocked ? "Execution blocked" : approval ? "Approval required" : "Execute mock action"}</Button>
            <Link href={`/inbox/${preview.conversationId}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">Conversation <ArrowRight className="size-3" /></Link>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-semibold">Precondition checks</div>
          <div className="mt-3 space-y-2">{checks.map(([label, passed]) => <StateMark key={label} state={passed ? "pass" : "block"}><span>{label}</span></StateMark>)}</div>
          {!checks.every(([, passed]) => passed) ? <div className="mt-4 rounded-md border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_4%,var(--surface-1))] p-3 text-xs font-semibold text-[var(--danger)]">EXECUTION BLOCKED until every critical prerequisite passes.</div> : null}
        </div>
      </div>
    </Surface>
  );
}

export function ProceduresView({ data }: { data: WorkspaceData }) {
  const [procedureId, setProcedureId] = useQueryState("procedure", { defaultValue: "" });
  const selected = data.procedures.find((item) => item.id === procedureId);
  const duplicate = data.duplicateProtectionExecution;

  return (
    <div className="space-y-4">
      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Structured procedures</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Natural-language guidance is allowed, but critical branch and policy conditions remain explicit.</p></div>
        <div className="grid gap-0 lg:grid-cols-2">
          {data.procedures.map((procedure) => <button key={procedure.id} onClick={() => setProcedureId(procedure.id)} className="border-b border-[var(--border)] p-4 text-left hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] lg:odd:border-r"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{procedure.name}</span><Badge tone={procedure.status === "limited" || procedure.status === "active" ? "success" : procedure.status === "paused" ? "danger" : "warning"}>{procedure.status}</Badge></div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{procedure.trigger}</div><div className="mt-3 flex flex-wrap gap-1.5"><Badge>{procedure.steps.length} steps</Badge><Badge>{Math.round(procedure.evaluation.passRate * 100)}% eval</Badge><Badge>{procedure.evaluation.sampleSize.toLocaleString()} cases</Badge></div></button>)}
        </div>
      </Surface>

      <ExecutionPreview data={data} />
      <ActionCatalog data={data} />

      <Surface className="p-4">
        <div className="flex items-center gap-2"><LockKeyhole className="size-4 text-[var(--info)]" /><h2 className="text-sm font-semibold">Idempotency / duplicate protection</h2></div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs"><div className="font-semibold">This refund was already executed.</div><div className="mt-1 text-[var(--muted-foreground)]">Execution: <span className="font-mono text-[var(--foreground)]">{duplicate.id}</span></div><div className="mt-1 text-[var(--muted-foreground)]">Idempotency key: <span className="font-mono text-[var(--foreground)]">{duplicate.idempotencyKey}</span></div></div>
          <div><Badge tone="danger">Duplicate action blocked</Badge><div className="mt-1 text-[10px] text-[var(--muted-foreground)]">No second provider mutation would be sent.</div></div>
        </div>
      </Surface>

      {selected ? (
        <>
          <button aria-label="Close procedure inspector" onClick={() => setProcedureId(null)} className="fixed inset-0 top-12 z-40 bg-black/25 xl:hidden" />
          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_520px]"><div /><ProcedureInspector procedure={selected} data={data} close={() => setProcedureId(null)} /></div>
        </>
      ) : null}
    </div>
  );
}
