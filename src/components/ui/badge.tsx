import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "ai";

const toneClass: Record<Tone, string> = {
  neutral: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-foreground)]",
  info: "border-[color-mix(in_srgb,var(--info)_35%,transparent)] bg-[color-mix(in_srgb,var(--info)_10%,transparent)] text-[var(--info)]",
  success: "border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]",
  warning: "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]",
  danger: "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]",
  ai: "border-[color-mix(in_srgb,var(--ai)_35%,transparent)] bg-[color-mix(in_srgb,var(--ai)_10%,transparent)] text-[var(--ai)]",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium", toneClass[tone], className)}>{children}</span>;
}
