"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BrainCircuit, Inbox, LayoutDashboard, Library, Menu, Plug, Search, Settings, ShieldCheck, Sun } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/intelligence", label: "Intelligence", icon: BrainCircuit },
  { href: "/knowledge", label: "Knowledge", icon: Library },
  { href: "/ai-quality", label: "AI Quality", icon: Activity },
  { href: "/automation", label: "Automation", icon: ShieldCheck },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return <div className="si-shell">
    <header className="si-topbar">
      <div className="flex items-center gap-2">
        <details className="si-mobile-navigation">
          <summary className="si-circle-control list-none" aria-label="Open navigation"><Menu size={16} aria-hidden="true" /></summary>
          <nav className="si-mobile-menu" aria-label="Mobile navigation">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="si-mobile-link" aria-current={isActive(href) ? "page" : undefined} onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}><Icon size={16} aria-hidden="true" />{label}</Link>)}</nav>
        </details>
        <Link href="/overview" className="si-brand" aria-label="Support Intelligence home"><Sun aria-hidden="true" /><span>support intelligence</span></Link>
      </div>
      <nav className="si-top-nav" aria-label="Primary navigation">{nav.slice(0, 6).map(({ href, label }) => <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={cn("si-nav-link", isActive(href) && "is-active")}>{isActive(href) ? <motion.div className="si-active-pill" layoutId="primary-navigation" transition={{ duration: reduced ? 0 : .18, ease: [.22, 1, .36, 1] }} /> : null}<span>{label}</span></Link>)}</nav>
      <div className="si-top-utilities">
        <button className="si-circle-control" aria-label="Open command palette" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}><Search size={14} aria-hidden="true" /></button>
        {nav.slice(6).map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-label={label} title={label} className="si-circle-control" aria-current={isActive(href) ? "page" : undefined}><Icon size={14} aria-hidden="true" /></Link>)}
        <ThemeToggle />
      </div>
    </header>
    <main className="min-w-0">{children}</main>
    <CommandPalette />
  </div>;
}
