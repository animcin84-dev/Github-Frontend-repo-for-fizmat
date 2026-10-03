import { Suspense } from "react";
import { AutomationWorkspace } from "@/components/automation/automation-workspace";
import { LoadingState } from "@/components/ui/page-state";

export default function AutomationPage() {
  return <Suspense fallback={<LoadingState label="Loading automation control plane…" />}><AutomationWorkspace /></Suspense>;
}
