import { z } from "zod";

/** Facts extracted from inbound customer text. Priority is deliberately absent. */
export const triageResultSchema = z.strictObject({
  language: z.string().min(1).max(80),
  category: z.enum(["Billing", "Account", "Technical", "Shipping", "General"]),
  subcategory: z.string().min(1).max(120).nullable(),
  intent: z.enum(["duplicate_charge", "refund_request", "account_access", "service_outage", "delivery_status", "general_question", "cancellation", "feedback", "other"]),
  entities: z.array(z.strictObject({
    type: z.enum(["order_id", "amount", "product", "account", "other"]),
    value: z.string().min(1).max(200),
  })).max(20),
  riskFlags: z.array(z.enum(["financial", "security", "privacy", "safety", "legal", "account_access", "data_loss", "churn"])).max(8),
  impact: z.enum(["individual", "multiple_customers", "service_wide", "unknown"]),
  customerBlocked: z.boolean(),
  requestedAction: z.string().min(1).max(500).nullable(),
  route: z.enum(["billing_support", "security_support", "technical_support", "general_support"]),
  summary: z.string().min(1).max(1000),
});

export type TriageResult = z.infer<typeof triageResultSchema>;

export interface TriageInput {
  subject: string;
  messages: Array<{
    id: string;
    providerMessageId: string;
    text: string;
    occurredAt: string;
  }>;
}

export interface TriageProvider {
  readonly id: string;
  readonly model: string;
  analyze(input: TriageInput): Promise<TriageResponse>;
}

export interface ProviderAttempt {
  provider: string;
  model: string;
  status: "completed" | "failed";
  latencyMs: number;
  errorCode?: string;
}

export interface TriageUsage { inputTokens?: number; outputTokens?: number }

export interface TriageResponse {
  result: unknown;
  provider?: string;
  providerResponseId?: string;
  model?: string;
  latencyMs?: number;
  usage?: TriageUsage;
  attempts?: ProviderAttempt[];
}
