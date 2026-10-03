import { decryptToken } from "@/server/crypto/token-encryption";
import { SupportError } from "@/server/errors";
import { refreshAccessToken } from "@/server/integrations/gmail/oauth";
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

const API_ROOT = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailCredentialRecord {
  encryptedRefreshToken: string | null;
}

export class GmailHttpError extends SupportError {
  readonly httpStatus: number;
  constructor(httpStatus: number, message: string) {
    const code =
      httpStatus === 401 ? "oauth_expired" :
      httpStatus === 403 ? "permission_revoked" :
      httpStatus === 429 ? "gmail_rate_limited" :
      httpStatus === 404 ? "history_expired" : "gmail_unavailable";
    super(code, message, { status: httpStatus, retryable: httpStatus === 429 || httpStatus >= 500 });
    this.httpStatus = httpStatus;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GmailRestClient implements GmailClient {
  private accessToken?: Promise<string>;

  constructor(private readonly credential: GmailCredentialRecord) {}

  private getAccessToken() {
    if (!this.credential.encryptedRefreshToken) {
      throw new SupportError("oauth_expired", "Gmail refresh token is not available", { status: 401 });
    }
    if (!this.accessToken) {
      this.accessToken = refreshAccessToken(decryptToken(this.credential.encryptedRefreshToken)).then((result) => result.access_token);
    }
    return this.accessToken;
  }

  private async request<T>(path: string, init?: RequestInit, safeRead = false): Promise<T> {
    let attempt = 0;
    while (true) {
      const accessToken = await this.getAccessToken();
      const response = await fetch(`${API_ROOT}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });
      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return await response.json() as T;
      }
      const body = await response.text();
      if (response.status === 401 && attempt === 0) this.accessToken = undefined;
      const retryable = safeRead && (response.status === 429 || response.status >= 500) && attempt < 2;
      if (!retryable) throw new GmailHttpError(response.status, `Gmail API request failed (${response.status}): ${body.slice(0, 240)}`);
      await sleep(250 * 2 ** attempt);
      attempt += 1;
    }
  }

  getProfile() {
    return this.request<GmailProfile>("/profile", undefined, true);
  }

  listThreads(input: { q: string; pageToken?: string; maxResults?: number }) {
    const params = new URLSearchParams({
      q: input.q,
      maxResults: String(input.maxResults ?? 100),
    });
    if (input.pageToken) params.set("pageToken", input.pageToken);
    return this.request<GmailThreadListResponse>(`/threads?${params}`, undefined, true);
  }

  getThread(threadId: string) {
    return this.request<GmailThreadResponse>(`/threads/${encodeURIComponent(threadId)}?format=minimal`, undefined, true);
  }

  getRawMessage(messageId: string) {
    return this.request<GmailRawMessage>(`/messages/${encodeURIComponent(messageId)}?format=raw`, undefined, true);
  }

  listHistory(input: { startHistoryId: string; pageToken?: string }) {
    const params = new URLSearchParams({
      startHistoryId: input.startHistoryId,
      historyTypes: "messageAdded",
      maxResults: "100",
    });
    if (input.pageToken) params.set("pageToken", input.pageToken);
    return this.request<GmailHistoryResponse>(`/history?${params}`, undefined, true);
  }

  async searchMessages(query: string) {
    const params = new URLSearchParams({ q: query, maxResults: "10" });
    const response = await this.request<{ messages?: Array<{ id: string; threadId: string }> }>(`/messages?${params}`, undefined, true);
    return response.messages ?? [];
  }

  sendMessage(input: { raw: string; threadId: string }) {
    return this.request<GmailSendResponse>("/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: input.raw, threadId: input.threadId }),
    }, false);
  }

  watch(topicName: string, labelIds?: string[]) {
    return this.request<GmailWatchResponse>("/watch", {
      method: "POST",
      body: JSON.stringify({
        topicName,
        ...(labelIds?.length ? { labelIds, labelFilterBehavior: "INCLUDE" } : {}),
      }),
    }, false);
  }

  stop() {
    return this.request<void>("/stop", { method: "POST", body: "{}" }, false);
  }
}
