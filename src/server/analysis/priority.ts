import type { Priority } from "@/lib/domain";
import type { TriageResult } from "./contracts";

export const TRIAGE_PRIORITY_VERSION = "triage-priority-v2";

/** Customer requests for priority do not override these ordered rules. */
export function computeTriagePriority(result: TriageResult): { priority: Priority; reasons: string[]; version: string } {
  const flags = new Set(result.riskFlags);
  const reasons: string[] = [];
  let priority: Priority;
  if (flags.has("safety") || (result.impact === "service_wide" && result.customerBlocked)) {
    priority = "critical";
    if (flags.has("safety")) reasons.push("Customer text indicates a safety risk.");
    if (result.impact === "service_wide" && result.customerBlocked) reasons.push("Service-wide impact with customers blocked.");
  } else if (flags.has("security") || flags.has("data_loss") || (flags.has("account_access") && result.customerBlocked) || (flags.has("financial") && (result.customerBlocked || result.intent === "duplicate_charge"))) {
    priority = "high";
    if (flags.has("security")) reasons.push("Customer text indicates a security risk.");
    if (flags.has("data_loss")) reasons.push("data_loss: Customer text indicates loss of customer data.");
    if (flags.has("account_access") && result.customerBlocked) reasons.push("account_access_blocked: Customer cannot access the account.");
    if (flags.has("financial") && result.intent === "duplicate_charge") reasons.push("duplicate_charge: Customer reports direct financial harm from a duplicate charge.");
    if (flags.has("financial") && result.customerBlocked) reasons.push("financial_risk_customer_blocked: Financial risk with the customer blocked.");
  } else if (flags.has("financial") || flags.has("privacy") || flags.has("legal") || flags.has("churn") || result.intent === "cancellation" || result.customerBlocked || result.impact === "multiple_customers") {
    priority = "medium";
    if (flags.has("financial")) reasons.push("Customer text indicates a financial risk.");
    if (result.customerBlocked) reasons.push("Customer is blocked.");
    if (result.impact === "multiple_customers") reasons.push("Multiple customers are affected.");
    for (const risk of ["privacy", "legal", "churn"] as const) if (flags.has(risk)) reasons.push(`${risk}_risk: Customer text indicates a ${risk} concern.`);
    if (result.intent === "cancellation") reasons.push("cancellation_request: Customer requests cancellation.");
  } else {
    priority = "low";
    reasons.push("No critical, high, or medium priority rule applies to the extracted facts.");
  }
  return { priority, reasons, version: TRIAGE_PRIORITY_VERSION };
}
