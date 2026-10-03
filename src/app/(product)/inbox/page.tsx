import { Suspense } from "react";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { LoadingState } from "@/components/ui/page-state";

export default function InboxPage() {
  return <Suspense fallback={<LoadingState label="Loading inbox…" />}><InboxWorkspace /></Suspense>;
}
