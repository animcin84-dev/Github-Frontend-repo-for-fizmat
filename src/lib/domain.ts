export type Priority = "low" | "medium" | "high" | "critical";
export type ConversationStatus =
  | "new"
  | "open"
  | "waiting_customer"
  | "waiting_agent"
  | "escalated"
  | "resolved";
export type Channel = "email" | "web" | "telegram" | "whatsapp" | "api";

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  locale?: string;
  plan?: string;
  lifetimeValue?: number;
  priorConversationCount: number;
  tags: string[];
}

export interface ConversationListItem {
  id: string;
  customer: Pick<Customer, "id" | "name">;
  subject: string;
  preview: string;
  channel: Channel;
  status: ConversationStatus;
  priority: Priority;
  category: string;
  unread: boolean;
  aiState: "unanalyzed" | "draft_ready" | "needs_review" | "human_only" | "auto_eligible";
  slaRisk: "none" | "warning" | "breach";
  updatedAt: string;
}

export interface TriageSignal {
  label: string;
  kind: "risk" | "impact" | "sentiment" | "sla" | "repeat_contact" | "policy";
  contribution?: number;
  explanation: string;
}

export interface EvidenceSource {
  id: string;
  title: string;
  section?: string;
  sourceType: "policy" | "help_center" | "internal_doc" | "resolved_case" | "system_record";
  authority: "authoritative" | "supporting" | "unverified";
  freshness: "fresh" | "aging" | "stale";
  updatedAt?: string;
  excerpt: string;
  url?: string;
}

export interface AIDraft {
  id: string;
  text: string;
  state: "ready" | "needs_review" | "blocked";
  unsupportedClaims: Array<{ text: string; reason: string }>;
  evidenceIds: string[];
  suggestedActions: string[];
}

export interface PolicyDecision {
  action: string;
  decision: "allowed" | "confirm_customer" | "human_approval" | "blocked";
  reasons: string[];
}

export interface ConversationDetail {
  id: string;
  customer: Customer;
  subject: string;
  status: ConversationStatus;
  priority: Priority;
  category: string;
  subcategory?: string;
  summary: string;
  triageSignals: TriageSignal[];
  messages: Array<{
    id: string;
    author: "customer" | "agent" | "system" | "ai";
    body: string;
    createdAt: string;
    deliveryState?: "sent" | "delivered" | "failed";
  }>;
  evidence: EvidenceSource[];
  aiDraft?: AIDraft;
  policyDecisions: PolicyDecision[];
  similarConversationIds: string[];
}

export interface IssueTimelinePoint {
  time: string;
  actual: number;
  baselineLow: number;
  baselineHigh: number;
  marker?: string;
}

export interface IssueCorrelationCandidate {
  label: string;
  strength: "weak" | "moderate" | "strong";
  reason: string;
  eventAt?: string;
  firstSignalAt?: string;
  disclaimer: string;
}

export interface EmergingIssue {
  id: string;
  title: string;
  status: "watching" | "emerging" | "incident" | "resolved";
  severity: Priority;
  growthPercent: number;
  conversationCount: number;
  uniqueCustomerCount: number;
  firstSeenAt: string;
  lastActivityAt: string;
  activeMinutes: number;
  summary: string;
  relatedProductArea: string;
  signalCategory:
    | "product_bug"
    | "ux_confusion"
    | "missing_knowledge"
    | "policy_ambiguity"
    | "operations"
    | "billing_payment"
    | "external_dependency"
    | "unknown";
  evidenceState: "sufficient" | "limited" | "watch_only";
  owner?: string;
  baselinePerHour: [number, number];
  currentPerHour: number;
  correlationCandidates: IssueCorrelationCandidate[];
  representativeConversationIds: string[];
  commonPhrases: Array<{ phrase: string; count: number }>;
  evidenceSummary: {
    sampleSize: number;
    windowLabel: string;
    affectedCustomers: number;
    languages: Array<{ locale: string; count: number }>;
    productAreas: string[];
    categories: Array<{ label: string; count: number }>;
  };
  timeline: IssueTimelinePoint[];
  relatedKnowledgeIds: string[];
}

export interface KnowledgeSource {
  id: string;
  title: string;
  type: string;
  owner?: string;
  status: "healthy" | "stale" | "conflict" | "missing_owner";
  lastUpdatedAt: string;
  retrievalCount30d: number;
  coverageTopics: string[];
}

export interface KnowledgeGap {
  id: string;
  topic: string;
  conversationCount: number;
  firstSeenAt: string;
  exampleQuestion: string;
  status: "open" | "drafted" | "resolved";
}

export interface AIQualityMetrics {
  draftAcceptanceRate: number;
  unchangedRate: number;
  minorEditRate: number;
  majorEditRate: number;
  rejectionRate: number;
  humanTakeoverRate: number;
  reopenRate: number;
  unsupportedClaimRate: number;
}
