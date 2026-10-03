import { Suspense } from "react";
import { KnowledgeWorkspace } from "@/components/knowledge/knowledge-workspace";
import { LoadingState } from "@/components/ui/page-state";

export default function KnowledgePage() {
  return <Suspense fallback={<LoadingState label="Loading knowledge health…" />}><KnowledgeWorkspace /></Suspense>;
}
