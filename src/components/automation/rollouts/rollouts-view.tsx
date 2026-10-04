"use client";

import {
  AlertTriangle,
  ArrowRight,
  CirclePause,
  Gauge,
  Pause,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { RolloutConfig } from "@/lib/domain";
import { getAutomationWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";

type WorkspaceData = Awaited<ReturnType<typeof getAutomationWorkspace>>;

const rolloutOptions: Array<{ mode: RolloutConfig["mode"]; percentage: RolloutConfig["percentage"]; label: string }> = [
  { mode: "shadow", percentage: 0, label: "Shadow · 0%" },
  { mode: "canary", percentage: 5, label: "Canary · 5%" },
  { mode: "limited", percentage: 25, label: "Limited · 25%" },
  { mode: "expanded", percentage: 50, label: "Expanded · 50%" },
  { mode: "full", percentage: 100, label: "Full · 100%" },
  { mode: "paused", percentage: 0, label: "Paused" },
];

function RolloutCard({
  rollout,
  override,
  onChange,
}: {
  rollout: RolloutConfig;
  override?: { mode: RolloutConfig["mode"]; percentage: RolloutConfig["percentage"] };
  onChange: (mode: RolloutConfig["mode"], percentage: RolloutConfig["percentage"]) => void;
}) {
  const mode = override?.mode ?? rollout.mode;
  const percentage = override?.percentage ?? rollout.percentage;
  const blocked = rollout.intent === "Account takeover";
  const paused = mode === "paused";
  const [thresholds, setThresholds] = useState<Record<string, string>>(() => Object.fromEntries(rollout.autoPauseConditions.filter((condition) => condition.threshold).map((condition) => [condition.id, condition.threshold ?? ""])));
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(rollout.autoPauseConditions.map((condition) => [condition.id, condition.enabled])));

  return (
    <Surface className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div><h3 className="text-sm font-semibold">{rollout.intent}</h3><div className="mt-1 flex flex-wrap gap-1.5"><Badge tone={paused ? "danger" : mode === "shadow" ? "warning" : "success"}>{mode}</Badge><Badge>{percentage}%</Badge>{blocked ? <Badge tone="danger">human-only</Badge> : null}</div></div>
        <select
          aria-label={`Rollout for ${rollout.intent}`}
          value={`${mode}:${percentage}`}
          disabled={blocked}
          onChange={(event) => {
            const [nextMode, nextPercentage] = event.target.value.split(":");
            onChange(nextMode as RolloutConfig["mode"], Number(nextPercentage) as RolloutConfig["percentage"]);
          }}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rolloutOptions.map((option) => <option key={`${option.mode}:${option.percentage}`} value={`${option.mode}:${option.percentage}`}>{option.label}</option>)}
        </select>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Eligible population</div><ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">{rollout.eligiblePopulation.map((item) => <li key={item}>• {item}</li>)}</ul></div>
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Excluded</div><ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">{rollout.excluded.map((item) => <li key={item}>• {item}</li>)}</ul></div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Guardrails</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            {[
              ["Executed", rollout.guardrails.executed],
              ["Failed", rollout.guardrails.failed],
              ["Takeover after action", rollout.guardrails.humanTakeoverAfterAction],
              ["Reopened", rollout.guardrails.reopened],
              ["Customer correction", rollout.guardrails.customerCorrection],
              ["Policy blocks", rollout.guardrails.policyBlocks],
            ].map(([label, value]) => <div key={String(label)} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2"><div className="text-[10px] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 font-semibold">{value}</div></div>)}
          </div>
          <div className="mt-2 text-[10px] text-[var(--muted-foreground)]">Baseline: failure {(rollout.baseline.failureRate * 100).toFixed(1)}% · reopen {(rollout.baseline.reopenRate * 100).toFixed(1)}% · observed rollback {(rollout.guardrails.rollbackRate * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Auto-pause if</div>
          <div className="mt-2 space-y-1.5">{rollout.autoPauseConditions.map((condition) => <div key={condition.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] px-2.5 py-2 text-xs"><span className="min-w-0 flex-1">{condition.label}</span><div className="flex items-center gap-2">{condition.threshold ? <input aria-label={`Threshold ${rollout.intent} ${condition.id}`} value={thresholds[condition.id] ?? condition.threshold} onChange={(event) => setThresholds((current) => ({ ...current, [condition.id]: event.target.value }))} className="h-7 w-16 rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" /> : null}<label className="flex items-center gap-1.5 text-[10px]"><input type="checkbox" checked={enabled[condition.id] ?? false} onChange={(event) => setEnabled((current) => ({ ...current, [condition.id]: event.target.checked }))} />{enabled[condition.id] ? "enabled" : "off"}</label></div></div>)}</div>
        </div>
      </div>
    </Surface>
  );
}

function KillSwitch({ paused, setPaused }: { paused: boolean; setPaused: (value: boolean) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  if (paused) {
    return (
      <Surface className="border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><CirclePause className="mt-0.5 size-5 text-[var(--danger)]" /><div><div className="text-sm font-semibold">All autonomous automation is paused</div><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">Copilot suggestions remain available. Human workflows remain active. Pause applies to this session.</p></div></div>
          <Button onClick={() => { setPaused(false); toast.success("Automation preview resumed", { description: "Session controls updated. External execution remains disabled." }); }}>Resume preview</Button>
        </div>
      </Surface>
    );
  }

  return (
    <>
      <Surface className="border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 text-[var(--danger)]" /><div><div className="text-sm font-semibold">Operational kill switch</div><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">Pause autonomous executions globally while keeping copilot suggestions and human workflows active.</p></div></div>
          <Button variant="danger" onClick={() => setConfirming(true)}><Pause className="size-3.5" />Pause all automation</Button>
        </div>
      </Surface>

      {confirming ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={() => setConfirming(false)}>
          <section role="dialog" aria-modal="true" aria-label="Pause all automation confirmation" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl">
            <div className="flex items-start justify-between border-b border-[var(--border)] px-4 py-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Protected operational control</div><h2 className="mt-1 text-base font-semibold">Pause all automation?</h2></div><button onClick={() => setConfirming(false)} aria-label="Close kill switch confirmation" className="grid size-7 place-items-center rounded-md hover:bg-[var(--surface-2)]"><X className="size-3.5" /></button></div>
            <div className="space-y-4 p-4">
              <div className="rounded-md border border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_4%,var(--surface-1))] p-3 text-xs leading-5"><strong>Autonomous executions stop.</strong><br />Copilot suggestions remain available.<br />Human workflows remain active.</div>
              <label className="block text-xs font-medium">Type <span className="font-mono">PAUSE</span> to confirm<input autoFocus value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" /></label>
              <div className="flex justify-end gap-2"><Button onClick={() => setConfirming(false)}>Cancel</Button><Button variant="danger" disabled={confirmText !== "PAUSE"} onClick={() => { setPaused(true); setConfirming(false); setConfirmText(""); toast.success("Session automation paused", { description: "Autonomous execution is visually paused in this session only." }); }}>Confirm pause</Button></div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function RolloutsView({ data }: { data: WorkspaceData }) {
  const [overrides, setOverrides] = useState<Record<string, { mode: RolloutConfig["mode"]; percentage: RolloutConfig["percentage"] }>>({});
  const [pausedAll, setPausedAll] = useState(false);

  const changeRollout = (rollout: RolloutConfig, mode: RolloutConfig["mode"], percentage: RolloutConfig["percentage"]) => {
    const hasIncidentGate = rollout.intent === "Refund request";
    const hasKnowledgeGate = rollout.intent === data.knowledgeDowngrade.intent;
    if (hasIncidentGate && mode !== "paused" && mode !== "shadow") {
      toast.error("Rollout change blocked", { description: "Payments incident currently blocks payment-changing automation." });
      return;
    }
    if (hasKnowledgeGate && percentage > 0) {
      toast.error("Rollout change blocked", { description: "Knowledge conflict downgraded this intent to copilot only." });
      return;
    }
    setOverrides((current) => ({ ...current, [rollout.id]: { mode, percentage } }));
    toast.success("Session rollout updated", { description: `${rollout.intent}: ${mode} · ${percentage}%` });
  };

  return (
    <div className="space-y-4">
      <KillSwitch paused={pausedAll} setPaused={setPausedAll} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Surface className="border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] p-4">
          <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-[var(--danger)]" /><h2 className="text-sm font-semibold">Incident gate</h2></div>
          <div className="mt-3"><Badge tone="danger">AUTOMATION PAUSED</Badge></div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{data.incidentGates[0].reason}</p>
          <Link href={`/intelligence/${data.incidentGates[0].issueId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">Open Intelligence issue <ArrowRight className="size-3" /></Link>
        </Surface>

        <Surface className="border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] p-4">
          <div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-[var(--warning)]" /><h2 className="text-sm font-semibold">Knowledge gate</h2></div>
          <div className="mt-3"><Badge tone="warning">AUTOMATION DOWNGRADED</Badge></div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]"><strong>{data.knowledgeDowngrade.intent}</strong>: {data.knowledgeDowngrade.reason} {data.knowledgeDowngrade.from} → {data.knowledgeDowngrade.to}.</p>
          <Link href={`/knowledge?tab=sources&source=${data.knowledgeDowngrade.knowledgeSourceId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">Inspect Knowledge source <ArrowRight className="size-3" /></Link>
        </Surface>

        <Surface className="border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] p-4">
          <div className="flex items-center gap-2"><Gauge className="size-4 text-[var(--warning)]" /><h2 className="text-sm font-semibold">AI Quality gate</h2></div>
          <div className="mt-3 flex items-center gap-2"><Badge tone="warning">REGRESSION</Badge><span className="text-sm font-semibold text-[var(--danger)]">{data.qualityRegressionGate.deltaPercentagePoints}pp</span></div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{data.qualityRegressionGate.label}: {data.qualityRegressionGate.effect}</p>
          <Link href={`/ai-quality?tab=evaluations&suite=${data.qualityRegressionGate.suiteId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">Open evaluation <ArrowRight className="size-3" /></Link>
        </Surface>
      </div>

      <Surface className="p-4">
        <div className="text-sm font-semibold">Rollout ladder</div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Automation expands by explicit deployment state, not by a universal AI confidence threshold.</p>
        <div className="mt-4 grid grid-cols-3 gap-1 sm:grid-cols-6">
          {rolloutOptions.map((item) => <div key={item.label} className={cn("rounded-md border p-2 text-center", item.mode === "paused" ? "border-[color-mix(in_srgb,var(--danger)_30%,var(--border))]" : "border-[var(--border)] bg-[var(--surface-2)]")}><div className="text-[10px] font-semibold uppercase tracking-[0.06em]">{item.mode}</div><div className="mt-1 text-sm font-semibold">{item.percentage}%</div></div>)}
        </div>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.rollouts.map((rollout) => <RolloutCard key={rollout.id} rollout={rollout} override={pausedAll ? { mode: "paused", percentage: 0 } : overrides[rollout.id]} onChange={(mode, percentage) => changeRollout(rollout, mode, percentage)} />)}
      </div>
    </div>
  );
}
