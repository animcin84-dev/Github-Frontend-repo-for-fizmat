"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Search } from "lucide-react";
import { useState } from "react";
import { useQueryState } from "nuqs";
import { AutomationOverview } from "@/components/automation/overview/automation-overview";
import { PolicyCenter } from "@/components/automation/policy/policy-center";
import { ProceduresView } from "@/components/automation/procedures/procedures-view";
import { RolloutsView } from "@/components/automation/rollouts/rollouts-view";
import { AuditView } from "@/components/automation/audit/audit-view";
import { ControlPrinciples } from "@/components/automation/shared/automation-ui";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/page-state";
import { DetailBand, FilterHinge, OperationalWorkspace, ReferenceSummary, RouteHeader, WorkspaceTabs, ReferenceLink } from "@/components/reference/reference-layout";
import { getAutomationWorkspace } from "@/lib/mocks/service";
import { cn } from "@/lib/utils";

type Tab = "overview" | "policies" | "procedures" | "rollouts" | "audit";

export function AutomationWorkspace() {
  const query = useQuery({ queryKey: ["automation-workspace"], queryFn: getAutomationWorkspace });
  const [tabRaw, setTabRaw] = useQueryState("tab", { defaultValue: "overview", clearOnDefault: false });

  const [policyId, setPolicyId] = useQueryState("policy", { defaultValue: "" });
  const [procedureId, setProcedureId] = useQueryState("procedure", { defaultValue: "" });
  const [auditId, setAuditId] = useQueryState("auditId", { defaultValue: "" });
  const [intent, setIntent] = useQueryState("intent", { defaultValue: "" });
  const [decision, setDecision] = useQueryState("decision", { defaultValue: "" });
  const [result, setResult] = useQueryState("result", { defaultValue: "" });
  const [search, setSearch] = useState("");
  if (query.isLoading || !query.data) return <LoadingState label="Loading automation control plane…" />;

  const valid: Tab[] = ["overview", "policies", "procedures", "rollouts", "audit"];
  const tab: Tab = valid.includes(tabRaw as Tab) ? tabRaw as Tab : "overview";
  const setTab = (value: Tab) => setTabRaw(value);

  const data = query.data;
  const pending = data.approvals.filter((item) => item.status === "pending").length;
  const needle = search.trim().toLowerCase();
  const matches = (value: string) => !needle || value.toLowerCase().includes(needle);
  const actionLabel = (id: string) => data.actions.find((item) => item.id === id)?.label ?? id;
  const row = (id: string, title: string, note: string, value: string | number, selected: boolean, pick: () => void, label?: string) => <button key={id} aria-label={label} aria-pressed={selected} onClick={pick} className={cn("si-reference-row", selected && "is-selected")}><span className="si-mini-avatar"><ShieldCheck className="size-3.5" /></span><span className="si-row-copy"><strong>{title}</strong><span>{note}</span></span><span className="si-row-value">{value}</span></button>;
  const master = tab === "policies" ? data.policies.filter((item) => matches(`${actionLabel(item.actionId)} ${item.intent} ${item.scope}`)).map((item) => row(item.id, actionLabel(item.actionId), `${item.scope} · ${item.intent}`, item.humanApproval.replaceAll("_", " "), policyId === item.id, () => void setPolicyId(item.id)))
    : tab === "procedures" ? data.procedures.filter((item) => matches(`${item.name} ${item.intent}`)).map((item) => row(item.id, item.name, `${item.status} · ${item.intent}`, `${item.steps.length} steps`, procedureId === item.id, () => void setProcedureId(item.id)))
    : tab === "audit" ? data.auditEvents.filter((item) => matches(`${item.actionId} ${item.intent} ${item.conversationId}`) && (!decision || item.decision === decision) && (!result || item.result === result)).slice(0, 120).map((item) => row(item.id, actionLabel(item.actionId), `${item.conversationId} · ${item.policyVersion}`, item.result.replaceAll("_", " "), auditId === item.id, () => void setAuditId(item.id), `Inspect audit event ${item.id}`))
    : data.readinessExplanations.filter((item) => matches(item.intent)).map((item) => row(item.intent, item.intent, item.currentMode.replaceAll("_", " "), `${item.rolloutPercent}%`, intent === item.intent, () => { void setIntent(item.intent); if (tab === "rollouts") void setTab("overview"); }));

  return <div className="si-page">
    <RouteHeader title="Automation" note={<Badge>Demo control plane</Badge>} actions={<ReferenceLink href="/ai-quality?tab=shadow">Quality gate ↗</ReferenceLink>} />
    <ReferenceSummary metrics={[{label:"Policies",value:data.policies.length,note:"Explicit demo action boundaries"},{label:"Pending approvals",value:pending,note:"Human review required"},{label:"Blocked decisions",value:data.summary.blockedDecisions,note:"Demo policy / prerequisites"}]} activityLabel="Demo procedure states" activity={["active","limited","paused","draft"].map((status) => ({label:status,value:data.procedures.filter((item) => item.status === status).length,marker:status[0].toUpperCase()}))} signal={{label:"Procedure inventory · demo",value:data.procedures.length,note:"controlled workflows",options:[{label:"Replay suites",value:data.procedureSimulations.length},{label:"Approval",value:pending},{label:"Failed runs",value:data.summary.failedExecutions}],action:<ReferenceLink href="/automation?tab=procedures">Review ↗</ReferenceLink>}} />
    <FilterHinge count={[search, tab === "audit" && decision, tab === "audit" && result].filter(Boolean).length}>
      {tab === "audit" ? <><select aria-label="Audit decision filter" value={decision} onChange={(event) => void setDecision(event.target.value || null)}><option value="">All decisions</option><option value="allowed">allowed</option><option value="confirm_customer">confirmation</option><option value="human_approval">human approval</option><option value="blocked">blocked</option></select><select aria-label="Audit result filter" value={result} onChange={(event) => void setResult(event.target.value || null)}><option value="">All results</option><option value="succeeded">succeeded</option><option value="failed">failed</option><option value="rolled_back">rolled back</option><option value="not_executed">not executed</option></select></> : <span className="si-metric-note">Policy → readiness → simulation → approval → execution → verification</span>}
      <label className="si-inbox-search"><Search className="size-3.5" /><input aria-label="Search automation" placeholder="Find policy, procedure or intent" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    </FilterHinge>
    <OperationalWorkspace detailKey={`${tab}:${policyId}:${procedureId}:${auditId}:${intent}`} className="si-route-workspace si-automation-workspace" title={tab === "policies" ? "Action policies" : tab === "procedures" ? "Structured procedures" : tab === "audit" ? "Audit events" : "Intent readiness"} master={master.length ? master : <div className="si-empty-inset">No matching records.</div>} tabs={<WorkspaceTabs label="Automation workspace views" items={valid.map((id) => ({id,label:id[0].toUpperCase()+id.slice(1)}))} active={tab} onChange={(value) => void setTab(value as Tab)} />} detail={<>
      <div className="si-detail-header"><div><div className="si-label">Deterministic demo · no external mutation</div><h2>{tab === "overview" ? "Controlled operation" : tab === "policies" ? "Policy requirements" : tab === "procedures" ? "Procedure & action preview" : tab === "rollouts" ? "Rollout controls" : "Decision & execution trace"}</h2></div><Badge>Human gates retained</Badge></div>
      <div className="si-detail-scroll si-control-diagnostics">
        <div className="si-detail-grid"><div className="si-detail-tile">Policy<strong>Authorizes</strong>Explicit action boundaries</div><div className="si-detail-tile">Simulation<strong>Replays</strong>Stops before mutation</div><div className="si-detail-tile">Verification<strong>Required</strong>Decision ≠ execution result</div></div>
        {tab === "overview" ? <AutomationOverview data={data} embedded /> : null}
        {tab === "policies" ? <PolicyCenter data={data} embedded /> : null}
        {tab === "procedures" ? <ProceduresView data={data} embedded /> : null}
        {tab === "rollouts" ? <RolloutsView data={data} /> : null}
        {tab === "audit" ? <AuditView data={data} embedded /> : null}
      </div>
      <DetailBand metrics={[{label:"Mock actions · 24h",value:data.summary.actionsLast24h},{label:"Approval rate · demo",value:`${Math.round(data.summary.approvalRate * 100)}%`},{label:"Live mutations",value:"None"}]} action={<ReferenceLink primary href={tab === "procedures" ? "/automation?tab=overview" : "/automation?tab=procedures"}>{tab === "procedures" ? "Review approvals" : "Review procedure"}</ReferenceLink>} />
    </>} />
    <div className="mt-3 text-[11px] text-[var(--muted-foreground)]"><ControlPrinciples /></div>
  </div>;
}
