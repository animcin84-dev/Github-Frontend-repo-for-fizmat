"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleSlash2,
  GitCompareArrows,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import type { AutomationPolicy, PolicyDecision } from "@/lib/domain";
import { getAutomationWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";
import { StateMark } from "@/components/automation/shared/automation-ui";

type WorkspaceData = Awaited<ReturnType<typeof getAutomationWorkspace>>;

function policyDecision(policy: AutomationPolicy): PolicyDecision["decision"] {
  if (policy.id === "policy-account-email" || policy.id === "policy-large-refund") return "blocked";
  if (policy.humanApproval === "always" || policy.humanApproval === "above_limit") return "human_approval";
  if (policy.customerConfirmation) return "confirm_customer";
  return "allowed";
}

function DecisionCell({ active, tone, children }: { active: boolean; tone: "success" | "warning" | "danger"; children: React.ReactNode }) {
  return <td className="px-3 py-3 text-center">{active ? <Badge tone={tone}>{children}</Badge> : <span className="text-[var(--border-strong)]">—</span>}</td>;
}

function PolicyInspector({ policy, data, close }: { policy: AutomationPolicy; data: WorkspaceData; close: () => void }) {
  const action = data.actions.find((item) => item.id === policy.actionId);
  const decision = policyDecision(policy);
  const current = policy.versions.find((item) => item.status === "current") ?? policy.versions[0];
  const draft = policy.versions.find((item) => item.status === "draft");
  const previous = policy.versions.find((item) => item.status === "previous");
  const isRefund = policy.id === "policy-refund";

  return (
    <aside aria-label="Automation policy details" className="fixed inset-y-12 right-0 z-50 w-[min(96vw,500px)] overflow-auto border-l border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl xl:sticky xl:top-12 xl:z-auto xl:h-[calc(100dvh-68px)] xl:w-auto xl:shadow-none">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Policy control</div>
          <h2 className="mt-1 text-sm font-semibold">{action?.label ?? policy.actionId}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{policy.intent}</Badge>
            <Badge tone={decision === "allowed" ? "success" : decision === "blocked" ? "danger" : "warning"}>{decision.replaceAll("_", " ")}</Badge>
          </div>
        </div>
        <button onClick={close} aria-label="Close policy inspector" className="grid size-7 place-items-center rounded-md hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><X className="size-3.5" /></button>
      </div>

      <div className="space-y-4 p-4">
        <section className="rounded-md border border-[var(--border)] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Action / applies to</div>
          <div className="mt-2 text-xs"><strong>{policy.actionId}</strong> · {policy.intent}</div>
          <div className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{policy.scope}</div>
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Requires</h3>
          <div className="mt-2 space-y-2 rounded-md border border-[var(--border)] p-3">
            <StateMark state="pass"><span><strong>Identity:</strong> {policy.requiredIdentity}</span></StateMark>
            <StateMark state={policy.knowledgeRequirements.authoritative ? "pass" : "warning"}><span><strong>Knowledge:</strong> {policy.knowledgeRequirements.authoritative ? "authoritative" : "supporting allowed"}</span></StateMark>
            <StateMark state={policy.knowledgeRequirements.fresh ? "pass" : "warning"}><span><strong>Freshness:</strong> {policy.knowledgeRequirements.fresh ? "fresh required" : "not required"}</span></StateMark>
            <StateMark state={policy.knowledgeRequirements.noConflicts ? "pass" : "warning"}><span><strong>Conflicts:</strong> {policy.knowledgeRequirements.noConflicts ? "none allowed" : "non-blocking for this action"}</span></StateMark>
            <StateMark state={policy.customerConfirmation ? "warning" : "pass"}><span><strong>Customer confirmation:</strong> {policy.customerConfirmation ? "required" : "not required"}</span></StateMark>
            <StateMark state={policy.humanApproval === "never" ? "pass" : "warning"}><span><strong>Human approval:</strong> {policy.humanApproval.replaceAll("_", " ")}</span></StateMark>
          </div>
        </section>

        {policy.amountLimit !== undefined ? <section className="rounded-md border border-[var(--border)] p-3 text-xs"><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Amount boundary</div><div className="mt-2 font-semibold">Automation ceiling ≤ ${policy.amountLimit.toFixed(2)}</div>{current.humanApprovalThreshold !== undefined ? <div className="mt-1 text-[var(--muted-foreground)]">Human approval threshold: ${current.humanApprovalThreshold.toFixed(2)}</div> : null}</section> : null}

        <section className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--border)] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Allowed channels</div><div className="mt-2 flex flex-wrap gap-1">{policy.allowedChannels.map((channel) => <Badge key={channel}>{channel}</Badge>)}</div></div>
          <div className="rounded-md border border-[var(--border)] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Allowed regions</div><div className="mt-2 flex flex-wrap gap-1">{policy.allowedRegions.map((region) => <Badge key={region}>{region}</Badge>)}</div></div>
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Block if</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">{policy.blockedConditions.map((condition) => <Badge key={condition} tone="danger">{condition}</Badge>)}</div>
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Version history</h3>
          <div className="mt-2 space-y-2">
            {policy.versions.map((version) => <div key={version.id} className="rounded-md border border-[var(--border)] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{version.label}</span><Badge tone={version.status === "current" ? "success" : version.status === "draft" ? "warning" : "neutral"}>{version.status}</Badge></div><div className="mt-1 text-[10px] text-[var(--muted-foreground)]">Effective {new Date(version.effectiveFrom).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} · Owner {version.owner}</div><div className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{version.changes.join(" ")}</div></div>)}
          </div>
        </section>

        {isRefund && previous && current ? (
          <section className="rounded-md border border-[var(--border)] p-3">
            <div className="flex items-center gap-2"><GitCompareArrows className="size-4 text-[var(--info)]" /><h3 className="text-xs font-semibold">Meaningful policy diff</h3></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-[var(--surface-2)] p-2.5 text-xs"><div className="text-[10px] uppercase text-[var(--muted-foreground)]">Before · {previous.label}</div><div className="mt-1 font-semibold">Refund &gt; ${previous.humanApprovalThreshold} → human approval</div></div>
              <div className="rounded-md bg-[var(--surface-2)] p-2.5 text-xs"><div className="text-[10px] uppercase text-[var(--muted-foreground)]">After · {current.label}</div><div className="mt-1 font-semibold">Refund &gt; ${current.humanApprovalThreshold} → human approval</div></div>
            </div>
            {draft ? <div className="mt-2 text-[11px] text-[var(--muted-foreground)]">Draft {draft.label}: proposes ${draft.humanApprovalThreshold} threshold; not active.</div> : null}
          </section>
        ) : null}

        {isRefund ? (
          <section className="rounded-md border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_4%,var(--surface-1))] p-3">
            <div className="text-xs font-semibold">Historical replay impact</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-[var(--muted-foreground)]">Cases tested</span><div className="font-semibold">{data.policyReplay.casesTested}</div></div>
              <div><span className="text-[var(--muted-foreground)]">Previous eligible</span><div className="font-semibold">{data.policyReplay.previousEligible}</div></div>
              <div><span className="text-[var(--muted-foreground)]">Proposed eligible</span><div className="font-semibold">{data.policyReplay.proposedEligible}</div></div>
              <div><span className="text-[var(--muted-foreground)]">Newly eligible</span><div className="font-semibold">{data.policyReplay.newlyEligible}</div></div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-2.5"><span className="text-xs">Unsafe evaluation regressions: <strong className="text-[var(--danger)]">{data.policyReplay.unsafeRegressions}</strong></span><Badge tone="danger">review required</Badge></div>
          </section>
        ) : null}

        <section className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="text-xs font-semibold">Deterministic rule explanation</div>
          {decision === "blocked" ? (
            <ol className="mt-2 space-y-1 text-xs leading-5 text-[var(--muted-foreground)]">
              <li>1. Action = {policy.actionId}</li>
              <li>2. Explicit policy condition matched a blocking boundary</li>
              <li>3. {current.label} is the current authority</li>
              <li>4. Execution prohibited</li>
            </ol>
          ) : (
            <ol className="mt-2 space-y-1 text-xs leading-5 text-[var(--muted-foreground)]">
              <li>1. Action = {policy.actionId}</li>
              <li>2. Identity / knowledge / connector prerequisites evaluated</li>
              <li>3. {current.label} selected the required gate</li>
              <li>4. {decision === "allowed" ? "Policy allows controlled execution" : decision === "confirm_customer" ? "Customer confirmation required" : "Human approval required"}</li>
            </ol>
          )}
        </section>

        <div className="flex flex-wrap gap-2 text-xs">
          <Link href="/ai-quality?tab=evaluations&suite=action-safety" className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 font-medium hover:bg-[var(--surface-2)]">AI Quality gate <ArrowRight className="size-3" /></Link>
          <Link href="/knowledge" className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 font-medium hover:bg-[var(--surface-2)]">Knowledge evidence <ArrowRight className="size-3" /></Link>
        </div>
      </div>
    </aside>
  );
}

export function PolicyCenter({ data }: { data: WorkspaceData }) {
  const [policyId, setPolicyId] = useQueryState("policy", { defaultValue: "" });
  const selected = data.policies.find((item) => item.id === policyId);

  return (
    <div className="space-y-4">
      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-[var(--success)]" /><h2 className="text-sm font-semibold">Policy matrix</h2></div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Policy is separate from procedure. Each row represents explicit scope and conditions rather than a single global action label.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[930px] border-collapse text-left text-xs">
            <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"><tr><th className="border-b border-[var(--border)] px-3 py-2 font-medium">Action / condition</th><th className="border-b border-[var(--border)] px-3 py-2 font-medium">Intent</th><th className="border-b border-[var(--border)] px-3 py-2 text-center font-medium">Auto</th><th className="border-b border-[var(--border)] px-3 py-2 text-center font-medium">Confirm</th><th className="border-b border-[var(--border)] px-3 py-2 text-center font-medium">Human approval</th><th className="border-b border-[var(--border)] px-3 py-2 text-center font-medium">Blocked</th><th className="border-b border-[var(--border)] px-3 py-2 font-medium">Version</th></tr></thead>
            <tbody>
              {data.policies.map((policy) => {
                const action = data.actions.find((item) => item.id === policy.actionId);
                const decision = policyDecision(policy);
                const current = policy.versions.find((version) => version.status === "current") ?? policy.versions[0];
                return (
                  <tr key={policy.id} className={cn("border-b border-[var(--border)] hover:bg-[var(--surface-2)]", selected?.id === policy.id && "bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-1))]")}>
                    <td className="max-w-[310px] px-3 py-3"><button onClick={() => setPolicyId(policy.id)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><div className="font-semibold hover:text-[var(--accent)] hover:underline">{action?.label ?? policy.actionId}</div><div className="mt-0.5 text-[10px] leading-4 text-[var(--muted-foreground)]">{policy.scope}</div></button></td>
                    <td className="px-3 py-3">{policy.intent}</td>
                    <DecisionCell active={decision === "allowed"} tone="success">✓</DecisionCell>
                    <DecisionCell active={decision === "confirm_customer"} tone="warning">✓</DecisionCell>
                    <DecisionCell active={decision === "human_approval"} tone="warning">✓</DecisionCell>
                    <DecisionCell active={decision === "blocked"} tone="danger">✓</DecisionCell>
                    <td className="px-3 py-3 font-mono text-[10px]">{current.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-4">
          <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--success)]" /><h2 className="text-sm font-semibold">Policy allows</h2></div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Read-only order lookup can proceed after account/order matching because no external mutation occurs.</p>
        </Surface>
        <Surface className="p-4">
          <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-[var(--warning)]" /><h2 className="text-sm font-semibold">Approval gate</h2></div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Refund policy requires explicit customer confirmation and human approval on configured financial paths.</p>
        </Surface>
        <Surface className="p-4">
          <div className="flex items-center gap-2"><CircleSlash2 className="size-4 text-[var(--danger)]" /><h2 className="text-sm font-semibold">Policy blocks</h2></div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Security-sensitive account changes after an account takeover claim are never autonomous.</p>
        </Surface>
      </div>

      {selected ? (
        <>
          <button aria-label="Close policy inspector" onClick={() => setPolicyId(null)} className="fixed inset-0 top-12 z-40 bg-black/25 xl:hidden" />
          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_500px]"><div /><PolicyInspector policy={selected} data={data} close={() => setPolicyId(null)} /></div>
        </>
      ) : null}
    </div>
  );
}
