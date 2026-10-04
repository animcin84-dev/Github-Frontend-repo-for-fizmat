import { SupportError } from "@/server/errors";

export type ProviderErrorCategory = "authentication" | "rate_limited" | "timeout" | "network" | "unavailable" | "unsupported_request" | "invalid_output" | "invalid_input" | "configuration";
export interface ProviderAttempt {
  provider: string;
  model: string;
  status: "completed" | "failed";
  latencyMs: number;
  errorCode?: string;
}

/** Only controlled categories and safe metadata may leave an adapter. */
export class ProviderError extends SupportError {
  readonly category: ProviderErrorCategory;
  readonly transient: boolean;
  readonly provider?: string;
  readonly model?: string;
  attempts: ProviderAttempt[] = [];

  constructor(category: ProviderErrorCategory, options: { transient?: boolean; status?: number; provider?: string; model?: string } = {}) {
    const messages: Record<ProviderErrorCategory, string> = {
      authentication: "AI provider authentication failed. Check the configured server credential.",
      rate_limited: "AI provider rate limit reached. Please try again later.",
      timeout: "AI provider request timed out. Please try again.",
      network: "AI provider could not be reached. Please try again.",
      unavailable: "AI provider is temporarily unavailable. Please try again.",
      unsupported_request: "AI provider rejected the configured model or structured-output request.",
      invalid_output: "AI provider returned an invalid or incomplete triage result.",
      invalid_input: "AI triage input is invalid or exceeds the supported bounds.",
      configuration: "AI provider configuration is incomplete or unsupported.",
    };
    super(category === "configuration" ? "configuration_missing" : "validation_failed", messages[category], { status: options.status ?? (category === "configuration" ? 503 : 502), retryable: options.transient ?? false });
    this.name = "ProviderError";
    this.category = category;
    this.transient = options.transient ?? false;
    this.provider = options.provider;
    this.model = options.model;
  }
}
