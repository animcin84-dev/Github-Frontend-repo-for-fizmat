"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useQueryState } from "nuqs";
import { Clock3, MessageSquareText, Save, Search, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DetailBand, FilterHinge, OperationalWorkspace, ReferenceLink, ReferenceSummary, RouteHeader, WorkspaceTabs } from "@/components/reference/reference-layout";
import { restaurant, restaurantChats, type RestaurantRequest } from "@/lib/restaurant-example";
import { cn } from "@/lib/utils";

const requestLabels: Record<RestaurantRequest, string> = { booking: "Booking", order: "Order", question: "Guest question" };
const draftEvent = "si-restaurant-draft-change";
function subscribeToDrafts(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(draftEvent, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(draftEvent, notify); };
}
const emptyDraft = () => "";

export function RestaurantWhatsAppWorkspace() {
  const [view, setView] = useQueryState("view", { defaultValue: "all" });
  const [chatId, setChatId] = useQueryState("chat", { defaultValue: restaurantChats[0].id });
  const [search, setSearch] = useState("");
  const [needsReply, setNeedsReply] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const activeView = ["all", "booking", "order", "question"].includes(view) ? view : "all";
  const filtered = restaurantChats.filter((chat) => (activeView === "all" || chat.request === activeView)
    && (!needsReply || chat.status === "Needs reply")
    && `${chat.guest} ${chat.title} ${chat.summary}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selected = filtered.find((chat) => chat.id === chatId) ?? filtered[0];
  const draftKey = `si-restaurant-example:draft:${selected?.id ?? "none"}`;
  const readDraft = useCallback(() => {
    try { return localStorage.getItem(draftKey)?.slice(0, 3000) ?? ""; } catch { return ""; }
  }, [draftKey]);
  const savedDraft = useSyncExternalStore(subscribeToDrafts, readDraft, emptyDraft);
  const draft = selected ? edits[selected.id] ?? savedDraft : "";
  const counts = (request: RestaurantRequest) => restaurantChats.filter((chat) => chat.request === request).length;
  const pending = restaurantChats.filter((chat) => chat.status === "Needs reply").length;
  const saveDraft = () => {
    if (!selected || !draft.trim()) return;
    try {
      localStorage.setItem(draftKey, draft);
      window.dispatchEvent(new Event(draftEvent));
      toast.success("Draft saved in this browser", { description: "No WhatsApp message was sent." });
    } catch { toast.error("Could not save draft", { description: "Browser storage is unavailable. Your text remains in the editor." }); }
  };

  return <div className="si-page si-restaurant-page">
    <RouteHeader title="WhatsApp" note={<Badge>Example restaurant</Badge>} actions={<ReferenceLink href="/integrations">Channel setup ↗</ReferenceLink>} />
    <ReferenceSummary
      metrics={[{ label: "Guest conversations", value: restaurantChats.length, note: restaurant.name }, { label: "Needs reply", value: pending, note: "Bookings, orders and guest questions" }, { label: "Booking requests", value: counts("booking"), note: "In this restaurant example" }]}
      activity={([{ label: "Bookings", value: counts("booking"), marker: "B" }, { label: "Orders", value: counts("order"), marker: "O" }, { label: "Questions", value: counts("question"), marker: "?" }])}
      activityLabel="Restaurant request distribution"
      signal={{ label: "Basil & Ember · business profile", value: restaurant.hours, note: "Dining hours", options: [{ label: "Dine-in", value: "Tables" }, { label: "Takeaway", value: "Collection" }, { label: "Delivery", value: "Enquiries" }] }}
    />
    <FilterHinge count={Number(needsReply) + Number(Boolean(search.trim()))}>
      <button className={cn("si-action-pill", needsReply && "is-primary")} aria-pressed={needsReply} onClick={() => setNeedsReply(!needsReply)}>Needs reply</button>
      <span className="si-metric-note">{restaurantChats.length} example conversations · 4 Oct 2026</span>
      <div className="si-inbox-search"><Search size={14} aria-hidden="true" /><input aria-label="Search restaurant conversations" placeholder="Search guests or requests" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    </FilterHinge>
    <OperationalWorkspace title="Restaurant conversations" className="si-route-workspace si-restaurant-workspace" detailKey={selected?.id}
      tabs={<WorkspaceTabs label="Restaurant views" active={activeView} onChange={(id) => void setView(id)} items={[{ id: "all", label: "Chats", count: restaurantChats.length }, { id: "booking", label: "Bookings", count: counts("booking") }, { id: "order", label: "Orders", count: counts("order") }, { id: "question", label: "Questions", count: counts("question") }]} />}
      master={<>
        <div className="si-restaurant-identity"><span className="si-restaurant-mark"><UtensilsCrossed size={18} aria-hidden="true" /></span><div><strong>{restaurant.name}</strong><span>{restaurant.description}</span></div></div>
        {filtered.map((chat) => <button key={chat.id} className={cn("si-reference-row", selected?.id === chat.id && "is-selected")} aria-pressed={selected?.id === chat.id} onClick={() => void setChatId(chat.id)}>
          <span className="si-mini-avatar">{chat.initials}</span><span className="si-row-copy"><strong>{chat.guest} · {chat.title}</strong><span>{chat.summary}</span><span>{requestLabels[chat.request]} · {chat.status}</span></span><span className="si-restaurant-row-time">{chat.time}{chat.status === "Needs reply" ? <span className="si-restaurant-unread" aria-label="Needs reply" /> : null}</span>
        </button>)}
        {!filtered.length ? <div className="si-empty-inset" role="status">No matching guest conversations.<button className="si-action-pill mt-3" onClick={() => { setSearch(""); setNeedsReply(false); void setView("all"); }}>Clear filters</button></div> : null}
      </>}
      detail={selected ? <>
        <div className="si-detail-header"><div><div className="si-label">{restaurant.name} · WhatsApp Business example</div><h2>{selected.guest} · {selected.title}</h2></div><Badge tone={selected.status === "Needs reply" ? "warning" : "neutral"}>{selected.status}</Badge></div>
        <div className="si-detail-grid">{selected.context.map((item) => <div className="si-detail-tile" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><span>{requestLabels[selected.request]}</span></div>)}</div>
        <div className="si-detail-scroll si-restaurant-chat-layout" role="region" aria-label="Guest conversation and restaurant context" tabIndex={0}>
          <section className="si-restaurant-chat"><div className="si-restaurant-section-heading"><MessageSquareText size={15} aria-hidden="true" /><h3>Guest conversation</h3><span>4 Oct</span></div>
            <div className="si-restaurant-messages" role="log" aria-label="Example guest messages">{selected.messages.map((message, index) => <div key={`${selected.id}:${index}`} className={cn("si-restaurant-message", message.author === "restaurant" && "is-outbound")}><span className="si-label">{message.author === "guest" ? selected.guest : restaurant.name}</span><p>{message.text}</p><time>{message.time}</time></div>)}</div>
            <form className="si-restaurant-composer" onSubmit={(event) => { event.preventDefault(); saveDraft(); }}><label htmlFor="restaurant-reply" className="si-label">Reply draft</label><textarea id="restaurant-reply" value={draft} maxLength={3000} rows={3} placeholder="Prepare a reply for your guest…" onChange={(event) => setEdits((previous) => ({ ...previous, [selected.id]: event.target.value }))} /><div className="si-restaurant-composer-footer"><span role="status">{savedDraft && draft === savedDraft ? "Saved in this browser" : "Draft only · no WhatsApp delivery"}</span><button type="submit" className="si-action-pill is-primary" disabled={!draft.trim()}><Save size={13} aria-hidden="true" />Save draft</button></div></form>
          </section>
          <aside aria-label="Restaurant business profile" className="si-restaurant-profile"><div className="si-restaurant-section-heading"><UtensilsCrossed size={15} aria-hidden="true" /><h3>Business profile</h3></div><h4>{restaurant.name}</h4><p>{restaurant.description}</p><div className="si-restaurant-hours"><Clock3 size={14} aria-hidden="true" /><span>{restaurant.hours}</span></div><p>{restaurant.service}</p><div className="si-restaurant-connection"><span className="si-label">WhatsApp connection</span><strong>Not connected</strong><ReferenceLink href="/integrations">View setup ↗</ReferenceLink></div><h4 className="mt-5">Menu highlights</h4><ul className="si-restaurant-menu">{restaurant.menu.map((item) => <li key={item.name}><div><strong>{item.name}</strong><span>{item.description}</span></div><span>{new Intl.NumberFormat("en-GB").format(item.price)} ₸</span></li>)}</ul></aside>
        </div>
        <DetailBand metrics={[{ label: "Request", value: requestLabels[selected.request] }, { label: "Dataset", value: "Restaurant example" }, { label: "Reply channel", value: "Draft workspace" }]} />
      </> : <div className="si-empty-inset"><h2>No conversation selected</h2><p>Choose a guest conversation or clear the filters.</p></div>}
    />
    <p className="si-metric-note mt-3">Example restaurant and conversations. Drafts stay in this browser; bookings, payments and WhatsApp delivery are not executed.</p>
  </div>;
}
