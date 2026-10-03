"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleSlash2,
  Gauge,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { ApprovalRequest, ReadinessExplanation } from "@/lib/domain";
import { getAutomationWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";
import {
  ApprovalPreview,
  CompactStat,
  ReadinessInspector,
  StateMark,
} from "@/components/automation/shared/automation-ui";

type WorkspaceData = Awaited<ReturnType<typeof getAutomationWorkspace>>;

const maturity = [
  ["0", "Observe", "No automation"],
  ["1", "Copilot", "Human executes"],
  ["2", "Controlled automation", "Gated execution"],
  ["3", "Verified actions", "Result verification"],
  ["4", "Transactional automation", "Broader transaction controls"],
] as const;

function readinessTone(value: "strong" | "medium" | "weak" | "missing") {
  return value === "strong" ? "success" : value === "medium" ? "info" : "warning";
}

export function AutomationOverview({ data }: { data: WorkspaceData }) {
  const [intent, setIntent] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [secondStep, setSecondStep] = useState(false);
  const [approvalState, setApprovalState] = useState<Record<string, ApprovalRequest["status"]>>({});

  const selectedExplanation = data.readinessExplanations.find((item) => item.intent === intent);
  const controlledCount = data.readiness.filter((item) => item.recommendation === "controlled_automation").length;
  const approvalCount = data.readiness.filter((item) => item.policy === "human_approval").length;
  const humanOnlyCount = data.readiness.filter((item) => item.policy === "human_only").length;
  const pending = useMemo(
    () => data.approvals.filter((item) => (approvalState[item.id] ?? item.status) === "pending").slice(0, 6),
    [data.approvals, approvalState],
  );
  const selectedApproval = data.approvals.find((item) => item.id === approvalId);

  const approve = () => {
    if (!selectedApproval) return;
    setApprovalState((state) => ({ ...state, [selectedApproval.id]: "approved" }));
    setSecondStep(false);
    setApprovalId("");
    toast.success("Mock approval recorded", { description: "No external action was executed." });
  };

  const reject = () => {
    if (!selectedApproval) return;
    setApprovalState((state) => ({ ...state, [selectedApproval.id]: "rejected" }));
    setSecondStep(false);
    setApprovalId("");
    toast.success("Mock approval rejected", { description: "Execution remains blocked." });
  };

  return (
    <div className="space-y-4">
      <Surface className="overflow-hidden">
        <div className="grid grid-cols-2 gap-y-3 py-3 sm:grid-cols-3 xl:grid-cols-6">
          <CompactStat label="Automation status" value="Limited live" note={`${controlledCount} controlled · ${approvalCount} approval · ${humanOnlyCount} human-only`} tone="success" />
          <CompactStat label="Actions · 24h" value={String(data.summary.actionsLast24h)} note="mock executions" />
          <CompactStat label="Approval rate" value={`${Math.round(data.summary.approvalRate * 100)}%`} note="decided approvals" />
          <CompactStat label="Blocked decisions" value={String(data.summary.blockedDecisions)} note="policy / prerequisite" tone="warning" />
          <CompactStat label="Failed executions" value={String(data.summary.failedExecutions)} note="safe failure path" tone="danger" />
          <CompactStat label="Rollback events" value={String(data.summary.rollbackEvents)} note="reversible actions only" />
        </div>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <Surface className="p-4">
          <div className="flex items-center gap-2"><Gauge className="size-4 text-[var(--info)]" /><h2 className="text-sm font-semibold">Automation maturity</h2></div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Deployment state, not a quality score.</p>
          <div className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-5">
            {maturity.map(([level, title, note], index) => {
              const active = index === data.summary.maturityLevel;
              const completed = index < data.summary.maturityLevel;
              return (
                <div key={level} className={cn("min-w-0 overflow-hidden rounded-md border p-2", active ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-1))]" : "border-[var(--border)] bg-[var(--surface-2)]")}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Level {level}</div>
                  <div className="mt-1 break-words text-xs font-semibold">{title}</div>
                  <div className="mt-1 hidden text-[10px] leading-4 text-[var(--muted-foreground)] sm:block">{note}</div>
                  <div className="mt-2">{active ? <Badge tone="info">current</Badge> : completed ? <Badge tone="success">passed</Badge> : <Badge>future</Badge>}</div>
                </div>
              );
            })}
          </div>
        </Surface>

        <Surface className="p-4">
          <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-[var(--success)]" /><h2 className="text-sm font-semibold">Operational gates</h2></div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Autonomous execution is bounded by deterministic policy and system state.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <StateMark state="pass"><div className="font-semibold">Read-only order tracking</div><div className="text-[var(--muted-foreground)]">Policy allows lookup_order under current rollout.</div></StateMark>
            <StateMark state="warning"><div className="font-semibold">Refund approval</div><div className="text-[var(--muted-foreground)]">Human approval required; payment mutation currently paused.</div></StateMark>
            <StateMark state="block"><div className="font-semibold">Account takeover</div><div className="text-[var(--muted-foreground)]">Human-only policy; autonomous account mutation prohibited.</div></StateMark>
            <StateMark state="warning"><div className="font-semibold">Subscription cancellation</div><div className="text-[var(--muted-foreground)]">Knowledge conflict downgraded automation to copilot only.</div></StateMark>
          </div>
        </Surface>
      </div>

      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div><h2 className="text-sm font-semibold">Automation opportunity</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Existing Phase D readiness reused as an execution gate. No universal safety score.</p></div>
          <Badge>{data.readiness.length} intents</Badge>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
            <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
              <tr>{["Intent", "Sample", "Coverage", "Freshness", "Conflicts", "Policy", "Historical eval", "Current mode", "Rollout", "Last decision"].map((label) => <th key={label} className="border-b border-[var(--border)] px-3 py-2 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {data.readiness.map((row) => {
                const explanation = data.readinessExplanations.find((item) => item.intent === row.intent);
                const rollout = data.rollouts.find((item) => item.intent === row.intent);
                const mode = explanation?.currentMode ?? "copilot_only";
                return (
                  <tr key={row.intent} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                    <td className="px-3 py-3"><button onClick={() => setIntent(row.intent)} className="text-left font-semibold hover:text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{row.intent}</button></td>
                    <td className="px-3 py-3 tabular-nums">{row.sampleSize.toLocaleString()}</td>
                    <td className="px-3 py-3"><Badge tone={readinessTone(row.coverage)}>{row.coverage}</Badge></td>
                    <td className="px-3 py-3"><Badge tone={row.freshness === "fresh" ? "success" : "warning"}>{row.freshness}</Badge></td>
                    <td className="px-3 py-3"><Badge tone={row.conflicts === "none" ? "success" : "danger"}>{row.conflicts}</Badge></td>
                    <td className="px-3 py-3"><Badge tone={row.policy === "auto_allowed" ? "success" : row.policy === "human_only" ? "danger" : "warning"}>{row.policy.replaceAll("_", " ")}</Badge></td>
                    <td className="px-3 py-3 font-semibold">{Math.round(row.historicalPassRate * 100)}%</td>
                    <td className="px-3 py-3"><Badge tone={mode === "controlled_automation" ? "success" : mode === "human_only" ? "danger" : "warning"}>{mode.replaceAll("_", " ")}</Badge></td>
                    <td className="px-3 py-3">{rollout?.percentage ?? 0}%</td>
                    <td className="max-w-[250px] px-3 py-3 text-[var(--muted-foreground)]">{explanation?.lastDecision ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-[var(--border)] md:hidden">
          {data.readiness.map((row) => {
            const explanation = data.readinessExplanations.find((item) => item.intent === row.intent);
            const rollout = data.rollouts.find((item) => item.intent === row.intent);
            return (
              <button key={row.intent} onClick={() => setIntent(row.intent)} className="block w-full px-4 py-3 text-left hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{row.intent}</span><Badge tone={row.policy === "human_only" ? "danger" : explanation?.currentMode === "controlled_automation" ? "success" : "warning"}>{explanation?.currentMode.replaceAll("_", " ")}</Badge></div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[var(--muted-foreground)]"><span>{row.sampleSize.toLocaleString()} cases</span><span>{Math.round(row.historicalPassRate * 100)}% eval</span><span>{rollout?.percentage ?? 0}% rollout</span></div>
              </button>
            );
          })}
        </div>

        {selectedExplanation ? (
          <>
            <button aria-label="Close readiness inspector" onClick={() => setIntent("")} className="fixed inset-0 top-12 z-40 bg-black/25 xl:hidden" />
            <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_430px]">
              <div />
              <ReadinessInspector explanation={selectedExplanation} onClose={() => setIntent("")} />
            </div>
          </>
        ) : null}
      </Surface>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Surface className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div><h2 className="text-sm font-semibold">Pending approvals</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Focused approval queue, not a second Helpdesk Inbox.</p></div>
            <Badge tone="warning">{pending.length} shown</Badge>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {pending.map((request) => {
              const action = data.actions.find((item) => item.id === request.actionId);
              return (
                <button key={request.id} onClick={() => setApprovalId(request.id)} className="grid w-full gap-2 px-4 py-3 text-left hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] sm:grid-cols-[1fr_120px_110px] sm:items-center">
                  <div><div className="flex items-center gap-2"><span className="text-xs font-semibold">{action?.label ?? request.actionId}</span>{request.amount !== undefined ? <Badge tone="warning">${request.amount.toFixed(2)}</Badge> : null}</div><div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{request.customerName} · {request.conversationId}</div></div>
                  <div className="text-[11px]"><span className="text-[var(--muted-foreground)]">Identity </span><strong>{request.identity}</strong></div>
                  <div className="text-[11px]"><span className="text-[var(--muted-foreground)]">Confirmation </span><strong>{request.confirmation}</strong></div>
                </button>
              );
            })}
          </div>
        </Surface>

        <Surface className="p-4">
          <h2 className="text-sm font-semibold">Connector health</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Eligibility depends on the required system, not only AI behavior.</p>
          <div className="mt-3 space-y-2">
            {data.connectors.map((connector) => (
              <div key={connector.id} className="rounded-md border border-[var(--border)] p-2.5">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{connector.label}</span><Badge tone={connector.status === "healthy" ? "success" : connector.status === "down" ? "danger" : "warning"}>{connector.status}</Badge></div>
                <div className="mt-1 text-[10px] leading-4 text-[var(--muted-foreground)]">{connector.note}</div>
              </div>
            ))}
          </div>
        </Surface>
      </div>

      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Required demo decisions</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Contrasting cases show explicit gates instead of “AI thinks this is safe”.</p></div>
        <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-5 xl:divide-x xl:divide-[var(--border)]">
          {[
            ["Where is my order?", "lookup_order", "Policy allows", "success", "Read-only execution"],
            ["Change delivery address", "update_delivery_address", "Customer confirmation required", "warning", "Verified identity + confirmation"],
            ["Refund $18.20", "issue_refund", "Human approval required", "warning", "Financial action"],
            ["Refund $420", "issue_refund", "Policy blocks", "danger", "Above automation ceiling"],
            ["Change email after takeover", "update_account_email", "Human-only", "danger", "Security-sensitive"],
          ].map(([title, action, decision, tone, note]) => (
            <div key={title} className="border-b border-[var(--border)] p-4 last:border-b-0 xl:border-b-0">
              <div className="text-xs font-semibold">{title}</div>
              <div className="mt-1 font-mono text-[10px] text-[var(--muted-foreground)]">{action}</div>
              <div className="mt-3"><Badge tone={tone as "success" | "warning" | "danger"}>{decision}</Badge></div>
              <div className="mt-2 text-[10px] leading-4 text-[var(--muted-foreground)]">{note}</div>
            </div>
          ))}
        </div>
      </Surface>

      {selectedApproval ? (
        <ApprovalPreview
          request={selectedApproval}
          actionLabel={data.actions.find((item) => item.id === selectedApproval.actionId)?.label ?? selectedApproval.actionId}
          onApprove={() => setSecondStep(true)}
          onReject={reject}
          onClose={() => { setApprovalId(""); setSecondStep(false); }}
          secondStep={secondStep}
          confirmApprove={approve}
        />
      ) : null}
    </div>
  );
}
