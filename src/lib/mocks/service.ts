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
