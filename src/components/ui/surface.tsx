import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-[var(--border)] bg-[var(--surface-1)]", className)} {...props} />;
}
