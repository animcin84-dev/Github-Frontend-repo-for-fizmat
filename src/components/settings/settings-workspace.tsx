"use client";

import Link from "next/link";
import { ArrowRight, Bell, Bot, Building2, Database, Mail, Palette, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { DetailBand, FilterHinge, OperationalWorkspace, ReferenceSummary, RouteHeader, WorkspaceTabs } from "@/components/reference/reference-layout";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SectionId = "workspace" | "ai" | "channels" | "notifications" | "appearance" | "security" | "data";
type Group = "general" | "ai" | "security";

const sections = [
  {
    id: "workspace", group: "general", label: "Workspace", icon: Building2,
    status: "Planned", description: "Team and roles are planned. This workspace profile has no settings API or editable fields yet.",
    facts: [{ label: "Product", value: "Support Intelligence" }, { label: "Team members", value: "Unavailable" }, { label: "Roles and permissions", value: "Planned" }],
    topics: ["Team and roles", "Workspace profile", "Member permissions"],
    note: "No workspace name, member count, or permission profile is inferred from the current session.",
    href: "/overview", action: "Open overview",
  },
  {
    id: "ai", group: "ai", label: "AI provider", icon: Bot,
    status: "Server managed", description: "Existing conversation analysis controls and their capability state are available in Inbox.",
    facts: [{ label: "Provider configuration", value: "Server managed" }, { label: "Analysis controls", value: "Inbox" }, { label: "Quality diagnostics", value: "Demo evaluations" }],
    topics: ["Provider readiness", "Conversation analysis", "Evaluation diagnostics"],
    note: "This page does not read credentials or claim that a provider is configured. AI Quality uses the product's explicitly labeled demo evaluation data.",
    href: "/inbox", action: "View analysis capabilities",
  },
  {
    id: "channels", group: "ai", label: "Channels", icon: Mail,
    status: "See integrations", description: "Connectors keep their existing setup, sync and operator controls in Integrations.",
    facts: [{ label: "Mailbox connection", value: "Integrations" }, { label: "Conversation data", value: "Inbox" }, { label: "Connection status", value: "Not read here" }],
    topics: ["Gmail connection and sync", "WhatsApp integration status", "Conversation delivery controls"],
    note: "Open Integrations to inspect current connector status. No mailbox or phone number is exposed or inferred in Settings.",
    href: "/integrations", action: "Open integrations",
  },
  {
    id: "notifications", group: "general", label: "Notifications", icon: Bell,
    status: "Planned", description: "Workspace notification preferences are planned. Delivery schedules and channels cannot be changed here.",
    facts: [{ label: "Delivery preferences", value: "Planned" }, { label: "Digest schedule", value: "Unavailable" }, { label: "Alert routing", value: "Not configurable" }],
    topics: ["Notification preferences", "Digest scheduling", "Team alert routing"],
    note: "No subscription, digest schedule or notification destination has been created by this interface.",
    href: "/inbox", action: "Open inbox",
  },
  {
    id: "appearance", group: "general", label: "Appearance", icon: Palette,
    status: "Local preference", description: "The existing theme control changes this browser's appearance and persists the preference locally.",
    facts: [{ label: "Preference scope", value: "This browser" }, { label: "Theme persistence", value: "Local storage" }, { label: "Workspace style guide", value: "Planned" }],
    topics: ["Light and dark theme", "Browser-local preference", "Future workspace style guide"],
    note: "Without a saved theme preference, the app follows the operating system theme. The theme control is shared with the top navigation.",
    href: "/overview", action: "Open overview",
  },
  {
    id: "security", group: "security", label: "Security", icon: ShieldCheck,
    status: "Planned", description: "Team security settings and permission administration are planned. This page does not report the current authentication or access-control state.",
    facts: [{ label: "Team administration", value: "Planned" }, { label: "Permissions editor", value: "Unavailable" }, { label: "Sensitive actions", value: "Existing workflows" }],
    topics: ["Team access controls", "Permission administration", "Action approval boundaries"],
    note: "Use the existing conversation review and automation policy surfaces for their current operator gates. No security setting is changed here.",
    href: "/automation?tab=policies", action: "View action policies",
  },
  {
    id: "data", group: "security", label: "Data and audit", icon: Database,
    status: "Planned", description: "Retention and workspace audit preferences remain planned. Configuration history is not available on this page.",
    facts: [{ label: "Retention editor", value: "Unavailable" }, { label: "Configuration history", value: "Not available" }, { label: "Audit preferences", value: "Planned" }],
    topics: ["Data retention", "Audit preferences", "Configuration change history"],
    note: "No retention period, audit timestamp or export capability is invented. Existing sync records remain visible through their integration workflow.",
    href: "/integrations", action: "View sync status",
  },
] satisfies Array<{
  id: SectionId; group: Group; label: string; icon: typeof Building2; status: string; description: string;
  facts: Array<{ label: string; value: string }>; topics: string[]; note: string; href: string; action: string;
}>;

export function SettingsWorkspace() {
  const [sectionId, setSectionId] = useState<SectionId>("workspace");
  const [search, setSearch] = useState("");
  const selected = sections.find((section) => section.id === sectionId) ?? sections[0];
  const visible = sections.filter((section) => `${section.label} ${section.topics.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  const groupIndex = selected.group === "general" ? 0 : selected.group === "ai" ? 1 : 2;
  const selectGroup = (group: string) => {
    const section = sections.find((item) => item.group === group);
    if (section) setSectionId(section.id);
  };

  return <div className="si-page">
    <RouteHeader title="Settings" note={<Badge tone="neutral">Configuration scaffold</Badge>} />
    <ReferenceSummary metrics={[
      { label: "Workspace profile", value: "Unavailable", note: "Profile settings are planned" },
      { label: "Team members", value: "Unavailable", note: "Team administration is planned" },
      { label: "Permission settings", value: "Planned", note: "No editable permission profile" },
    ]} activityLabel="Configuration change history" signal={{
      label: "Workspace settings", value: "Planned", note: "Configuration UI",
      options: [{ label: "General", value: "Planned" }, { label: "AI / channels", value: "Existing flows" }, { label: "Security", value: "Planned" }],
      active: groupIndex, action: <Link className="si-action-pill" href="/integrations">Open integrations</Link>,
    }} />
    <FilterHinge label="Sections" count={search.trim() ? 1 : 0}>
      <select aria-label="Settings section" value={selected.id} onChange={(event) => setSectionId(event.target.value as SectionId)}>
        {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
      </select>
      <span className="text-[10px] text-[var(--muted-foreground)]">Read-only workspace configuration · browser theme is local</span>
      <input aria-label="Find settings section" className="ml-auto" placeholder="Find a section" value={search} onChange={(event) => setSearch(event.target.value)} />
    </FilterHinge>
    <OperationalWorkspace detailKey={selected.id} className="si-route-workspace si-settings-workspace" title="Settings categories"
      tabs={<WorkspaceTabs label="Settings groups" active={selected.group} onChange={selectGroup} items={[{ id: "general", label: "General" }, { id: "ai", label: "AI / channels" }, { id: "security", label: "Security / data" }]} />}
      master={<>{visible.map((section) => {
        const Icon = section.icon;
        return <button key={section.id} className={cn("si-reference-row", selected.id === section.id && "is-selected")} aria-pressed={selected.id === section.id} onClick={() => setSectionId(section.id)}>
          <span className="si-mini-avatar"><Icon size={14} aria-hidden="true" /></span>
          <span className="si-row-copy"><strong>{section.label}</strong><span>{section.status}</span></span>
          <ArrowRight size={13} aria-hidden="true" />
        </button>;
      })}{!visible.length ? <p className="p-3 text-xs text-[var(--muted-foreground)]">No settings categories match this search.</p> : null}<p className="mt-3 px-3 text-[10px] leading-4 text-[var(--muted-foreground)]">Workspace settings have no save operation. Existing product controls stay in their own workflows.</p></>}
      detail={<>
        <div className="si-detail-header"><div><div className="si-label">Workspace configuration</div><h2>{selected.label}</h2></div><Badge tone="neutral">{selected.status}</Badge></div>
        <div className="si-detail-grid">{selected.facts.map((fact) => <div key={fact.label} className="si-detail-tile"><div className="si-label">{fact.label}</div><strong>{fact.value}</strong></div>)}</div>
        <div className="si-detail-scroll si-settings-content">
          <p className="text-xs leading-5">{selected.description}</p>
          {selected.id === "appearance" ? <section aria-label="Browser appearance preference" className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/25 p-3"><div><h3 className="text-sm font-medium">Browser theme</h3><p className="mt-1 text-xs">Switch light or dark appearance. Changes apply immediately in this browser.</p></div><ThemeToggle /></section> : null}
          <section className="mt-3 rounded-2xl border border-white/25 p-3" aria-label={`${selected.label} scope`}>
            <h3 className="text-xs font-semibold">{selected.id === "appearance" ? "Preference scope" : "Configuration scope"}</h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-5">{selected.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
          </section>
          <p className="mt-3 text-xs leading-5">{selected.note}</p>
          {selected.id === "ai" ? <div className="mt-3 flex flex-wrap gap-2"><Link className="si-action-pill" href="/inbox">Conversation analysis</Link><Link className="si-action-pill" href="/ai-quality">Demo evaluation diagnostics</Link></div> : null}
        </div>
        <DetailBand metrics={[{ label: "Workspace controls", value: "Read-only" }, { label: "Last configuration update", value: "Unavailable" }, { label: "Audit preferences", value: "Planned" }]} action={<Link className="si-action-pill is-primary" href={selected.href}>{selected.action}<ArrowRight size={13} aria-hidden="true" /></Link>} />
      </>}
    />
    <p className="mt-3 text-[10px] text-[var(--muted-foreground)]">Settings remains a configuration scaffold. Appearance is an existing browser-local preference; other sections provide scope and navigation.</p>
  </div>;
}
