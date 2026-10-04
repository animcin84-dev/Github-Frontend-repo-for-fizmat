"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  GitCommitHorizontal,
  Languages,
  MessageSquareText,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailBand, FilterHinge, OperationalWorkspace, ReferenceLink, ReferenceSummary, RouteHeader, WorkspaceTabs } from "@/components/reference/reference-layout";
import type { ConversationPriority, EmergingIssue, Priority } from "@/lib/domain";
import { knowledgeSources, resolveDetail } from "@/lib/mocks/data";

const severityTone: Record<Priority, "neutral" | "info" | "warning" | "danger"> = { low: "neutral", medium: "info", high: "warning", critical: "danger" };
const conversationPriorityTone: Record<ConversationPriority, "neutral" | "info" | "warning" | "danger"> = { untriaged: "neutral", low: "neutral", medium: "info", high: "warning", critical: "danger" };

export function IntelligenceIssueWorkspace({ issue }: { issue: EmergingIssue }) {
  const [mockState, setMockState] = useState<string>(issue.status);
  const representatives = issue.representativeConversationIds.map(resolveDetail);
  const relatedSources = issue.relatedKnowledgeIds.map((id) => knowledgeSources.find((source) => source.id === id)).filter((source): source is NonNullable<typeof source> => Boolean(source));
  const marker = issue.timeline.find((point) => point.marker);
  const chartData = issue.timeline.map((point) => ({ ...point, baselineRange: [point.baselineLow, point.baselineHigh] }));

  const action = (state: string, message: string) => {
    setMockState(state);
    toast.success(message, { description: "Change applies to this session." });
  };

  return <div className="si-page">
    <RouteHeader title="Intelligence" note={<Badge>Issue investigation</Badge>} actions={<ReferenceLink href="/intelligence"><ArrowLeft size={13}/>Issue feed</ReferenceLink>} />
    <ReferenceSummary metrics={[{label:"Affected conversations",value:issue.conversationCount},{label:"Affected customers",value:issue.uniqueCustomerCount},{label:"Growth vs baseline",value:`+${issue.growthPercent}%`}]} activity={issue.timeline.filter((_, index) => index % 4 === 0).slice(-4).map((point) => ({label:point.time,value:point.actual,marker:"↗"}))} activityLabel="Issue timeline" signal={{label:"Evidence sample",value:issue.evidenceSummary.sampleSize,note:"Issue dataset",options:issue.evidenceSummary.languages.slice(0,3).map((entry) => ({label:entry.locale,value:entry.count})),action:<ReferenceLink href={`/automation?tab=procedures&procedure=${issue.id === "issue-duplicate-payment" ? "procedure-refund" : "procedure-subscription-cancel"}`}>Review ↗</ReferenceLink>}} />
    <FilterHinge label="Investigation context"><Badge>{issue.relatedProductArea}</Badge><Badge tone={severityTone[issue.severity]}>{issue.severity}</Badge><span className="si-metric-note">Observed signal · root cause unconfirmed</span></FilterHinge>
    <OperationalWorkspace className="si-route-workspace" title="Representative conversations" tabs={<WorkspaceTabs label="Investigation status" items={[{id:"watching",label:"Watch"},{id:"incident",label:"Incident"},{id:"resolved",label:"Resolved"}]} active={mockState} onChange={(state) => action(state,`Issue marked ${state} for this session`)} />} master={<>
      {representatives.map((conversation) => <Link key={conversation.id} href={`/inbox/${conversation.id}`} className="si-reference-row"><span className="si-mini-avatar">{conversation.customer.name.slice(0,2).toUpperCase()}</span><span className="si-row-copy"><strong>{conversation.customer.name}</strong><span>{conversation.id} · {conversation.category}</span></span><Badge tone={conversationPriorityTone[conversation.priority]}>{conversation.priority}</Badge><ArrowRight size={13}/></Link>)}
      <div className="si-pane-heading mt-4">Common phrases / intents</div>{issue.commonPhrases.map((phrase) => <div key={phrase.phrase} className="si-reference-row"><span className="si-row-copy"><strong>{phrase.phrase}</strong><span>{phrase.count} conversations</span></span></div>)}
    </>} detail={<>
      <div className="si-detail-scroll">
        <div className="si-detail-header"><div><div className="si-label">Selected issue · {issue.owner ?? "Unassigned"}</div><h2>{issue.title}</h2></div><Badge tone={mockState === "incident" ? "danger" : "neutral"}>{mockState}</Badge></div>
        <p className="mb-3 text-xs leading-5">{issue.summary}</p>
        <div className="si-detail-grid"><div className="si-detail-tile"><span>Baseline</span><strong>{issue.baselinePerHour.join("–")}/h</strong><span>Expected volume</span></div><div className="si-detail-tile"><span>Current volume</span><strong>{issue.currentPerHour}/h</strong><span>{issue.evidenceSummary.windowLabel}</span></div><div className="si-detail-tile"><span>Evidence state</span><strong className="capitalize">{issue.evidenceState.replaceAll("_"," ")}</strong><span>Not a confirmed cause</span></div></div>
        <section className="si-signal-chart"><h3 className="px-3 pt-3 text-xs font-medium">Growth timeline</h3><div className="h-[154px] p-2"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{left:-12,right:12,top:12,bottom:0}}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="time" interval={3} tickLine={false} axisLine={false} tick={{fontSize:10,fill:"var(--muted-foreground)"}}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:10,fill:"var(--muted-foreground)"}} width={38}/><Tooltip contentStyle={{borderRadius:14,background:"#eff5f9",color:"#20303d",fontSize:11}}/><Area type="monotone" dataKey="baselineRange" name="Expected range" stroke="var(--border-strong)" fill="var(--surface-3)" fillOpacity={.6}/><Area type="monotone" dataKey="actual" name="Observed" stroke="var(--warning)" fill="color-mix(in srgb,var(--warning) 14%,transparent)" strokeWidth={2}/>{marker ? <ReferenceLine x={marker.time} stroke="var(--ai)" strokeDasharray="4 4"/> : null}</AreaChart></ResponsiveContainer></div></section>
        <section className="mt-4"><h3 className="flex items-center gap-2 text-xs font-medium"><DatabaseZap size={14}/>Related knowledge</h3><p className="mt-1 text-[11px]">Sources explain answer quality or policy ambiguity; they do not prove the issue.</p><div className="mt-2 flex flex-wrap gap-2">{relatedSources.map((source) => <ReferenceLink key={source.id} href={`/knowledge?tab=sources&source=${source.id}`}>{source.title}<ArrowRight size={13}/></ReferenceLink>)}</div></section>
        <section className="mt-4"><h3 className="flex items-center gap-2 text-xs font-medium"><GitCommitHorizontal size={14}/>Correlation candidates</h3>{issue.correlationCandidates.length ? issue.correlationCandidates.map((candidate) => <div key={candidate.label} className="mt-2 rounded-[16px] border border-[var(--border)] p-3 text-xs"><div className="flex justify-between gap-3"><strong>{candidate.label}</strong><Badge>{candidate.strength}</Badge></div><p className="mt-2 leading-5">{candidate.reason}</p>{candidate.eventAt ? <p className="mt-2 text-[10px]">Event {new Date(candidate.eventAt).toISOString().slice(11,16)} UTC · first signal {candidate.firstSignalAt ? new Date(candidate.firstSignalAt).toISOString().slice(11,16) : "—"} UTC</p> : null}<p className="mt-2 font-medium text-[var(--warning)]">{candidate.disclaimer}</p></div>) : <p className="mt-2 text-xs">No meaningful candidate crossed the display threshold.</p>}</section>
        <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => action("watching","Issue added to watch list")}><BellRing size={13}/>Watch issue</Button><Button size="sm" onClick={() => action("assigned","Owner selected for this session")}><UserRoundCheck size={13}/>Assign owner</Button><Button size="sm" onClick={() => action("resolved","Issue marked resolved for this session")}><CheckCircle2 size={13}/>Mark resolved</Button></div>
        <p className="mt-3 text-[11px]">Controls update the current session. Incident publishing is not connected.</p>
      </div>
      <DetailBand metrics={[{label:"Conversations",value:issue.conversationCount},{label:"Customers",value:issue.uniqueCustomerCount},{label:"Active",value:`${Math.floor(issue.activeMinutes/60)}h ${issue.activeMinutes%60}m`}]} action={<Button variant="primary" size="sm" onClick={() => action("incident","Incident draft created")}><AlertTriangle size={13}/>Create incident</Button>} />
    </>} />
  </div>;
}
