import type {
  AIQualityMetrics,
  ConversationListItem,
  EmergingIssue,
  KnowledgeGap,
  KnowledgeSource,
} from "@/lib/domain";

const names = ["Aruzhan K.", "Daniyar S.", "Amina R.", "Nursultan T.", "Mira Lee", "Alex Morgan"];
const subjects = [
  "Duplicate card charge",
  "Pause subscription policy",
  "Delivery is late again",
  "Account login warning",
  "Refund status",
  "Invoice company details",
];
const categories = ["Payments", "Subscription", "Delivery", "Security", "Refunds", "Billing"];

export const conversations: ConversationListItem[] = Array.from({ length: 5200 }, (_, index) => {
  const i = index % subjects.length;
  const critical = index % 173 === 0;
  const warning = index % 47 === 0;
  return {
    id: `conv-${String(index + 1).padStart(5, "0")}`,
    customer: { id: `customer-${index + 1}`, name: names[index % names.length] },
    subject: subjects[i],
    preview: index % 3 === 0 ? "I was charged twice and need to understand what happened." : "Can you help me with this request?",
    channel: (["email", "web", "telegram", "whatsapp"] as const)[index % 4],
    status: critical ? "escalated" : index % 5 === 0 ? "waiting_agent" : "open",
    priority: critical ? "critical" : warning ? "high" : index % 3 === 0 ? "medium" : "low",
    category: categories[i],
    unread: index % 4 === 0,
    aiState: critical ? "human_only" : index % 7 === 0 ? "needs_review" : index % 3 === 0 ? "auto_eligible" : "draft_ready",
    slaRisk: critical ? "breach" : warning ? "warning" : "none",
    updatedAt: new Date(Date.UTC(2026, 9, 3, 7, 0) - index * 67_000).toISOString(),
  };
});

export const emergingIssues: EmergingIssue[] = [
  {
    id: "issue-duplicate-payment",
    title: "Duplicate payment reports increased after checkout release",
    status: "emerging",
    severity: "high",
    growthPercent: 186,
    conversationCount: 74,
    uniqueCustomerCount: 61,
    firstSeenAt: "2026-10-03T05:12:00Z",
    summary: "A multilingual cluster of customers reports two card authorizations for one checkout attempt.",
    relatedProductArea: "Checkout / payments",
    correlationCandidates: [
      {
        label: "checkout-web 2026.10.03-rc2",
        strength: "moderate",
        disclaimer: "Release timing correlates with the increase; root cause is not confirmed.",
      },
    ],
    representativeConversationIds: ["conv-00001", "conv-00007", "conv-00019"],
  },
];

export const knowledgeSources: KnowledgeSource[] = [
  {
    id: "ks-1",
    title: "Payment authorization policy",
    type: "Policy",
    owner: "Payments Ops",
    status: "healthy",
    lastUpdatedAt: "2026-09-29T10:00:00Z",
    retrievalCount30d: 892,
    coverageTopics: ["Duplicate charge", "Authorization", "Refund"],
  },
  {
    id: "ks-2",
    title: "Subscription changes — legacy",
    type: "Internal doc",
    owner: "Lifecycle",
    status: "conflict",
    lastUpdatedAt: "2026-03-11T10:00:00Z",
    retrievalCount30d: 122,
    coverageTopics: ["Pause", "Cancel"],
  },
];

export const knowledgeGaps: KnowledgeGap[] = [
  {
    id: "gap-1",
    topic: "Subscription pause eligibility",
    conversationCount: 32,
    firstSeenAt: "2026-09-28T08:00:00Z",
    exampleQuestion: "Can I pause my annual plan for two months?",
    status: "open",
  },
];

export const aiQuality: AIQualityMetrics = {
  draftAcceptanceRate: 0.81,
  unchangedRate: 0.58,
  minorEditRate: 0.23,
  majorEditRate: 0.11,
  rejectionRate: 0.08,
  humanTakeoverRate: 0.14,
  reopenRate: 0.037,
  unsupportedClaimRate: 0.012,
};
