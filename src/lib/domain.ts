import type { TriageResult } from "@/server/analysis/contracts";

export type Priority = "low" | "medium" | "high" | "critical";
export type AnalysisState = "simulated" | "pending" | "running" | "completed" | "failed";
export interface ConversationAnalysis {
  id?: string;
  status: Exclude<AnalysisState, "simulated">;
  configured: boolean;
  stale: boolean;
  provider?: string;
  model?: string;
  promptVersion?: string;
  workflowVersion?: string;
  priorityPolicyVersion?: string;
  startedAt?: string;
  finishedAt?: string;
  inputTruncated?: boolean;
  result?: TriageResult;
  priority?: Priority;
  priorityReasons?: string[];
  error?: { code: string; message: string };
}
export type ConversationPriority = Priority | "untriaged";
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
  priority: ConversationPriority;
  category: string;
  unread: boolean;
  source?: "mock" | "gmail" | "whatsapp";
  providerLabel?: string;
  integrationAccountId?: string;
  analysisState?: AnalysisState;
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
  priority: ConversationPriority;
  category: string;
  subcategory?: string;
  source?: "mock" | "gmail" | "whatsapp";
  providerLabel?: string;
  integrationAccountId?: string;
  providerConversationId?: string;
  analysisState?: AnalysisState;
  analysis?: ConversationAnalysis;
  replyMode?: "mock" | "gmail_real" | "unavailable";
  summary: string;
  triageSignals: TriageSignal[];
  messages: Array<{
    id: string;
    author: "customer" | "agent" | "system" | "ai";
    body: string;
    createdAt: string;
    direction?: "inbound" | "outbound";
    from?: string;
    to?: string[];
    cc?: string[];
    providerMessageId?: string;
    attachments?: Array<{ filename: string; mimeType: string; size: number }>;
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
  type: "Policy" | "Help center" | "Internal doc" | "System record" | "Resolved cases";
  owner?: string;
  authority: "authoritative" | "supporting" | "unverified";
  status: "healthy" | "aging" | "stale" | "conflict" | "missing_owner";
  lastUpdatedAt: string;
  freshnessTargetDays: number;
  retrievalCount30d: number;
  usedInRecentAnswers: number;
  coverageTopics: string[];
  recentConversationIds: string[];
  summary: string;
  primaryClaim?: string;
  validFrom?: string;
  validUntil?: string;
}

export interface KnowledgeGap {
  id: string;
  topic: string;
  conversationCount: number;
  trendPercent: number;
  firstSeenAt: string;
  exampleQuestion: string;
  affectedLanguages: string[];
  suggestedOwner?: string;
  status: "open" | "drafted" | "resolved";
  relatedIssueId?: string;
}

export interface KnowledgeConflict {
  id: string;
  topic: string;
  sourceAId: string;
  sourceBId: string;
  claimA: string;
  claimB: string;
  affectedDraftCount: number;
  humanReviewCount: number;
  affectedConversationIds: string[];
  status: "open" | "reviewing" | "resolved";
  relatedIssueId?: string;
}

export interface KnowledgeCoverage {
  topic: string;
  coverage: "strong" | "medium" | "weak" | "missing";
  authority: "strong" | "supporting" | "missing";
  freshness: "fresh" | "aging" | "stale" | "—";
  sourceIds: string[];
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


export type KnowledgeHealthState = "healthy" | "aging" | "stale" | "conflict" | "missing";
export type AIOutcomeDecision = "unchanged" | "minor_edit" | "major_edit" | "rejected" | "human_takeover";
export type AIFailureType =
  | "unsupported_claim"
  | "missing_knowledge"
  | "stale_knowledge"
  | "conflicting_sources"
  | "wrong_intent"
  | "wrong_priority"
  | "policy_block"
  | "identity_missing"
  | "incorrect_action"
  | "poor_tone"
  | "human_takeover"
  | "customer_rejected"
  | "reopened"
  | "retrieval_failure";

export type FailureCause = "knowledge" | "policy" | "retrieval" | "intent_triage" | "identity" | "generation" | "other";

export interface ModelVersion {
  id: string;
  label: string;
  deployedAt: string;
  note: string;
}

export interface PromptVersion {
  id: string;
  label: string;
}

export interface RetrievalVersion {
  id: string;
  label: string;
}

export interface AIOutcome {
  id: string;
  conversationId: string;
  customerName: string;
  locale: "en" | "ru-KZ" | "kk-KZ" | "ru-kk-mixed";
  intent: string;
  channel: Channel;
  modelVersion: string;
  promptVersion: string;
  retrieverVersion: string;
  policyVersion: string;
  knowledgeSnapshot: string;
  knowledgeState: KnowledgeHealthState;
  sourceIds: string[];
  decision: AIOutcomeDecision;
  reopened: boolean;
  unsupportedClaim: boolean;
  timestamp: string;
}

export interface AIFailure {
  id: string;
  outcomeId: string;
  conversationId: string;
  customerName: string;
  locale: AIOutcome["locale"];
  intent: string;
  type: AIFailureType;
  severity: Priority;
  knowledgeState: KnowledgeHealthState;
  sourceIds: string[];
  modelVersion: string;
  outcome: string;
  channel: Channel;
  timestamp: string;
  rootCause: FailureCause;
  trace: {
    customerMessage: string;
    triage: string;
    retrieval: string[];
    draft: string;
    problem: string;
    humanAction: string;
    finalOutcome: string;
  };
  relatedIssueId?: string;
}

export interface QualityTrendPoint {
  timestamp: string;
  acceptedRate: number;
  majorEditRate: number;
  rejectionRate: number;
  unsupportedClaimRate: number;
  reopenRate: number;
}

export interface EvaluationSuite {
  id: string;
  name: string;
  description: string;
  passRate: number;
  previousPassRate: number;
  caseCount: number;
  lastRunAt: string;
  status: "passing" | "watch" | "regression";
}

export interface EvaluationCase {
  id: string;
  suiteId: string;
  input: string;
  expectedBehavior: string;
  observedBehavior: string;
  evidence: string;
  result: "passed" | "failed";
  change: "regression" | "improved" | "unchanged";
  version: string;
}

export interface EvaluationRun {
  id: string;
  modelVersion: string;
  previousModelVersion: string;
  overallPassRate: number;
  previousPassRate: number;
  runAt: string;
  segmentChanges: Array<{ segment: string; deltaPercentagePoints: number; note: string }>;
}

export interface ShadowSimulation {
  id: string;
  conversationId: string;
  intent: string;
  locale: AIOutcome["locale"];
  classification: "draft_possible" | "human_review" | "human_only" | "insufficient_knowledge";
  actualResolution: string;
  aiProposal: string;
  differences: Array<"wording" | "missing_fact" | "policy_mismatch" | "action_mismatch">;
  sourceIds: string[];
}

export interface AutomationReadiness {
  intent: string;
  sampleSize: number;
  coverage: "strong" | "medium" | "weak" | "missing";
  freshness: "fresh" | "aging" | "stale" | "—";
  conflicts: "none" | "present";
  policy: "auto_allowed" | "human_approval" | "human_only";
  historicalPassRate: number;
  recommendation: "controlled_automation" | "copilot_only" | "never_autonomous";
}

export interface QualityRecommendation {
  id: string;
  priority: "high" | "medium";
  topic: string;
  evidence: string[];
  recommendation: string;
  relatedKnowledgeId?: string;
  relatedIssueId?: string;
}

export type ActionRisk =
  | "read_only"
  | "low_risk_reversible"
  | "customer_impacting_reversible"
  | "financial"
  | "security_sensitive"
  | "irreversible";

export type ExecutionStatus =
  | "pending"
  | "executing"
  | "succeeded"
  | "failed"
  | "rolled_back"
  | "cancelled";

export type ExecutionFailureType =
  | "timeout"
  | "provider_error"
  | "validation_error"
  | "conflict"
  | "partial_success";

export interface ActionDefinition {
  id: string;
  label: string;
  description: string;
  provider: string;
  connectorId: string;
  inputSchema: string[];
  risk: ActionRisk;
  reversible: boolean;
  requiresIdentity: boolean;
  requiresConfirmation: boolean;
  requiresHumanApproval: boolean;
  timeoutMs: number;
  retryPolicy: string;
  status: "available" | "degraded" | "paused";
}

export interface PolicyVersion {
  id: string;
  label: string;
  status: "current" | "draft" | "previous";
  effectiveFrom: string;
  owner: string;
  changes: string[];
  amountLimit?: number;
  humanApprovalThreshold?: number;
}

export interface AutomationPolicy {
  id: string;
  actionId: string;
  intent: string;
  scope: string;
  requiredIdentity: "none" | "authenticated" | "verified";
  knowledgeRequirements: {
    authoritative: boolean;
    fresh: boolean;
    noConflicts: boolean;
  };
  amountLimit?: number;
  customerConfirmation: boolean;
  humanApproval: "never" | "above_limit" | "always";
  allowedChannels: Channel[];
  allowedRegions: string[];
  blockedConditions: string[];
  versions: PolicyVersion[];
}

export type ProcedureStepType =
  | "understand"
  | "ask_customer"
  | "retrieve_data"
  | "validate"
  | "branch"
  | "policy_check"
  | "request_confirmation"
  | "human_approval"
  | "execute_action"
  | "verify_result"
  | "send_response"
  | "escalate";

export interface ProcedureStep {
  id: string;
  type: ProcedureStepType;
  title: string;
  instruction: string;
  deterministicCondition?: string;
}

export interface AutomationProcedure {
  id: string;
  name: string;
  intent: string;
  trigger: string;
  status: "draft" | "shadow" | "limited" | "active" | "paused";
  steps: ProcedureStep[];
  policyIds: string[];
  actionIds: string[];
  requiredData: string[];
  evaluation: {
    passRate: number;
    sampleSize: number;
    lastRunAt: string;
  };
  rolloutId: string;
}

export interface ExecutionRecord {
  id: string;
  actionId: string;
  conversationId: string;
  idempotencyKey: string;
  previousAttemptId?: string;
  status: ExecutionStatus;
  requestedAt: string;
  completedAt?: string;
  result?: string;
  failureType?: ExecutionFailureType;
  providerReference?: string;
}

export interface ApprovalRequest {
  id: string;
  conversationId: string;
  customerName: string;
  actionId: string;
  policyVersion: string;
  amount?: number;
  identity: "verified" | "authenticated" | "unverified";
  knowledgeState: KnowledgeHealthState;
  confirmation: "received" | "missing" | "not_required";
  reason: string;
  evidenceIds: string[];
  affectedEntity: string;
  reversibility: "available" | "unavailable";
  expectedExternalChange: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  approver?: string;
}

export interface RolloutConfig {
  id: string;
  intent: string;
  mode: "shadow" | "canary" | "limited" | "expanded" | "full" | "paused";
  percentage: 0 | 5 | 25 | 50 | 100;
  eligiblePopulation: string[];
  excluded: string[];
  guardrails: {
    executed: number;
    failed: number;
    humanTakeoverAfterAction: number;
    reopened: number;
    customerCorrection: number;
    policyBlocks: number;
    rollbackRate: number;
  };
  baseline: {
    failureRate: number;
    reopenRate: number;
  };
  autoPauseConditions: Array<{
    id: string;
    label: string;
    threshold?: string;
    enabled: boolean;
  }>;
}

export interface AutomationDecision {
  id: string;
  conversationId: string;
  intent: string;
  actionId: string;
  policyDecision: PolicyDecision;
  policyVersion: string;
  knowledgeSnapshot: string;
  evaluationVersion: string;
  timestamp: string;
}

export interface AutomationAuditEvent {
  id: string;
  timestamp: string;
  conversationId: string;
  intent: string;
  actionId: string;
  policyVersion: string;
  knowledgeSnapshot: string;
  evaluationVersion: string;
  decision: PolicyDecision["decision"];
  approver?: string;
  executionId?: string;
  result: "not_executed" | ExecutionStatus;
  reason: string;
  lifecycle: Array<{
    state:
      | "requested"
      | "policy_evaluated"
      | "confirmation_received"
      | "human_approved"
      | "action_executed"
      | "result_verified"
      | "blocked"
      | "failed"
      | "rolled_back";
    at: string;
    detail: string;
  }>;
}

export interface ConnectorHealth {
  id: string;
  label: string;
  status: "healthy" | "degraded" | "down";
  readOnlyAvailable: boolean;
  affectedActions: string[];
  lastCheckedAt: string;
  note: string;
}

export interface AutomationIncidentGate {
  id: string;
  intent: string;
  issueId: string;
  status: "paused" | "warning";
  reason: string;
  affectedActions: string[];
}

export interface ReadinessExplanation {
  intent: string;
  currentMode: "controlled_automation" | "copilot_only" | "human_only";
  rolloutPercent: number;
  lastDecision: string;
  dimensions: Array<{
    label:
      | "Knowledge"
      | "Identity"
      | "Policy"
      | "Historical evaluations"
      | "Failure history"
      | "Action reversibility"
      | "Customer confirmation"
      | "External system health";
    state: "pass" | "warning" | "block";
    detail: string;
    href?: string;
  }>;
}

export interface PolicyReplay {
  policyId: string;
  casesTested: number;
  previousEligible: number;
  proposedEligible: number;
  newlyEligible: number;
  unsafeRegressions: number;
  recommendation: "review_required" | "safe_to_continue";
}

export interface ProcedureSimulation {
  procedureId: string;
  conversationsReplayed: number;
  completedSafely: number;
  humanApproval: number;
  escalated: number;
  blocked: number;
  executionFailure: number;
  regressions: Array<{
    caseId: string;
    from: string;
    to: string;
    severity: "high" | "medium";
  }>;
  sampleTrace: Array<{
    state: string;
    detail: string;
  }>;
}

