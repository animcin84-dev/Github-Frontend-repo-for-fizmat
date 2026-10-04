"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
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
  const [priority, setPriority] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [search, setSearch] = useState("");
  if (list.isLoading || integration.isLoading) return <LoadingState label="Loading operational snapshot…" />;
  if (list.isError || integration.isError) return <ErrorState detail="Overview unavailable. The operational data could not be loaded." />;
  const conversations = list.data ?? [];
  const real = integration.data?.mode === "database";
  const open = conversations.filter((item) => item.status !== "resolved");
  const unread = conversations.filter((item) => item.unread);
  const triaged = conversations.filter((item) => item.analysisState === "completed");
  const untriaged = conversations.filter((item) => item.priority === "untriaged");
  const attention = conversations.filter((item) => item.priority === "critical" || item.priority === "high");
  const visible = conversations.filter((item) => (view !== "open" || item.status !== "resolved") && (view !== "unread" || item.unread) && (channel === "all" || item.channel === channel) && (!priority || item.priority === priority) && (!analysis || item.analysisState === analysis) && (!search.trim() || `${item.subject} ${item.customer.name} ${item.preview}`.toLowerCase().includes(search.trim().toLowerCase())));
  const current = visible.find((item) => item.id === selected) ?? visible[0];
  const channels = ["email", "whatsapp", "web", "api"].map((name) => ({ label: name === "email" ? "Email" : name === "whatsapp" ? "WhatsApp" : name === "web" ? "Web" : "Other", value: conversations.filter((item) => name === "api" ? !["email", "whatsapp", "web"].includes(item.channel) : item.channel === name).length, marker: name === "email" ? "@" : name === "whatsapp" ? "W" : name === "web" ? "↗" : "··" }));
  const summaryOptions = [{ label: "Pending", value: conversations.filter((item) => item.analysisState === "pending").length }, { label: real ? "Persisted triage" : "Demo analysis", value: real ? triaged.length : conversations.filter((item) => item.analysisState === "simulated").length }, { label: "Failed", value: conversations.filter((item) => item.analysisState === "failed").length }];
  return <div className="si-page">
    <RouteHeader title="Overview" note={<Badge tone="info">{real ? "Database workspace" : "Demo workspace"}</Badge>} actions={<ReferenceLink href="/inbox">Open inbox ↗</ReferenceLink>} />
    <ReferenceSummary metrics={[{label:"Open conversations",value:open.length.toLocaleString(),note:"Stored in this workspace"},{label:"Needs attention",value:attention.length.toLocaleString(),note:"High or critical priority"},{label:"Untriaged",value:untriaged.length.toLocaleString(),note:"Waiting for human analysis"}]} activity={channels} activityLabel="Stored conversations by channel" signal={{label:real ? "Completed real analyses" : "Simulated analyses",value:real ? triaged.length : summaryOptions[1].value,note:real ? "Persisted" : "Demo",options:summaryOptions,action:<ReferenceLink href="/ai-quality">Quality ↗</ReferenceLink>}} />
    <FilterHinge count={[channel !== "all", Boolean(priority), Boolean(analysis), Boolean(search.trim())].filter(Boolean).length}>
      <select aria-label="Overview channel" value={channel} onChange={(event) => setChannel(event.target.value)}><option value="all">All channels</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="web">Web</option></select>
      <select aria-label="Overview priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option>{["untriaged", "low", "medium", "high", "critical"].map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Overview analysis" value={analysis} onChange={(event) => setAnalysis(event.target.value)}><option value="">All analysis states</option>{["pending", "running", "completed", "failed", ...(!real ? ["simulated"] : [])].map((value) => <option key={value}>{value}</option>)}</select>
      <div className="si-inbox-search"><input aria-label="Search Overview conversations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" /></div>
    </FilterHinge>
    <OperationalWorkspace detailKey={current?.id} className="si-overview-workspace" title="Conversations" tabs={<WorkspaceTabs items={[{id:"all",label:"All",count:conversations.length},{id:"unread",label:"Unread",count:unread.length},{id:"open",label:"Open",count:open.length}]} active={view} onChange={setView} />} master={<>
      {visible.slice(0, 12).map((item) => <button key={item.id} className={`si-reference-row si-overview-row ${current?.id === item.id ? "is-selected" : ""}`} aria-pressed={current?.id === item.id} onClick={() => setSelected(item.id)}><span className="si-mini-avatar relative">{item.customer.name.slice(0,2).toUpperCase()}{item.unread ? <span aria-label="Unread" className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[var(--accent)]" /> : null}</span><span className="si-row-copy"><strong>{item.subject}</strong><span className="truncate">{item.customer.name} · {item.preview}</span><span>{item.providerLabel ?? item.channel} · Analysis {item.analysisState ?? "pending"}</span></span><span className="si-row-meta"><Badge tone={item.priority === "critical" ? "danger" : item.priority === "high" ? "warning" : "neutral"}>{item.priority === "untriaged" ? "Untriaged" : item.priority}</Badge><span>{formatDistanceToNowStrict(new Date(item.updatedAt), { addSuffix: true })}</span></span></button>)}
      {!visible.length ? <div className="si-empty-inset">No conversations match this view.</div> : null}
      {visible.length > 12 ? <div className="px-3 pt-3 text-[10px]">Showing 12 of {visible.length} · <Link href="/inbox" className="underline">View queue</Link></div> : null}
    </>} detail={current ? <>
      <div className="si-detail-header"><div className="min-w-0"><div className="si-label">Conversation details</div><h2 className="max-w-[470px]">{current.subject}</h2></div><div className="text-right shrink-0"><div className="si-label">Customer</div><div className="text-sm">{current.customer.name}</div><Badge>{current.providerLabel ?? current.channel}</Badge></div></div>
      <div className="si-detail-grid"><div className="si-detail-tile"><span>Priority</span><strong className="capitalize">{current.priority}</strong><span>{current.priority === "untriaged" ? "Analysis pending" : "Triage classification"}</span></div><div className="si-detail-tile"><span>Category</span><strong>{current.category}</strong><span>{current.analysisState === "completed" ? "Real analysis stored" : current.analysisState === "simulated" ? "Demo classification" : "Not analyzed yet"}</span></div><div className="si-detail-tile"><span>Status</span><strong className="capitalize">{current.status.replaceAll("_", " ")}</strong><span>Human reply required</span></div></div>
      <div role="region" aria-label="Selected conversation summary" tabIndex={0} className="si-overview-context"><section><h3>Latest message</h3><p className="whitespace-pre-wrap">{current.preview}</p><dl><div><dt className="si-label">Customer</dt><dd>{current.customer.name}</dd></div><div><dt className="si-label">Last activity</dt><dd>{formatDistanceToNowStrict(new Date(current.updatedAt), { addSuffix: true })}</dd></div><div><dt className="si-label">Channel</dt><dd>{current.providerLabel ?? current.channel}</dd></div><div><dt className="si-label">Unread</dt><dd>{current.unread ? "Needs review" : "Read"}</dd></div></dl></section><section><h3>Operator handoff</h3><p>{current.analysisState === "completed" ? "Persisted triage is available in Inbox, with provider provenance and application priority rules." : current.analysisState === "simulated" ? "Demo classification is available in the simulated Inbox workflow." : current.analysisState === "failed" ? "Analysis failed. Open the conversation to inspect the recorded failure and retry explicitly." : "Analysis is pending. Open the conversation to inspect its messages and run triage explicitly."}</p><p className="mt-2">{real ? "Customer replies require human review. Knowledge evidence and automation readiness have not been generated." : "Demo replies and action previews remain simulations."}</p></section></div>
      <DetailBand metrics={[{label:"Analysis",value:current.analysisState ?? "Pending"},{label:"Knowledge",value:real ? "Not generated" : "Demo evidence"},{label:"Automation",value:real ? "Not evaluated" : "Simulation"}]} action={<ReferenceLink primary href={`/inbox/${current.id}`}>Open conversation ↗</ReferenceLink>} />
    </> : <div className="si-empty-inset"><h2>No conversation selected</h2><p>{real ? "Connect a mailbox and sync real messages to begin." : "Choose another view to browse demonstration conversations."}</p><ReferenceLink href="/integrations">Open integrations</ReferenceLink></div>} />
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--muted-foreground)]"><span>{real ? "Counts reflect persisted conversations" : "Fixture data · demonstration only"}</span><Link href="/integrations" className="underline">Manage integrations</Link><Link href="/ai-quality?tab=failures" className="underline">Inspect failure examples</Link></div>
  </div>;
}
