"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { DetailBand, FilterHinge, OperationalWorkspace, ReferenceLink, ReferenceSummary, RouteHeader, WorkspaceTabs } from "@/components/reference/reference-layout";
import { getConversationList, getInboxIntegrationStatus } from "@/lib/client/conversation-api";

export function OverviewDashboard() {
  const list = useQuery({ queryKey: ["conversations"], queryFn: getConversationList });
  const integration = useQuery({ queryKey: ["inbox-integration-status"], queryFn: getInboxIntegrationStatus });
  const [view, setView] = useState("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [channel, setChannel] = useState("all");
  if (list.isLoading || integration.isLoading) return <LoadingState label="Loading operational snapshot…" />;
  if (list.isError || integration.isError) return <ErrorState detail="Overview unavailable. The operational data could not be loaded." />;
  const conversations = list.data ?? [];
  const real = integration.data?.mode === "database";
  const open = conversations.filter((item) => item.status !== "resolved");
  const unread = conversations.filter((item) => item.unread);
  const triaged = conversations.filter((item) => item.analysisState === "completed");
  const untriaged = conversations.filter((item) => item.priority === "untriaged");
  const attention = conversations.filter((item) => item.priority === "critical" || item.priority === "high");
  const visible = conversations.filter((item) => (view !== "open" || item.status !== "resolved") && (view !== "unread" || item.unread) && (channel === "all" || item.channel === channel));
  const current = visible.find((item) => item.id === selected) ?? visible[0];
  const channels = ["email", "whatsapp", "web", "api"].map((name) => ({ label: name === "email" ? "Email" : name === "whatsapp" ? "WhatsApp" : name === "web" ? "Web" : "Other", value: conversations.filter((item) => name === "api" ? !["email", "whatsapp", "web"].includes(item.channel) : item.channel === name).length, marker: name === "email" ? "@" : name === "whatsapp" ? "W" : name === "web" ? "↗" : "··" }));
  const summaryOptions = [{ label: "Pending", value: conversations.filter((item) => item.analysisState === "pending").length }, { label: real ? "Persisted triage" : "Demo analysis", value: real ? triaged.length : conversations.filter((item) => item.analysisState === "simulated").length }, { label: "Failed", value: conversations.filter((item) => item.analysisState === "failed").length }];
  return <div className="si-page">
    <RouteHeader title="Overview" note={<Badge tone="info">{real ? "Database workspace" : "Demo workspace"}</Badge>} actions={<ReferenceLink href="/inbox">Open inbox ↗</ReferenceLink>} />
    <ReferenceSummary metrics={[{label:"Open conversations",value:open.length.toLocaleString(),note:"Stored in this workspace"},{label:"Needs attention",value:attention.length.toLocaleString(),note:"High or critical priority"},{label:"Untriaged",value:untriaged.length.toLocaleString(),note:"Waiting for human analysis"}]} activity={channels} activityLabel="Stored conversations by channel" signal={{label:real ? "Completed real analyses" : "Simulated analyses",value:real ? triaged.length : summaryOptions[1].value,note:real ? "Persisted" : "Demo",options:summaryOptions,action:<ReferenceLink href="/ai-quality">Quality ↗</ReferenceLink>}} />
    <FilterHinge count={channel === "all" ? 0 : 1}>
      <select aria-label="Overview channel" value={channel} onChange={(event) => setChannel(event.target.value)}><option value="all">All channels</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="web">Web</option></select>
      <span className="si-metric-note">{real ? "Counts reflect persisted conversations" : "Fixture data · demonstration only"}</span>
      <ReferenceLink href="/integrations">Manage integrations</ReferenceLink>
      <ReferenceLink href="/ai-quality?tab=failures">Inspect failure examples</ReferenceLink>
    </FilterHinge>
    <OperationalWorkspace className="si-overview-workspace" title="Conversations" tabs={<WorkspaceTabs items={[{id:"all",label:"All",count:conversations.length},{id:"unread",label:"Unread",count:unread.length},{id:"open",label:"Open",count:open.length}]} active={view} onChange={setView} />} master={<>
      {visible.slice(0, 5).map((item) => <button key={item.id} className={`si-reference-row ${current?.id === item.id ? "is-selected" : ""}`} aria-pressed={current?.id === item.id} onClick={() => setSelected(item.id)}><span className="si-mini-avatar">{item.customer.name.slice(0,2).toUpperCase()}</span><span className="si-row-copy"><strong>{item.subject}</strong><span>{item.providerLabel ?? item.channel} · {item.customer.name}</span></span><span className="si-row-value">{item.priority === "untriaged" ? "Untriaged" : item.priority}</span></button>)}
      {!visible.length ? <div className="si-empty-inset">No conversations match this view.</div> : null}
      {visible.length > 5 ? <div className="px-3 pt-3 text-[10px]">Showing 5 of {visible.length} · <Link href="/inbox" className="underline">View queue</Link></div> : null}
    </>} detail={current ? <>
      <div className="si-detail-header"><div className="min-w-0"><div className="si-label">Conversation details</div><h2 className="max-w-[470px]">{current.subject}</h2></div><div className="text-right shrink-0"><div className="si-label">Customer</div><div className="text-sm">{current.customer.name}</div><Badge>{current.providerLabel ?? current.channel}</Badge></div></div>
      <div className="si-detail-grid"><div className="si-detail-tile"><span>Priority</span><strong className="capitalize">{current.priority}</strong><span>{current.priority === "untriaged" ? "Analysis pending" : "Triage classification"}</span></div><div className="si-detail-tile"><span>Category</span><strong>{current.category}</strong><span>{current.analysisState === "completed" ? "Real analysis stored" : current.analysisState === "simulated" ? "Demo classification" : "Not analyzed yet"}</span></div><div className="si-detail-tile"><span>Status</span><strong className="capitalize">{current.status.replaceAll("_", " ")}</strong><span>Human reply required</span></div></div>
      <div className="si-overview-chart" aria-label="Stored conversation counts by channel"><ResponsiveContainer width="100%" height="100%"><AreaChart data={channels} margin={{top:8,left:0,right:8,bottom:0}}><defs><linearGradient id="overview-counts" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#324d5f" stopOpacity={.3}/><stop offset="100%" stopColor="#324d5f" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="label" tick={{fontSize:10,fill:"#203543"}} tickLine={false} axisLine={false} /><Tooltip contentStyle={{borderRadius:14,fontSize:11,color:"#203543",background:"#eef4f8"}} /><Area dataKey="value" name="Conversations" stroke="#324d5f" fill="url(#overview-counts)" strokeWidth={1.5} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>
      <DetailBand metrics={[{label:"Workspace total",value:conversations.length},{label:"Unread",value:unread.length},{label:"Source",value:current.providerLabel ?? (real ? current.source ?? "Database" : "Demo")}]} action={<ReferenceLink primary href={`/inbox/${current.id}`}>Open conversation ↗</ReferenceLink>} />
    </> : <div className="si-empty-inset"><h2>No conversation selected</h2><p>{real ? "Connect a mailbox and sync real messages to begin." : "Choose another view to browse demonstration conversations."}</p><ReferenceLink href="/integrations">Open integrations</ReferenceLink></div>} />
  </div>;
}
