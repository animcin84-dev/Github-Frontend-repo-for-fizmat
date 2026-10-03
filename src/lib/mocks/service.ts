import { aiQuality, conversations, emergingIssues, knowledgeGaps, knowledgeSources } from "@/lib/mocks/data";

const wait = (ms = 140) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getWorkspaceSnapshot() {
  await wait();
  return {
    queue: {
      open: conversations.filter((item) => item.status === "open").length,
      slaRisk: conversations.filter((item) => item.slaRisk !== "none").length,
      critical: conversations.filter((item) => item.priority === "critical").length,
    },
    aiQuality,
    emergingIssues,
    knowledgeSources,
    knowledgeGaps,
  };
}

export async function getConversationList() {
  await wait(90);
  return conversations;
}
