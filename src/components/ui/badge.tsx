import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "ai";

const toneClass: Record<Tone, string> = {
  neutral: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-foreground)]",
  info: "border-[color-mix(in_srgb,var(--info)_32%,var(--border))] bg-[color-mix(in_srgb,var(--info)_7%,var(--surface-1))] text-[var(--info)]",
  success: "border-[color-mix(in_srgb,var(--success)_32%,var(--border))] bg-[color-mix(in_srgb,var(--success)_7%,var(--surface-1))] text-[var(--success)]",
  warning: "border-[color-mix(in_srgb,var(--warning)_32%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_7%,var(--surface-1))] text-[var(--warning)]",
  danger: "border-[color-mix(in_srgb,var(--danger)_32%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_7%,var(--surface-1))] text-[var(--danger)]",
  ai: "border-[color-mix(in_srgb,var(--ai)_32%,var(--border))] bg-[color-mix(in_srgb,var(--ai)_7%,var(--surface-1))] text-[var(--ai)]",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium", toneClass[tone], className)}>{children}</span>;
}
