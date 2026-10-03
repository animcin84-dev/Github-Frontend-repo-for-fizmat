export type SupportErrorCode =
  | "oauth_expired"
  | "permission_revoked"
  | "gmail_rate_limited"
  | "gmail_unavailable"
  | "history_expired"
  | "parse_failed"
  | "database_failed"
  | "send_failed"
  | "watch_expired"
  | "pubsub_invalid"
  | "configuration_missing"
  | "validation_failed"
  | "sync_locked"
  | "not_found"
  | "unknown";

export class SupportError extends Error {
  readonly code: SupportErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: SupportErrorCode, message: string, options?: { status?: number; retryable?: boolean; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "SupportError";
    this.code = code;
    this.status = options?.status ?? 500;
    this.retryable = options?.retryable ?? false;
  }
}

export function toSupportError(error: unknown): SupportError {
  if (error instanceof SupportError) return error;
  return new SupportError("unknown", error instanceof Error ? error.message : "Unknown server error", { cause: error });
}

export function safeErrorResponse(error: unknown) {
  const normalized = toSupportError(error);
  return {
    error: normalized.code,
    message: normalized.message,
    retryable: normalized.retryable,
  };
}
