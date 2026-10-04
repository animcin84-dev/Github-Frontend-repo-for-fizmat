import { Suspense } from "react";
import { RestaurantWhatsAppWorkspace } from "@/components/whatsapp/restaurant-whatsapp-workspace";
import { LoadingState } from "@/components/ui/page-state";

export default function WhatsAppPage() {
  return <Suspense fallback={<LoadingState label="Loading restaurant workspace…" />}><RestaurantWhatsAppWorkspace /></Suspense>;
}
