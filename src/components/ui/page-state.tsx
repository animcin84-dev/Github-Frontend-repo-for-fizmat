import { AlertTriangle, LoaderCircle } from "lucide-react";

export function LoadingState({ label = "Loading workspace…", compact = false }: { label?: string; compact?: boolean }) {
  if (compact) return <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]"><LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />{label}</div>;
  return <div className="si-page si-loading-workspace" aria-busy="true"><p role="status" className="si-loading-label">{label}</p><div aria-hidden="true"><div className="si-page-header"><div className="si-loading-bar si-loading-title" /></div><div className="si-summary-grid"><div className="si-summary-primary si-loading-block" /><div className="si-summary-signal si-loading-block" /></div><div className="si-filter-hinge"><div className="si-loading-bar" /></div><div className="si-operational-workspace si-route-workspace"><div className="si-master-pane">{[0, 1, 2, 3].map((row) => <div key={row} className="si-loading-bar si-loading-row" />)}</div><div className="si-detail-pane"><div className="si-loading-bar si-loading-title" /><div className="si-detail-grid">{[0, 1, 2].map((tile) => <div key={tile} className="si-detail-tile si-loading-block" />)}</div></div></div></div></div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center text-center"><p className="text-sm font-medium">{title}</p><p className="mt-1 max-w-md text-sm text-[var(--muted-foreground)]">{detail}</p></div>;
}

export function ErrorState({ detail }: { detail: string }) {
  return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--danger)]"><AlertTriangle className="size-4" aria-hidden="true" />{detail}</div>;
}
