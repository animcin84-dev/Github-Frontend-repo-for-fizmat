import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { ConversationAnalysis, ConversationDetail, ConversationListItem } from "@/lib/domain";

// These tests prove UI boundaries using synthetic API responses, not real AI acceptance.
const conversationId = "55555555-5555-4555-8555-555555555555";
const facts = {
  language: "English", category: "Billing", subcategory: "Duplicate charge", intent: "duplicate_charge",
  entities: [{ type: "order_id", value: "10452" }], riskFlags: ["financial"], impact: "individual",
  customerBlocked: true, requestedAction: "Refund the duplicate charge", route: "billing_support",
  summary: "Synthetic customer reports a duplicate charge for order 10452 and cannot proceed.",
} satisfies NonNullable<ConversationAnalysis["result"]>;
const reason = "Duplicate-charge financial risk with the customer blocked.";
const completed: ConversationAnalysis = {
  id: "synthetic-analysis", status: "completed", configured: true, stale: false,
  provider: "groq", model: "openai/gpt-oss-120b", promptVersion: "triage-facts-v2",
  workflowVersion: "triage-workflow-v1", priorityPolicyVersion: "triage-priority-v1",
  startedAt: "2026-10-04T10:00:00Z", finishedAt: "2026-10-04T10:00:01Z",
  result: facts, priority: "high", priorityReasons: [reason],
};

function syntheticDetail(analysis: ConversationAnalysis): ConversationDetail {
  const current = analysis.status === "completed" && !analysis.stale;
  return {
    id: conversationId, customer: { id: "synthetic-customer", name: "Synthetic customer", email: "customer@example.test", priorConversationCount: 0, tags: [] },
    subject: "Mocked UI triage regression", status: "new", priority: current ? "high" : "untriaged",
    category: current ? "Billing" : "Untriaged", source: "gmail", providerLabel: "Gmail",
    integrationAccountId: "synthetic-integration", providerConversationId: "synthetic-gmail-thread", replyMode: "gmail_real",
    analysisState: analysis.stale ? "pending" : analysis.status, analysis,
    summary: current ? facts.summary : "Analysis pending", triageSignals: [], evidence: [], policyDecisions: [], similarConversationIds: [],
    messages: [{ id: "synthetic-message", providerMessageId: "synthetic-provider-message", author: "customer", body: "I was charged twice for order #10452 and cannot proceed. Please help.", createdAt: "2026-10-04T09:00:00Z" }],
  };
}

async function mockInbox(page: Page, initial: ConversationAnalysis, failFirst = false) {
  let analysis = initial;
  let analysesRequested = 0;
  let repliesRequested = 0;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/integrations/gmail/status", (route) => route.fulfill({ json: { mode: "database", connected: true, watchConfigured: false } }));
  await page.route("**/api/conversations", (route) => {
    const detail = syntheticDetail(analysis);
    const item: ConversationListItem = {
      ...detail, channel: "email", preview: detail.messages[0].body, unread: true,
      updatedAt: detail.messages[0].createdAt, aiState: "unanalyzed", slaRisk: "none",
    };
    return route.fulfill({ json: [item] });
  });
  await page.route(`**/api/conversations/${conversationId}`, (route) => route.fulfill({ json: syntheticDetail(analysis) }));
  await page.route(`**/api/conversations/${conversationId}/analyze`, (route) => {
    expect(route.request().method()).toBe("POST");
    analysesRequested += 1;
    if (failFirst && analysesRequested === 1) {
      analysis = { ...completed, status: "failed", result: undefined, priority: undefined, priorityReasons: [], error: { code: "validation_failed", message: "Synthetic triage failure. Please retry." } };
      return route.fulfill({ status: 502, json: { error: "validation_failed", message: analysis.error!.message } });
    }
    analysis = completed;
    return route.fulfill({ json: analysis });
  });
  await page.route(`**/api/conversations/${conversationId}/reply`, (route) => {
    repliesRequested += 1;
    return route.fulfill({ status: 500, json: { message: "This mocked UI test must never send a reply." } });
  });
  return {
    analysesRequested: () => analysesRequested,
    repliesRequested: () => repliesRequested,
    markStale: () => { analysis = { ...completed, stale: true, result: undefined, priority: undefined, priorityReasons: [] }; },
  };
}

async function expectUnclaimedCapabilities(page: Page) {
  const panel = page.getByRole("region", { name: "Conversation triage" });
  for (const [label, state] of [
    ["Knowledge evidence", "Not generated yet"], ["Answer readiness", "Not evaluated"],
    ["AI draft", "Not generated"], ["Automation", "Not evaluated"],
  ]) {
    await expect(panel.locator("div.rounded-md").filter({ has: page.getByText(label, { exact: true }) }).getByText(state, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Approve & send", exact: true })).toHaveCount(0);
  await expect(page.getByText("SIMULATION", { exact: true })).toHaveCount(0);
}

async function expectCompletedFacts(page: Page) {
  const panel = page.getByRole("region", { name: "Conversation triage" });
  await expect(panel.getByText("Complete", { exact: true })).toBeVisible();
  for (const value of ["Billing", "duplicate charge", "financial", "high", reason]) {
    await expect(panel.getByText(value, { exact: true })).toBeVisible();
  }
  await expectUnclaimedCapabilities(page);
}

test.describe("P2A triage foundation with mocked UI APIs", () => {
  test("missing provider key keeps real-shaped data pending and Analyze disabled", async ({ page }) => {
    const calls = await mockInbox(page, { status: "pending", configured: false, stale: false });
    await page.goto(`/inbox/${conversationId}`);
    await expect(page.getByRole("button", { name: "Analyze conversation", exact: true })).toBeDisabled();
    await expect(page.getByText("Configure GROQ_API_KEY on the server to enable real triage.")).toBeVisible();
    await expectUnclaimedCapabilities(page);
    expect(calls.analysesRequested()).toBe(0);
    expect(calls.repliesRequested()).toBe(0);
  });

  test("@a11y explicit Analyze refreshes completed facts while Gmail review remains manual", async ({ page }) => {
    const calls = await mockInbox(page, { status: "pending", configured: true, stale: false });
    await page.goto(`/inbox/${conversationId}`);
    await expect(page.getByRole("button", { name: "Analyze conversation", exact: true })).toBeEnabled();
    expect(calls.analysesRequested()).toBe(0);
    await page.getByRole("button", { name: "Analyze conversation", exact: true }).click();
    await expectCompletedFacts(page);
    expect(calls.analysesRequested()).toBe(1);
    await page.reload();
    await expectCompletedFacts(page);
    expect(calls.analysesRequested()).toBe(1);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Gmail reply inspector" });
    await expect(dialog.getByRole("textbox", { name: "Manual Gmail reply" })).toHaveValue("");
    await dialog.getByRole("textbox", { name: "Manual Gmail reply" }).fill("Synthetic manual review only.");
    await dialog.getByRole("button", { name: "Review real send" }).click();
    await expect(dialog.getByRole("button", { name: "Send real email" })).toBeVisible();
    await expect(dialog.getByText("customer@example.test", { exact: true })).toBeVisible();
    expect(calls.repliesRequested()).toBe(0);
  });

  test("failed analysis stays truthful and supports an explicit retry", async ({ page }) => {
    const calls = await mockInbox(page, { status: "pending", configured: true, stale: false }, true);
    await page.goto(`/inbox/${conversationId}`);
    await page.getByRole("button", { name: "Analyze conversation", exact: true }).click();
    const panel = page.getByRole("region", { name: "Conversation triage" });
    await expect(panel.getByRole("alert")).toHaveText("Synthetic triage failure. Please retry.");
    await expect(panel.getByText("Complete", { exact: true })).toHaveCount(0);
    await expectUnclaimedCapabilities(page);
    await page.getByRole("button", { name: "Retry analysis", exact: true }).click();
    await expectCompletedFacts(page);
    await expect(panel.getByRole("alert")).toHaveCount(0);
    expect(calls.analysesRequested()).toBe(2);
    expect(calls.repliesRequested()).toBe(0);
  });

  test("stale completion hides previous facts and priority until reanalysis", async ({ page }) => {
    const stale: ConversationAnalysis = { ...completed, stale: true, result: undefined, priority: undefined, priorityReasons: [] };
    const calls = await mockInbox(page, stale);
    await page.goto(`/inbox/${conversationId}`);
    const panel = page.getByRole("region", { name: "Conversation triage" });
    await expect(panel.getByText("New inbound content needs a fresh analysis. Earlier facts and priority are no longer current.")).toBeVisible();
    await expect(panel.getByText("Complete", { exact: true })).toHaveCount(0);
    await expect(panel.getByText("high", { exact: true })).toHaveCount(0);
    await expect(panel.getByText(facts.summary, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Mocked UI triage regression/ }).getByText("untriaged", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyze conversation", exact: true })).toBeEnabled();
    await expectUnclaimedCapabilities(page);
    expect(calls.analysesRequested()).toBe(0);
  });

  test("sync from Integrations invalidates cached Inbox facts without starting AI", async ({ page }) => {
    const calls = await mockInbox(page, completed);
    await page.route("**/api/integrations/gmail/sync", (route) => {
      expect(route.request().method()).toBe("POST");
      calls.markStale();
      return route.fulfill({ json: { messagesFound: 1, messagesInserted: 1, messagesSkipped: 0, threadsFound: 1 } });
    });
    await page.goto(`/inbox/${conversationId}`);
    await expectCompletedFacts(page);
    await page.locator('a[href="/integrations"]').first().click();
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(page.getByText("Gmail synchronization completed", { exact: true })).toBeVisible();
    await page.locator('a[href="/inbox"]').first().click();
    const panel = page.getByRole("region", { name: "Conversation triage" });
    await expect(panel.getByText("New inbound content needs a fresh analysis. Earlier facts and priority are no longer current.")).toBeVisible();
    await expect(panel.getByText("high", { exact: true })).toHaveCount(0);
    await expect(panel.getByText(facts.summary, { exact: true })).toHaveCount(0);
    expect(calls.analysesRequested()).toBe(0);
    expect(calls.repliesRequested()).toBe(0);
  });
});
