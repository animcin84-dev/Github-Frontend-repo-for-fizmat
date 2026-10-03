import type { ConversationDetail, ConversationListItem } from "@/lib/domain";
import type { SendReplyResponse } from "@/server/contracts";

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  return body as T;
}

export async function getConversationList(): Promise<ConversationListItem[]> {
  return readJson(await fetch("/api/conversations", { cache: "no-store" }));
}

export async function getConversationDetail(id: string): Promise<ConversationDetail> {
  return readJson(await fetch(`/api/conversations/${encodeURIComponent(id)}`, { cache: "no-store" }));
}

export async function sendConversationReply(id: string, input: { text: string; clientRequestId: string }): Promise<SendReplyResponse> {
  return readJson(await fetch(`/api/conversations/${encodeURIComponent(id)}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function getInboxIntegrationStatus() {
  return readJson<import("@/server/contracts").IntegrationStatusDTO>(
    await fetch("/api/integrations/gmail/status", { cache: "no-store" }),
  );
}

export async function syncInboxNow() {
  return readJson<{ messagesFound: number; messagesInserted: number; messagesSkipped: number; threadsFound: number }>(
    await fetch("/api/integrations/gmail/sync", { method: "POST" }),
  );
}
