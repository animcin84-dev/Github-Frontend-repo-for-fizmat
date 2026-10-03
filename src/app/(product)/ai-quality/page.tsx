import { Suspense } from "react";
import { AIQualityWorkspace } from "@/components/ai-quality/ai-quality-workspace";
import { LoadingState } from "@/components/ui/page-state";

export default function AIQualityPage() {
  return <Suspense fallback={<LoadingState label="Loading AI quality diagnostics…" />}><AIQualityWorkspace /></Suspense>;
}
