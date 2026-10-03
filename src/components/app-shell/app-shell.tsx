"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  BrainCircuit,
  Inbox,
  LayoutDashboard,
  Library,
  Plug,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/intelligence", label: "Intelligence", icon: BrainCircuit },
  { href: "/knowledge", label: "Knowledge", icon: Library },
  { href: "/ai-quality", label: "AI Quality", icon: Activity },
  { href: "/automation", label: "Automation", icon: ShieldCheck },
  { href: "/integrations", label: "Integrations", icon: Plug },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 border-r border-[var(--border)] bg-[var(--sidebar)] lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-4">
          <div className="grid size-7 place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-1)]"><Bot className="size-4" aria-hidden="true" /></div>
          <div className="min-w-0"><div className="truncate text-sm font-semibold">Support Intelligence</div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Control layer</div></div>
        </div>
        <nav className="flex-1 space-y-1 p-2" aria-label="Primary navigation">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return <Link key={href} href={href} className={cn("flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]", active && "bg-[var(--surface-2)] font-medium text-[var(--foreground)]")}><Icon className="size-4" aria-hidden="true" />{label}{href === "/inbox" ? <Badge className="ml-auto">47</Badge> : null}</Link>;
          })}
        </nav>
        <div className="border-t border-[var(--border)] p-2">
          <Link href="/settings" className="flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"><Settings className="size-4" />Settings</Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,transparent)] px-3 backdrop-blur md:px-5">
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><span className="font-medium text-[var(--foreground)]">Fizmat Demo</span><span>·</span><span>Shadow + Copilot</span></div>
          <div className="flex items-center gap-1">
            <button onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))} className="hidden h-8 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] sm:flex" aria-label="Open command palette"><Search className="size-3.5" />Search <kbd className="rounded border border-[var(--border)] px-1 py-0.5 font-mono text-[10px]">⌘K</kbd></button>
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-[calc(100dvh-48px)]">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
