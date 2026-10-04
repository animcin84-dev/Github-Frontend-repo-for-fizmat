"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, SlidersHorizontal } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const WorkspacePanelContext = createContext<string | undefined>(undefined);

export function RouteHeader({ title, actions, note }: { title: string; actions?: ReactNode; note?: ReactNode }) {
  const router = useRouter();
  return <header className="si-page-header"><div className="si-title-group"><button className="si-circle-control" aria-label="Back to overview" onClick={() => router.push("/overview")}><ArrowLeft size={16} /></button><h1 className="si-page-title">{title}</h1></div><div className="si-header-actions">{note}{actions}</div></header>;
}

export interface ReferenceMetric { label: string; value: string | number; note?: string }
export interface ActivityPoint { label: string; value: number; marker?: string }
export function ReferenceSummary({ metrics, activity = [], activityLabel = "Activity", signal, children }: {
  metrics: ReferenceMetric[]; activity?: ActivityPoint[]; activityLabel?: string;
  signal: { label: string; value: string | number; note?: string; options: ReferenceMetric[]; active?: number; action?: ReactNode };
  children?: ReactNode;
}) {
  const max = Math.max(1, ...activity.map((point) => point.value));
  return <section className="si-summary-grid" aria-label="Workspace summary"><div className="si-summary-primary"><div className="si-metric-triplet">{metrics.slice(0, 3).map((item) => <div key={item.label}><div className="si-label">{item.label}</div><div className="si-display-metric">{item.value}</div>{item.note ? <div className="si-metric-note">{item.note}</div> : null}</div>)}</div><div className="si-activity-track" aria-label={activityLabel}>{activity.length ? activity.map((point, index) => <div className="si-activity-point" key={`${point.label}-${index}`}><div className="si-label">{point.label}</div><div className="si-track-line"><span style={{width:`${point.value / max * 100}%`}} /></div><div className="si-activity-markers"><span className="si-mini-avatar">{point.marker ?? point.value}</span><span className="si-metric-note">{point.value.toLocaleString()}</span></div></div>) : <div className="si-metric-note">Activity history not available</div>}</div>{children}</div><div className="si-summary-signal"><div className="si-signal-top"><div><div className="si-label">{signal.label}</div><div className="si-display-metric">{signal.value} {signal.note ? <span className="si-signal-note">{signal.note}</span> : null}</div></div><ArrowUpRight size={16} aria-hidden="true" /></div><div className="si-option-row">{signal.options.map((item, index) => <div className={cn("si-option-tile", index === (signal.active ?? 1) && "is-active")} key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}{signal.action ? <div className="si-signal-action">{signal.action}</div> : null}</div></div></section>;
}

export function FilterHinge({ children, count = 0, label = "Active filters" }: { children?: ReactNode; count?: number; label?: string }) {
  return <div className="si-filter-hinge"><span className="si-filter-label">{label}<span className="si-count-dot">{count}</span></span>{children}</div>;
}

export function WorkspaceTabs({ items, active, onChange, label = "Workspace views" }: { items: Array<{id:string;label:string;count?:number}>; active:string; onChange:(id:string)=>void; label?:string }) {
  const reduced = useReducedMotion();
  const panelId = useContext(WorkspacePanelContext);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  return <div role="tablist" aria-label={label} className="si-tab-bridge">{items.map((item, index) => <button ref={(node) => { buttons.current[index] = node; }} role="tab" aria-controls={panelId} aria-selected={active === item.id} tabIndex={active === item.id ? 0 : -1} key={item.id} onClick={() => onChange(item.id)} onKeyDown={(event) => {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index + items.length - 1) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    onChange(items[next].id);
    buttons.current[next]?.focus();
  }}>{active === item.id ? <motion.span className="si-active-pill" layoutId={`bridge-${label}`} transition={{duration:reduced ? 0 : .18, ease:[.22,1,.36,1]}} /> : null}<span>{item.label}{item.count !== undefined ? <small>{item.count}</small> : null}</span></button>)}</div>;
}

export function OperationalWorkspace({ master, detail, tabs, title, className, detailKey }: {master:ReactNode;detail:ReactNode;tabs?:ReactNode;title?:string;className?:string;detailKey?:string}) {
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || !detailKey) return;
    // Animate the selected identity without remounting the pane or moving its action band.
    const header = panel.current?.querySelector(".si-detail-header, .si-thread-header") ?? panel.current?.querySelector("h2");
    const animation = header?.animate([{ opacity: .65, transform: "translateX(4px)" }, { opacity: 1, transform: "translateX(0)" }], { duration: 200, easing: "cubic-bezier(.22,1,.36,1)" });
    return () => animation?.cancel();
  }, [detailKey, reduced]);
  return <WorkspacePanelContext.Provider value={panelId}><section className={cn("si-operational-workspace", className)} aria-label={title ?? "Operational workspace"}>{tabs ? <div className="si-workspace-notch">{tabs}</div> : null}<div className="si-master-pane">{title ? <div className="si-pane-heading">{title}<SlidersHorizontal size={14} aria-hidden="true" /></div> : null}{master}</div><div ref={panel} id={panelId} role={tabs ? "tabpanel" : undefined} aria-label={tabs ? `${title ?? "Workspace"} details` : undefined} className="si-detail-pane">{detail}</div></section></WorkspacePanelContext.Provider>;
}

export function DetailBand({ metrics, action }: {metrics:ReferenceMetric[];action?:ReactNode}) {
  return <div className="si-detail-band">{metrics.map((metric) => <div key={metric.label}><div className="si-label">{metric.label}</div><strong>{metric.value}</strong></div>)}{action}</div>;
}

export function ReferenceLink({ href, children, primary = false }: {href:string;children:ReactNode;primary?:boolean}) {
  return <Link className={cn("si-action-pill", primary && "is-primary")} href={href}>{children}</Link>;
}
