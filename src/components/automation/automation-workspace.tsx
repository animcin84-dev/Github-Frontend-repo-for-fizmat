"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleDot, ShieldCheck } from "lucide-react";
import { useQueryState } from "nuqs";
import { AutomationOverview } from "@/components/automation/overview/automation-overview";
import { PolicyCenter } from "@/components/automation/policy/policy-center";
import { ProceduresView } from "@/components/automation/procedures/procedures-view";
import { RolloutsView } from "@/components/automation/rollouts/rollouts-view";
import { AuditView } from "@/components/automation/audit/audit-view";
import { ControlPrinciples } from "@/components/automation/shared/automation-ui";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/page-state";
import { Surface } from "@/components/ui/surface";
import { getAutomationWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";

type Tab = "overview" | "policies" | "procedures" | "rollouts" | "audit";

function TabButton({ value, active, setTab, children }: { value: Tab; active: Tab; setTab: (tab: Tab) => void; children: React.ReactNode }) {
  const selected = value === active;
  return (
    <button role="tab" aria-selected={selected} onClick={() => setTab(value)} className={cn("relative h-10 shrink-0 px-3 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]", selected && "text-[var(--foreground)] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]")}>
      {children}
    </button>
  );
}

export function AutomationWorkspace() {
  const query = useQuery({ queryKey: ["automation-workspace"], queryFn: getAutomationWorkspace });
  const [tabRaw, setTabRaw] = useQueryState("tab", { defaultValue: "overview", clearOnDefault: false });

  if (query.isLoading || !query.data) return <LoadingState label="Loading automation control plane…" />;

  const valid: Tab[] = ["overview", "policies", "procedures", "rollouts", "audit"];
  const tab: Tab = valid.includes(tabRaw as Tab) ? tabRaw as Tab : "overview";
  const setTab = (value: Tab) => setTabRaw(value);

  return (
    <div className="si-page mx-auto max-w-[1760px]">
      <div className="si-page-header">
        <div>
          <h1 className="si-page-title">Automation</h1>
          <p className="si-page-subtitle">Policy control plane for when AI may act, what must be verified first, how rollout is constrained, and how every decision can be reconstructed afterward.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]"><Badge tone="success"><CircleDot className="size-3" />Limited live</Badge><span>Controlled execution · deterministic demo</span></div>
      </div>

      <Surface className="mb-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-2">
          <div role="tablist" aria-label="Automation workspace views" className="flex overflow-x-auto">
            <TabButton value="overview" active={tab} setTab={setTab}>Overview</TabButton>
            <TabButton value="policies" active={tab} setTab={setTab}>Policies</TabButton>
            <TabButton value="procedures" active={tab} setTab={setTab}>Procedures</TabButton>
            <TabButton value="rollouts" active={tab} setTab={setTab}>Rollouts</TabButton>
            <TabButton value="audit" active={tab} setTab={setTab}>Audit</TabButton>
          </div>
          <div className="hidden items-center gap-1 text-[10px] text-[var(--muted-foreground)] md:flex"><ShieldCheck className="size-3.5 text-[var(--success)]" />LLM proposes; policy authorizes</div>
        </div>
      </Surface>

      {tab === "overview" ? <AutomationOverview data={query.data} /> : null}
      {tab === "policies" ? <PolicyCenter data={query.data} /> : null}
      {tab === "procedures" ? <ProceduresView data={query.data} /> : null}
      {tab === "rollouts" ? <RolloutsView data={query.data} /> : null}
      {tab === "audit" ? <AuditView data={query.data} /> : null}

      <div className="mt-4"><ControlPrinciples /></div>
    </div>
  );
}
