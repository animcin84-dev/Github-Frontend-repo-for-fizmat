import { Suspense } from "react";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { LoadingState } from "@/components/ui/page-state";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <Suspense fallback={<LoadingState label="Loading conversation…" />}><InboxWorkspace initialConversationId={conversationId} /></Suspense>;
}
