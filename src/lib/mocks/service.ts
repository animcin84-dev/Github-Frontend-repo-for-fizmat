import { aiQuality, conversations, emergingIssues, knowledgeGaps, knowledgeSources, resolveDetail, volumeSeries } from "@/lib/mocks/data";
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
