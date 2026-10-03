import type {
  GmailClient,
  GmailHistoryResponse,
  GmailProfile,
  GmailRawMessage,
  GmailSendResponse,
  GmailThreadListResponse,
  GmailThreadResponse,
  GmailWatchResponse,
} from "@/server/integrations/gmail/types";

export function rawFixture(input: {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject?: string;
  body?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  unread?: boolean;
  date?: string;
}): GmailRawMessage {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject ?? "Support request"}`,
    `Date: ${input.date ?? "Sat, 03 Oct 2026 12:00:00 +0000"}`,
    `Message-ID: ${input.messageId ?? `<${input.id}@example.test>`}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references?.length ? [`References: ${input.references.join(" ")}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body ?? "Synthetic support fixture body.",
  ];
  return {
    id: input.id,
    threadId: input.threadId,
    historyId: "200",
    internalDate: String(Date.parse(input.date ?? "2026-10-03T12:00:00Z")),
    labelIds: input.unread === false ? ["INBOX"] : ["INBOX", "UNREAD"],
    raw: Buffer.from(headers.join("\r\n")).toString("base64url"),
  };
}

export class FixtureGmailClient implements GmailClient {
  profile: GmailProfile = { emailAddress: "support@example.test", historyId: "300" };
  threadPages: GmailThreadListResponse[] = [];
  threads = new Map<string, GmailThreadResponse>();
  raws = new Map<string, GmailRawMessage>();
  historyPages: GmailHistoryResponse[] = [];
  historyError?: Error;
  searchResults: Array<{ id: string; threadId: string }> = [];
  sendError?: Error;
  sendCalls: Array<{ raw: string; threadId: string }> = [];
  listThreadCalls = 0;
  listHistoryCalls = 0;

  async getProfile() { return this.profile; }
  async listThreads() { return this.threadPages[this.listThreadCalls++] ?? { threads: [] }; }
  async getThread(threadId: string) { return this.threads.get(threadId) ?? { id: threadId, messages: [] }; }
  async getRawMessage(messageId: string) {
    const value = this.raws.get(messageId);
    if (!value) throw new Error(`Missing raw fixture ${messageId}`);
    return value;
  }
  async listHistory() {
    this.listHistoryCalls += 1;
    if (this.historyError) throw this.historyError;
    return this.historyPages[this.listHistoryCalls - 1] ?? { historyId: this.profile.historyId };
  }
  async searchMessages() { return this.searchResults; }
  async sendMessage(input: { raw: string; threadId: string }): Promise<GmailSendResponse> {
    this.sendCalls.push(input);
    if (this.sendError) throw this.sendError;
    return { id: "sent-provider-1", threadId: input.threadId };
  }
  async watch(): Promise<GmailWatchResponse> { return { historyId: this.profile.historyId, expiration: String(Date.now() + 86_400_000) }; }
  async stop() {}
}
