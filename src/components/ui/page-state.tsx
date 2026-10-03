import { AlertTriangle, LoaderCircle } from "lucide-react";

export function LoadingState({ label = "Loading workspace…" }: { label?: string }) {
  return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{label}</div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center text-center"><p className="text-sm font-medium">{title}</p><p className="mt-1 max-w-md text-sm text-[var(--muted-foreground)]">{detail}</p></div>;
}

export function ErrorState({ detail }: { detail: string }) {
  return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--danger)]"><AlertTriangle className="size-4" aria-hidden="true" />{detail}</div>;
}
