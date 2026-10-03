import type {
  AIDraft,
  AIQualityMetrics,
  ConversationDetail,
  ConversationListItem,
  EmergingIssue,
  EvidenceSource,
  KnowledgeGap,
  KnowledgeSource,
  PolicyDecision,
  Priority,
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
  const critical = index % 173 === 0 || index === 3;
  const warning = index % 47 === 0 || index === 0;
  const aiState: ConversationListItem["aiState"] = critical
    ? "human_only"
    : index === 1
      ? "needs_review"
      : index % 7 === 0
        ? "needs_review"
        : index % 3 === 0
          ? "auto_eligible"
          : "draft_ready";

  return {
    id: `conv-${String(index + 1).padStart(5, "0")}`,
    customer: { id: `customer-${index + 1}`, name: names[index % names.length] },
    subject: subjects[i],
    preview:
      i === 0
        ? "I was charged twice and need to understand what happened."
        : i === 1
          ? "Можно ли поставить годовую подписку на паузу на два месяца?"
          : i === 2
            ? "Сәлем, тапсырысым тағы кешігіп жатыр."
            : i === 3
              ? "I received a login alert from a device I do not recognize."
              : "Can you help me with this request?",
    channel: (["email", "web", "telegram", "whatsapp"] as const)[index % 4],
    status: critical ? "escalated" : index % 5 === 0 ? "waiting_agent" : "open",
    priority: critical ? "critical" : warning ? "high" : index % 3 === 0 ? "medium" : "low",
    category: categories[i],
    unread: index % 4 === 0,
    aiState,
    slaRisk: critical ? "breach" : warning ? "warning" : "none",
    updatedAt: new Date(Date.UTC(2026, 9, 3, 7, 0) - index * 67_000).toISOString(),
  };
});

const paymentEvidence: EvidenceSource[] = [
  {
    id: "ev-payment-policy",
    title: "Payment authorization policy",
    section: "Duplicate authorization holds",
    sourceType: "policy",
    authority: "authoritative",
    freshness: "fresh",
    updatedAt: "2026-09-29T10:00:00Z",
    excerpt:
      "When two authorization holds appear for one checkout attempt, support may confirm the order state and explain that the duplicate pending authorization is not a settled charge. Do not promise a release time that is not supplied by the issuer.",
  },
  {
    id: "ev-order-record",
    title: "Order #KZ-43821",
    section: "Payment events",
    sourceType: "system_record",
    authority: "authoritative",
    freshness: "fresh",
    updatedAt: "2026-10-03T06:54:00Z",
    excerpt: "One captured payment and one pending issuer authorization are present. No second capture was recorded.",
  },
];

const blockedSecurityPolicy: PolicyDecision[] = [
  {
    action: "Reset account credentials",
    decision: "blocked",
    reasons: ["Security risk detected", "Identity is not verified", "Human security review is required"],
  },
];

function priorityFor(index: number): Priority {
  return conversations[index]?.priority ?? "medium";
}

function buildDetail(item: ConversationListItem, index: number): ConversationDetail {
  const scenario = index % 6;
  const baseCustomer = {
    id: item.customer.id,
    name: item.customer.name,
    email: `${item.customer.name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@example.com`,
    company: index % 3 === 0 ? "Nomad Market" : undefined,
    locale: scenario === 2 ? "kk-KZ" : scenario === 1 ? "ru-KZ" : "en",
    plan: index % 4 === 0 ? "Growth" : "Team",
    lifetimeValue: 420 + (index % 9) * 175,
    priorConversationCount: 1 + (index % 8),
    tags: scenario === 0 ? ["payments", "repeat-contact"] : [item.category.toLowerCase()],
  };

  const commonMessages: ConversationDetail["messages"] = [
    {
      id: `${item.id}-m1`,
      author: "customer",
      body: item.preview,
      createdAt: new Date(Date.parse(item.updatedAt) - 24 * 60_000).toISOString(),
    },
    {
      id: `${item.id}-sys`,
      author: "system",
      body: `Triage completed · ${item.category} · ${item.priority} priority`,
      createdAt: new Date(Date.parse(item.updatedAt) - 23 * 60_000).toISOString(),
    },
  ];

  if (scenario === 0) {
    return {
      id: item.id,
      customer: baseCustomer,
      subject: item.subject,
      status: item.status,
      priority: priorityFor(index),
      category: "Payments",
      subcategory: "Duplicate authorization",
      summary: "Customer sees two card authorizations after one checkout. System records show one captured payment and one pending issuer hold.",
      triageSignals: [
        { label: "Financial impact", kind: "risk", contribution: 0.42, explanation: "Payment-related issue with possible duplicate charge perception." },
        { label: "Repeat-contact cluster", kind: "repeat_contact", contribution: 0.24, explanation: "Matches 74 similar conversations in the last 6 hours." },
        { label: "SLA warning", kind: "sla", contribution: 0.18, explanation: "Conversation is approaching the high-priority response target." },
      ],
      messages: commonMessages,
      evidence: paymentEvidence,
      aiDraft: {
        id: `${item.id}-draft`,
        state: "ready",
        text: "I checked the payment record. There is one completed charge and one additional pending authorization, not a second captured payment. I can share the transaction reference with you, and if the pending authorization remains, your card issuer can confirm its release timeline.",
        unsupportedClaims: [],
        evidenceIds: paymentEvidence.map((source) => source.id),
        suggestedActions: ["Share transaction reference", "Monitor pending authorization"],
      },
      policyDecisions: [
        {
          action: "Send grounded explanation",
          decision: "allowed",
          reasons: ["Authoritative payment policy found", "Order record confirms one captured payment", "No write action required"],
        },
      ],
      similarConversationIds: ["conv-00007", "conv-00013", "conv-00019"],
    };
  }

  if (scenario === 1) {
    const source: EvidenceSource = {
      id: "ev-subscription-legacy",
      title: "Subscription changes — legacy",
      section: "Pause",
      sourceType: "internal_doc",
      authority: "supporting",
      freshness: "stale",
      updatedAt: "2026-03-11T10:00:00Z",
      excerpt: "Legacy guidance mentions pause requests but does not define eligibility for annual plans.",
    };
    const draft: AIDraft = {
      id: `${item.id}-draft`,
      state: "blocked",
      text: "I can help check whether your annual plan is eligible for a pause.",
      unsupportedClaims: [{ text: "Annual plans can be paused for up to two months.", reason: "No authoritative current source supports this policy claim." }],
      evidenceIds: [source.id],
      suggestedActions: ["Ask billing owner for current policy", "Create knowledge gap"],
    };
    return {
      id: item.id,
      customer: baseCustomer,
      subject: item.subject,
      status: "waiting_agent",
      priority: "medium",
      category: "Subscription",
      subcategory: "Pause eligibility",
      summary: "Customer asks whether an annual subscription can be paused. Current approved knowledge does not define eligibility.",
      triageSignals: [{ label: "Knowledge gap", kind: "policy", explanation: "No authoritative current source answers the requested eligibility rule." }],
      messages: commonMessages,
      evidence: [source],
      aiDraft: draft,
      policyDecisions: [{ action: "Answer pause eligibility", decision: "blocked", reasons: ["No authoritative source", "Legacy source is stale", "Policy claim would be unsupported"] }],
      similarConversationIds: ["conv-00008", "conv-00014"],
    };
  }

  if (scenario === 3) {
    return {
      id: item.id,
      customer: baseCustomer,
      subject: item.subject,
      status: "escalated",
      priority: "critical",
      category: "Security",
      subcategory: "Account takeover suspicion",
      summary: "Customer reports an unrecognized login. Automation is blocked until identity and security checks are completed by a human reviewer.",
      triageSignals: [
        { label: "Security risk", kind: "risk", contribution: 0.7, explanation: "Possible account takeover requires mandatory escalation." },
        { label: "Identity missing", kind: "policy", contribution: 0.3, explanation: "No verified identity signal is available for a write action." },
      ],
      messages: commonMessages,
      evidence: [],
      aiDraft: {
        id: `${item.id}-draft`,
        state: "blocked",
        text: "I’m escalating this to our security team now. Please do not share passwords or one-time codes in this conversation.",
        unsupportedClaims: [],
        evidenceIds: [],
        suggestedActions: ["Escalate to Security"],
      },
      policyDecisions: blockedSecurityPolicy,
      similarConversationIds: [],
    };
  }

  const generalEvidence: EvidenceSource = {
    id: `${item.id}-ev-1`,
    title: scenario === 2 ? "Delivery operations guide" : "Customer operations handbook",
    section: item.category,
    sourceType: "help_center",
    authority: "authoritative",
    freshness: scenario === 4 ? "aging" : "fresh",
    updatedAt: "2026-09-21T10:00:00Z",
    excerpt: `Current approved guidance for ${item.category.toLowerCase()} requests and escalation boundaries.`,
  };
  return {
    id: item.id,
    customer: baseCustomer,
    subject: item.subject,
    status: item.status,
    priority: item.priority,
    category: item.category,
    summary: scenario === 2 ? "Repeat delivery delay for the same customer; route status is available and a proactive update is recommended." : `Customer needs help with ${item.category.toLowerCase()}. The current source supports a concise response.`,
    triageSignals: scenario === 2
      ? [{ label: "Repeat contact", kind: "repeat_contact", contribution: 0.36, explanation: "Third delivery-related contact in 30 days." }]
      : [{ label: "Current source", kind: "policy", explanation: "An authoritative source covers the requested information." }],
    messages: commonMessages,
    evidence: [generalEvidence],
    aiDraft: {
      id: `${item.id}-draft`,
      state: index % 7 === 0 ? "needs_review" : "ready",
      text: scenario === 2 ? "Тапсырысыңыздың қайта кешіккенін көріп тұрмын. Қазір жеткізу мәртебесін тексеріп, нақты жаңартуды жіберемін." : "I found the current guidance for this request. Here is the shortest useful answer based on the approved source.",
      unsupportedClaims: [],
      evidenceIds: [generalEvidence.id],
      suggestedActions: ["Reply", "Add internal note"],
    },
    policyDecisions: [{ action: "Send reply", decision: index % 7 === 0 ? "human_approval" : "allowed", reasons: index % 7 === 0 ? ["Review required for this intent"] : ["Authoritative source available", "No restricted action"] }],
    similarConversationIds: [],
  };
}

export const detailedConversations: ConversationDetail[] = conversations.slice(0, 64).map(buildDetail);

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
      { label: "checkout-web 2026.10.03-rc2", strength: "moderate", disclaimer: "Release timing correlates with the increase; root cause is not confirmed." },
    ],
    representativeConversationIds: ["conv-00001", "conv-00007", "conv-00019"],
  },
  {
    id: "issue-delivery-west",
    title: "Delivery-delay contacts elevated in west region",
    status: "watching",
    severity: "medium",
    growthPercent: 42,
    conversationCount: 39,
    uniqueCustomerCount: 35,
    firstSeenAt: "2026-10-02T18:10:00Z",
    summary: "Delivery ETA questions are above the 30-day baseline, but absolute volume remains below incident threshold.",
    relatedProductArea: "Delivery",
    correlationCandidates: [{ label: "Carrier feed lag", strength: "weak", disclaimer: "Timing overlaps with delayed carrier updates; no root cause is confirmed." }],
    representativeConversationIds: ["conv-00003", "conv-00009"],
  },
];

export const knowledgeSources: KnowledgeSource[] = [
  { id: "ks-1", title: "Payment authorization policy", type: "Policy", owner: "Payments Ops", status: "healthy", lastUpdatedAt: "2026-09-29T10:00:00Z", retrievalCount30d: 892, coverageTopics: ["Duplicate charge", "Authorization", "Refund"] },
  { id: "ks-2", title: "Subscription changes — legacy", type: "Internal doc", owner: "Lifecycle", status: "conflict", lastUpdatedAt: "2026-03-11T10:00:00Z", retrievalCount30d: 122, coverageTopics: ["Pause", "Cancel"] },
  { id: "ks-3", title: "Delivery operations guide", type: "Help center", owner: "Delivery Ops", status: "healthy", lastUpdatedAt: "2026-09-21T10:00:00Z", retrievalCount30d: 614, coverageTopics: ["ETA", "Delay", "Carrier"] },
];

export const knowledgeGaps: KnowledgeGap[] = [
  { id: "gap-1", topic: "Subscription pause eligibility", conversationCount: 32, firstSeenAt: "2026-09-28T08:00:00Z", exampleQuestion: "Can I pause my annual plan for two months?", status: "open" },
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

export const volumeSeries = Array.from({ length: 24 }, (_, hour) => ({
  hour: `${String(hour).padStart(2, "0")}:00`,
  conversations: 72 + ((hour * 17) % 43) + (hour >= 9 && hour <= 17 ? 44 : 0),
  slaRisk: 4 + ((hour * 7) % 11) + (hour === 12 || hour === 13 ? 9 : 0),
}));

export function resolveDetail(id: string): ConversationDetail {
  const existing = detailedConversations.find((item) => item.id === id);
  if (existing) return existing;
  const index = Math.max(0, conversations.findIndex((item) => item.id === id));
  return buildDetail(conversations[index] ?? conversations[0], index);
}
