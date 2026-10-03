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


function issueTimeline(
  baseLow: number,
  baseHigh: number,
  spikeStart: number,
  spikeStep: number,
  markerIndex?: number,
  marker?: string,
): EmergingIssue["timeline"] {
  return Array.from({ length: 24 }, (_, index) => {
    const baselineLow = baseLow + (index % 3);
    const baselineHigh = baseHigh + (index % 4);
    const preSpike = baselineLow + ((index * 5 + spikeStep) % Math.max(2, baselineHigh - baselineLow + 1));
    const actual = index >= spikeStart ? baselineHigh + (index - spikeStart + 1) * spikeStep : preSpike;
    return {
      time: `${String(index).padStart(2, "0")}:00`,
      actual,
      baselineLow,
      baselineHigh,
      marker: markerIndex === index ? marker : undefined,
    };
  });
}

export const emergingIssues: EmergingIssue[] = [
  {
    id: "issue-duplicate-payment",
    title: "Duplicate card authorization",
    status: "incident",
    severity: "high",
    growthPercent: 186,
    conversationCount: 74,
    uniqueCustomerCount: 61,
    firstSeenAt: "2026-10-03T05:12:00Z",
    lastActivityAt: "2026-10-03T09:08:00Z",
    activeMinutes: 236,
    summary: "Customers report two card authorizations after one checkout attempt. One capture is visible in system records; the second event is commonly still pending.",
    relatedProductArea: "Checkout / payments",
    signalCategory: "billing_payment",
    evidenceState: "sufficient",
    owner: "Payments Ops",
    baselinePerHour: [4, 9],
    currentPerHour: 31,
    correlationCandidates: [
      {
        label: "checkout-web 2026.10.03-rc2",
        strength: "moderate",
        reason: "The release preceded the first sustained increase by 22 minutes and affects the same checkout surface.",
        eventAt: "2026-10-03T04:50:00Z",
        firstSignalAt: "2026-10-03T05:12:00Z",
        disclaimer: "Deployment timing overlaps with issue growth. Root cause is not confirmed.",
      },
    ],
    representativeConversationIds: ["conv-00001", "conv-00007", "conv-00019", "conv-00031"],
    commonPhrases: [
      { phrase: "charged twice", count: 34 },
      { phrase: "two pending card transactions", count: 19 },
      { phrase: "payment duplicated", count: 14 },
    ],
    evidenceSummary: {
      sampleSize: 74,
      windowLabel: "Last 6 hours",
      affectedCustomers: 61,
      languages: [{ locale: "en", count: 41 }, { locale: "ru-KZ", count: 22 }, { locale: "kk-KZ", count: 11 }],
      productAreas: ["Checkout", "Payments"],
      categories: [{ label: "Duplicate authorization", count: 55 }, { label: "Payment status", count: 19 }],
    },
    timeline: issueTimeline(4, 9, 15, 4, 14, "checkout-web rc2"),
    relatedKnowledgeIds: ["ks-payment-auth", "ks-checkout-troubleshooting"],
  },
  {
    id: "issue-checkout-failure",
    title: "Cannot complete checkout",
    status: "emerging",
    severity: "critical",
    growthPercent: 143,
    conversationCount: 58,
    uniqueCustomerCount: 54,
    firstSeenAt: "2026-10-03T06:04:00Z",
    lastActivityAt: "2026-10-03T09:10:00Z",
    activeMinutes: 186,
    summary: "Checkout attempts fail after address validation for a subset of mobile web sessions.",
    relatedProductArea: "Checkout",
    signalCategory: "product_bug",
    evidenceState: "sufficient",
    owner: "Checkout",
    baselinePerHour: [3, 7],
    currentPerHour: 17,
    correlationCandidates: [
      {
        label: "address-validator ruleset 42",
        strength: "weak",
        reason: "The ruleset changed within the observation window, but affected conversations do not yet contain enough structured device evidence.",
        eventAt: "2026-10-03T05:40:00Z",
        firstSignalAt: "2026-10-03T06:04:00Z",
        disclaimer: "Temporal overlap only. Root cause is not confirmed.",
      },
    ],
    representativeConversationIds: ["conv-00005", "conv-00011", "conv-00023"],
    commonPhrases: [{ phrase: "checkout keeps failing", count: 21 }, { phrase: "address accepted then error", count: 16 }, { phrase: "cannot place order", count: 13 }],
    evidenceSummary: {
      sampleSize: 58,
      windowLabel: "Last 4 hours",
      affectedCustomers: 54,
      languages: [{ locale: "en", count: 38 }, { locale: "ru-KZ", count: 14 }, { locale: "kk-KZ", count: 6 }],
      productAreas: ["Checkout", "Address validation"],
      categories: [{ label: "Checkout error", count: 44 }, { label: "Address validation", count: 14 }],
    },
    timeline: issueTimeline(3, 7, 17, 3, 16, "ruleset 42"),
    relatedKnowledgeIds: ["ks-checkout-troubleshooting"],
  },
  {
    id: "issue-delivery-mismatch",
    title: "Delivery status mismatch",
    status: "emerging",
    severity: "medium",
    growthPercent: 68,
    conversationCount: 49,
    uniqueCustomerCount: 45,
    firstSeenAt: "2026-10-02T19:10:00Z",
    lastActivityAt: "2026-10-03T08:56:00Z",
    activeMinutes: 826,
    summary: "Carrier tracking and customer-facing delivery status disagree for several routes in western Kazakhstan.",
    relatedProductArea: "Delivery",
    signalCategory: "external_dependency",
    evidenceState: "limited",
    owner: "Delivery Ops",
    baselinePerHour: [5, 10],
    currentPerHour: 15,
    correlationCandidates: [
      {
        label: "Carrier status feed lag",
        strength: "moderate",
        reason: "The mismatch is concentrated in routes whose carrier updates arrived later than the storefront refresh cycle.",
        firstSignalAt: "2026-10-02T19:10:00Z",
        disclaimer: "Carrier feed timing is correlated with the reports; independent carrier telemetry is required to confirm cause.",
      },
    ],
    representativeConversationIds: ["conv-00003", "conv-00009", "conv-00015"],
    commonPhrases: [{ phrase: "tracking says delivered", count: 18 }, { phrase: "status has not updated", count: 17 }, { phrase: "courier page is different", count: 9 }],
    evidenceSummary: {
      sampleSize: 49,
      windowLabel: "Last 14 hours",
      affectedCustomers: 45,
      languages: [{ locale: "kk-KZ", count: 22 }, { locale: "ru-KZ", count: 19 }, { locale: "en", count: 8 }],
      productAreas: ["Delivery", "Tracking"],
      categories: [{ label: "Tracking mismatch", count: 36 }, { label: "Delivery delay", count: 13 }],
    },
    timeline: issueTimeline(5, 10, 12, 2),
    relatedKnowledgeIds: ["ks-delivery-guide", "ks-carrier-status"],
  },
  {
    id: "issue-login-loop",
    title: "Password reset loop",
    status: "watching",
    severity: "high",
    growthPercent: 54,
    conversationCount: 37,
    uniqueCustomerCount: 34,
    firstSeenAt: "2026-10-02T16:44:00Z",
    lastActivityAt: "2026-10-03T08:41:00Z",
    activeMinutes: 957,
    summary: "Customers complete password reset but are redirected to reset again on the next sign-in attempt.",
    relatedProductArea: "Identity",
    signalCategory: "ux_confusion",
    evidenceState: "limited",
    owner: "Identity",
    baselinePerHour: [2, 5],
    currentPerHour: 8,
    correlationCandidates: [],
    representativeConversationIds: ["conv-00004", "conv-00010", "conv-00016"],
    commonPhrases: [{ phrase: "reset sends me back", count: 15 }, { phrase: "new password not accepted", count: 12 }, { phrase: "stuck in password reset", count: 7 }],
    evidenceSummary: {
      sampleSize: 37,
      windowLabel: "Last 17 hours",
      affectedCustomers: 34,
      languages: [{ locale: "en", count: 24 }, { locale: "ru-KZ", count: 9 }, { locale: "kk-KZ", count: 4 }],
      productAreas: ["Identity", "Password reset"],
      categories: [{ label: "Reset loop", count: 28 }, { label: "Sign-in failure", count: 9 }],
    },
    timeline: issueTimeline(2, 5, 16, 1),
    relatedKnowledgeIds: ["ks-account-recovery"],
  },
  {
    id: "issue-subscription-pause",
    title: "Subscription pause eligibility questions",
    status: "emerging",
    severity: "medium",
    growthPercent: 41,
    conversationCount: 32,
    uniqueCustomerCount: 31,
    firstSeenAt: "2026-09-28T08:00:00Z",
    lastActivityAt: "2026-10-03T08:22:00Z",
    activeMinutes: 7222,
    summary: "Repeated annual-plan pause questions have no authoritative current answer. AI drafts are paused when eligibility is requested.",
    relatedProductArea: "Subscriptions",
    signalCategory: "missing_knowledge",
    evidenceState: "sufficient",
    owner: "Lifecycle",
    baselinePerHour: [1, 3],
    currentPerHour: 5,
    correlationCandidates: [],
    representativeConversationIds: ["conv-00002", "conv-00008", "conv-00014"],
    commonPhrases: [{ phrase: "pause annual plan", count: 17 }, { phrase: "freeze subscription", count: 9 }, { phrase: "pause for two months", count: 6 }],
    evidenceSummary: {
      sampleSize: 32,
      windowLabel: "Last 7 days",
      affectedCustomers: 31,
      languages: [{ locale: "ru-KZ", count: 17 }, { locale: "en", count: 10 }, { locale: "kk-KZ", count: 5 }],
      productAreas: ["Subscriptions"],
      categories: [{ label: "Pause eligibility", count: 32 }],
    },
    timeline: issueTimeline(1, 3, 13, 1),
    relatedKnowledgeIds: ["ks-subscription-legacy", "ks-subscription-policy-2026"],
  },
  {
    id: "issue-invoice-details",
    title: "Invoice company details confusion",
    status: "watching",
    severity: "low",
    growthPercent: 29,
    conversationCount: 27,
    uniqueCustomerCount: 26,
    firstSeenAt: "2026-10-01T11:20:00Z",
    lastActivityAt: "2026-10-03T07:50:00Z",
    activeMinutes: 2670,
    summary: "Business customers are unsure where company tax details can be updated before invoice issuance.",
    relatedProductArea: "Billing",
    signalCategory: "ux_confusion",
    evidenceState: "sufficient",
    owner: "Billing",
    baselinePerHour: [2, 4],
    currentPerHour: 5,
    correlationCandidates: [],
    representativeConversationIds: ["conv-00006", "conv-00012", "conv-00018"],
    commonPhrases: [{ phrase: "change company details", count: 13 }, { phrase: "invoice tax ID", count: 8 }, { phrase: "billing details before invoice", count: 6 }],
    evidenceSummary: {
      sampleSize: 27,
      windowLabel: "Last 3 days",
      affectedCustomers: 26,
      languages: [{ locale: "en", count: 14 }, { locale: "ru-KZ", count: 10 }, { locale: "kk-KZ", count: 3 }],
      productAreas: ["Billing", "Invoices"],
      categories: [{ label: "Invoice details", count: 27 }],
    },
    timeline: issueTimeline(2, 4, 18, 1),
    relatedKnowledgeIds: ["ks-invoice-details"],
  },
  {
    id: "issue-ru-kz-refund-language",
    title: "RU/KZ refund wording ambiguity",
    status: "watching",
    severity: "medium",
    growthPercent: 36,
    conversationCount: 24,
    uniqueCustomerCount: 23,
    firstSeenAt: "2026-10-02T12:05:00Z",
    lastActivityAt: "2026-10-03T08:14:00Z",
    activeMinutes: 1209,
    summary: "Russian and Kazakh customers interpret refund timing language differently across two support sources.",
    relatedProductArea: "Refunds",
    signalCategory: "policy_ambiguity",
    evidenceState: "limited",
    owner: "Payments Ops",
    baselinePerHour: [1, 3],
    currentPerHour: 4,
    correlationCandidates: [],
    representativeConversationIds: ["conv-00005", "conv-00017", "conv-00029"],
    commonPhrases: [{ phrase: "возврат за 14 дней", count: 11 }, { phrase: "қайтарым қашан түседі", count: 8 }, { phrase: "refund window", count: 5 }],
    evidenceSummary: {
      sampleSize: 24,
      windowLabel: "Last 21 hours",
      affectedCustomers: 23,
      languages: [{ locale: "ru-KZ", count: 13 }, { locale: "kk-KZ", count: 9 }, { locale: "en", count: 2 }],
      productAreas: ["Refunds", "Localized help"],
      categories: [{ label: "Policy wording", count: 18 }, { label: "Refund timing", count: 6 }],
    },
    timeline: issueTimeline(1, 3, 17, 1),
    relatedKnowledgeIds: ["ks-refund-policy", "ks-refund-help-ru"],
  },
  {
    id: "issue-coupon-noise",
    title: "Coupon question spike",
    status: "watching",
    severity: "low",
    growthPercent: 92,
    conversationCount: 11,
    uniqueCustomerCount: 11,
    firstSeenAt: "2026-10-03T07:22:00Z",
    lastActivityAt: "2026-10-03T08:49:00Z",
    activeMinutes: 87,
    summary: "A small cluster asks whether a public coupon applies to renewals. Volume growth is high but the sample remains below investigation threshold.",
    relatedProductArea: "Promotions",
    signalCategory: "unknown",
    evidenceState: "watch_only",
    baselinePerHour: [0, 2],
    currentPerHour: 4,
    correlationCandidates: [],
    representativeConversationIds: ["conv-00020", "conv-00026"],
    commonPhrases: [{ phrase: "coupon on renewal", count: 6 }, { phrase: "promo code existing plan", count: 5 }],
    evidenceSummary: {
      sampleSize: 11,
      windowLabel: "Last 2 hours",
      affectedCustomers: 11,
      languages: [{ locale: "en", count: 8 }, { locale: "ru-KZ", count: 3 }],
      productAreas: ["Promotions"],
      categories: [{ label: "Coupon eligibility", count: 11 }],
    },
    timeline: issueTimeline(0, 2, 20, 1),
    relatedKnowledgeIds: ["ks-promotions"],
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
