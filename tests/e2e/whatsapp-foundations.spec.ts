import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("WhatsApp setup placeholder does not claim a connection or offer sending", async ({ page }) => {
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();
  await expect(page.getByText("SETUP REQUIRED", { exact: true })).toBeVisible();
  await expect(page.getByText("CONNECTED", { exact: true })).toHaveCount(0);
  await expect(page.getByText("WHATSAPP_ACCESS_TOKEN", { exact: false })).toBeVisible();
  await expect(page.getByText("Not verified", { exact: true })).toBeVisible();
});

test.describe("WhatsApp Inbox with synthetic API responses", () => {
  const id = "44444444-4444-4444-8444-444444444444";
  const item = {
    id, customer: { id: "synthetic-phone", name: "WhatsApp fixture customer" },
    subject: "WhatsApp conversation", preview: "Synthetic customer text <script>untrusted</script>",
    channel: "whatsapp", source: "whatsapp", providerLabel: "WhatsApp", status: "new", unread: true,
    priority: "untriaged", category: "Untriaged", analysisState: "pending", aiState: "unanalyzed",
    slaRisk: "none", updatedAt: "2026-10-03T12:00:00Z",
  };
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/integrations/gmail/status", (route) => route.fulfill({ json: { mode: "database", connected: false, watchConfigured: false } }));
    await page.route("**/api/conversations", (route) => route.fulfill({ json: [item] }));
    await page.route(`**/api/conversations/${id}`, (route) => route.fulfill({ json: {
      ...item, customer: { ...item.customer, phone: "15551234567", priorConversationCount: 0, tags: ["whatsapp"] },
      replyMode: "unavailable", summary: "Analysis pending", triageSignals: [], evidence: [], policyDecisions: [], similarConversationIds: [],
      integrationAccountId: "synthetic-integration", providerConversationId: "15551234567",
      messages: [{ id: "synthetic-message", author: "customer", body: item.preview, createdAt: item.updatedAt, from: "15551234567", providerMessageId: "wamid.synthetic" }],
    } }));
  });

  test("unified Inbox shows WhatsApp provenance and no simulated reply flow", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/inbox/${id}?channel=whatsapp`);
    await expect(page.getByRole("heading", { name: "WhatsApp conversation" })).toBeVisible();
    await expect(page.getByTestId("thread").getByText(item.preview, { exact: true })).toBeVisible();
    await expect(page.getByText("WhatsApp message wamid.synthetic")).toBeVisible();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "WhatsApp conversation details" });
    await expect(dialog.getByText("Replies unavailable", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve & send" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send real email" })).toHaveCount(0);
    await expect(page.getByText("SIMULATION", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("@a11y synthetic WhatsApp details have no serious or critical violations", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/inbox/${id}`);
    await expect(page.getByText("Replies unavailable", { exact: true })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
  });
});
