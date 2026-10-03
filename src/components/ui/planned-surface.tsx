import { Surface } from "@/components/ui/surface";

export function PlannedSurface({ title, subtitle, focus }: { title: string; subtitle: string; focus: string[] }) {
  return <div className="si-page"><div className="si-page-header"><div><h1 className="si-page-title">{title}</h1><p className="si-page-subtitle">{subtitle}</p></div></div><Surface className="max-w-3xl p-5"><p className="text-sm font-medium">This route is scaffolded for the next implementation phase.</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">The foundation is intentionally keeping the surface shallow until its domain workflow is implemented.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{focus.map((item) => <div key={item} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">{item}</div>)}</div></Surface></div>;
}
