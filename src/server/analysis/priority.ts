import type { Priority } from "@/lib/domain";
import type { TriageResult } from "./contracts";

export const TRIAGE_PRIORITY_VERSION = "triage-priority-v1";

/** Customer requests for priority do not override these ordered rules. */
export function computeTriagePriority(result: TriageResult): { priority: Priority; reasons: string[]; version: string } {
  const flags = new Set(result.riskFlags);
  const reasons: string[] = [];
  let priority: Priority;
  if (flags.has("safety") || (result.impact === "service_wide" && result.customerBlocked)) {
    priority = "critical";
    if (flags.has("safety")) reasons.push("Customer text indicates a safety risk.");
    if (result.impact === "service_wide" && result.customerBlocked) reasons.push("Service-wide impact with customers blocked.");
  } else if (flags.has("security") || (flags.has("financial") && result.intent === "duplicate_charge" && result.customerBlocked)) {
    priority = "high";
    if (flags.has("security")) reasons.push("Customer text indicates a security risk.");
    if (flags.has("financial") && result.intent === "duplicate_charge" && result.customerBlocked) reasons.push("Duplicate-charge financial risk with the customer blocked.");
  } else if (flags.has("financial") || result.customerBlocked || result.impact === "multiple_customers") {
    priority = "medium";
    if (flags.has("financial")) reasons.push("Customer text indicates a financial risk.");
    if (result.customerBlocked) reasons.push("Customer is blocked.");
    if (result.impact === "multiple_customers") reasons.push("Multiple customers are affected.");
  } else {
    priority = "low";
    reasons.push("No critical, high, or medium priority rule applies to the extracted facts.");
  }
  return { priority, reasons, version: TRIAGE_PRIORITY_VERSION };
}
