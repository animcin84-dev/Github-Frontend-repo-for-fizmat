"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const commands = [
  ["Overview", "/overview"],
  ["Inbox", "/inbox"],
  ["Intelligence", "/intelligence"],
  ["Knowledge", "/knowledge"],
  ["AI Quality", "/ai-quality"],
  ["Automation", "/automation"],
  ["Automation · Pending approvals", "/automation?tab=overview"],
  ["Automation · Policies", "/automation?tab=policies"],
  ["Automation · Audit log", "/automation?tab=audit"],
  ["Integrations", "/integrations"],
] as const;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => commands.filter(([label]) => label.toLowerCase().includes(query.toLowerCase())), [query]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-[14vh]" role="presentation" onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-12 items-center gap-2 border-b border-[var(--border)] px-3">
          <Search className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Go to page…" className="h-full flex-1 bg-transparent text-sm outline-none" />
          <button className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]" onClick={() => setOpen(false)} aria-label="Close command palette"><X className="size-4" /></button>
        </div>
        <div className="max-h-72 overflow-auto p-2">
          {filtered.map(([label, href]) => (
            <button key={href} onClick={() => { setOpen(false); setQuery(""); router.push(href); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <span>{label}</span><span className="text-xs text-[var(--muted-foreground)]">{href}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
