import { z } from "zod";

export const sendReplyRequestSchema = z.object({
  text: z.string().trim().min(1).max(50_000),
  clientRequestId: z.string().uuid(),
});

export const integrationSettingsSchema = z.object({
  syncQuery: z.string().trim().min(1).max(500).optional(),
  backfillDays: z.number().int().min(1).max(365).optional(),
});

export const pubsubEnvelopeSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    messageId: z.string().min(1),
    publishTime: z.string().optional(),
  }),
  subscription: z.string().optional(),
});

export const pubsubDataSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.string().regex(/^\d+$/),
});

export type SendReplyRequest = z.infer<typeof sendReplyRequestSchema>;

export interface IntegrationStatusDTO {
  mode: "mock" | "database";
  connected: boolean;
  id?: string;
  provider?: "gmail";
  mailbox?: string;
  status?: "connected" | "disconnected" | "error";
  scopes?: string[];
  syncState?: string;
  lastSyncedAt?: string | null;
  lastHistoryId?: string | null;
  watchExpiration?: string | null;
  watchConfigured: boolean;
  syncQuery?: string;
  backfillDays?: number;
  storedThreads?: number;
  storedMessages?: number;
  latestSync?: {
    id: string;
    kind: string;
    status: string;
    messagesFound: number;
    messagesInserted: number;
    messagesSkipped: number;
    threadsFound: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  } | null;
}

export interface SendReplyResponse {
  operationId: string;
  status: "sent" | "failed" | "sending" | "pending";
  providerMessageId?: string | null;
  providerThreadId?: string | null;
  deduplicated: boolean;
  errorCode?: string | null;
}
