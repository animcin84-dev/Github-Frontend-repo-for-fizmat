import { Suspense } from "react";
import { IntelligenceWorkspace } from "@/components/intelligence/intelligence-workspace";
import { LoadingState } from "@/components/ui/page-state";

export default function IntelligencePage() {
  return <Suspense fallback={<LoadingState label="Loading intelligence workspace…" />}><IntelligenceWorkspace /></Suspense>;
}
