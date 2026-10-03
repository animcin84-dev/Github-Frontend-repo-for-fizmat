import {
  actionCatalog,
  actionPreviewScenarios,
  approvalRequests,
  automationAuditEvents,
  automationDecisionsSummary,
  automationPolicies,
  automationProcedures,
  connectorHealth,
  duplicateProtectionExecution,
  featuredAuditEvent,
  incidentGates,
  knowledgeDowngrade,
  phaseEReadiness,
  policyReplay,
  procedureSimulations,
  qualityRegressionGate,
  readinessExplanations,
  rolloutConfigs,
} from "@/lib/mocks/automation-data";
import {
  aiFailures,
  aiOutcomes,
  automationReadiness,
  evaluationCases,
  evaluationRun,
  evaluationSuites,
  modelVersions,
  promptVersions,
  qualityOutcomeSummary,
  qualityRecommendations,
  qualityTrend,
  retrievalVersions,
  shadowSimulations,
  shadowSummary,
} from "@/lib/mocks/ai-quality-data";
import { aiQuality, conversations, emergingIssues, knowledgeConflicts, knowledgeCoverage, knowledgeGaps, knowledgeSources, resolveDetail, volumeSeries } from "@/lib/mocks/data";
import type { ConversationDetail } from "@/lib/domain";

const wait = (ms = 140) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getWorkspaceSnapshot() {
  await wait();
  const verifiedToday = 326;
  const humanAssistedToday = 198;
  return {
    queue: {
      open: conversations.filter((item) => item.status === "open").length,
      slaRisk: conversations.filter((item) => item.slaRisk !== "none").length,
      critical: conversations.filter((item) => item.priority === "critical").length,
      waitingAgent: conversations.filter((item) => item.status === "waiting_agent").length,
    },
    verifiedToday,
    humanAssistedToday,
    estimatedMinutesSaved: 1240,
    aiQuality,
    emergingIssues,
    knowledgeSources,
    knowledgeGaps,
    volumeSeries,
  };
}

export async function getConversationList() {
  await wait(90);
  return conversations;
}

export async function getConversationDetail(id: string): Promise<ConversationDetail> {
  await wait(70);
  return resolveDetail(id);
}


export async function getIntelligenceIssues() {
  await wait(85);
  return emergingIssues;
}

export async function getIntelligenceIssue(id: string) {
  await wait(65);
  return emergingIssues.find((issue) => issue.id === id);
}


export async function getKnowledgeWorkspace() {
  await wait(80);
  return {
    sources: knowledgeSources,
    gaps: knowledgeGaps,
    conflicts: knowledgeConflicts,
    coverage: knowledgeCoverage,
  };
}

export async function getKnowledgeSource(id: string) {
  await wait(55);
  return knowledgeSources.find((source) => source.id === id);
}


export async function getAIQualityWorkspace() {
  await wait(95);
  return {
    outcomes: aiOutcomes,
    failures: aiFailures,
    outcomeSummary: qualityOutcomeSummary,
    trend: qualityTrend,
    modelVersions,
    promptVersions,
    retrievalVersions,
    evaluationSuites,
    evaluationCases,
    evaluationRun,
    shadowSummary,
    automationReadiness,
    shadowSimulations,
    recommendations: qualityRecommendations,
    knowledgeSources,
  };
}


export async function getAutomationWorkspace() {
  await wait(95);
  return {
    summary: automationDecisionsSummary,
    readiness: phaseEReadiness,
    readinessExplanations,
    policies: automationPolicies,
    procedures: automationProcedures,
    actions: actionCatalog,
    approvals: approvalRequests,
    rollouts: rolloutConfigs,
    auditEvents: [featuredAuditEvent, ...automationAuditEvents],
    connectors: connectorHealth,
    incidentGates,
    policyReplay,
    procedureSimulations,
    actionPreviews: actionPreviewScenarios,
    duplicateProtectionExecution,
    knowledgeDowngrade,
    qualityRegressionGate,
    evaluationRun,
    knowledgeSources,
    emergingIssues,
  };
}
