export const GMAIL_PROVIDER = "gmail" as const;
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

import type { EmailAddress, NormalizedMessage as ProviderMessage } from "@/server/integrations/types";
export type { MessageDirection, NormalizedAttachment } from "@/server/integrations/types";
export type NormalizedAddress = EmailAddress;
export type NormalizedMessage = ProviderMessage & {
  provider: "gmail";
  sender?: EmailAddress;
  recipients: EmailAddress[];
  cc: EmailAddress[];
};

export interface GmailProfile {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId: string;
}

export interface GmailThreadListResponse {
  threads?: Array<{ id: string; snippet?: string; historyId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GmailThreadResponse {
  id: string;
  historyId?: string;
  messages?: Array<{ id: string; threadId: string; labelIds?: string[] }>;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    attachmentId?: string;
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessageResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  /** Fixture/backward-compatible raw form. Production requests format=full to avoid explicit attachment downloads. */
  raw?: string;
}

export interface GmailHistoryResponse {
  history?: Array<{
    id: string;
    messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }>;
  }>;
  nextPageToken?: string;
  historyId?: string;
}

export interface GmailSendResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
}

export interface GmailWatchResponse {
  historyId: string;
  expiration: string;
}

export interface GmailClient {
  getProfile(): Promise<GmailProfile>;
  listThreads(input: { q: string; pageToken?: string; maxResults?: number }): Promise<GmailThreadListResponse>;
  getThread(threadId: string): Promise<GmailThreadResponse>;
  getMessage(messageId: string): Promise<GmailMessageResponse>;
  listHistory(input: { startHistoryId: string; pageToken?: string }): Promise<GmailHistoryResponse>;
  searchMessages(query: string): Promise<Array<{ id: string; threadId: string }>>;
  sendMessage(input: { raw: string; threadId: string }): Promise<GmailSendResponse>;
  watch(topicName: string, labelIds?: string[]): Promise<GmailWatchResponse>;
  stop(): Promise<void>;
}
