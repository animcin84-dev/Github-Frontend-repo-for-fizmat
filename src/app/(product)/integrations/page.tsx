import { Suspense } from "react";
import { GmailIntegration } from "@/components/integrations/gmail-integration";
import { LoadingState } from "@/components/ui/page-state";

export default function IntegrationsPage() {
  return <Suspense fallback={<LoadingState label="Loading integrations…" />}><GmailIntegration /></Suspense>;
}
