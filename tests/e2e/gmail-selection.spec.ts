import { expect, test } from "@playwright/test";

const conversationId = "11111111-1111-4111-8111-111111111111";
const missingId = "22222222-2222-4222-8222-222222222222";
const olderId = "33333333-3333-4333-8333-333333333333";
const item = {
  id: conversationId, customer: { id: "test-customer", name: "Test Customer" },
  subject: "Gmail selection regression", preview: "A synthetic message for CI.", channel: "email",
  status: "new", priority: "untriaged", category: "Untriaged", unread: true,
  source: "gmail", providerLabel: "Gmail", analysisState: "pending", aiState: "unanalyzed", slaRisk: "none",
  updatedAt: "2026-10-03T12:00:00Z",
};
const detail = {
  ...item, customer: { ...item.customer, email: "customer@example.test", priorConversationCount: 0, tags: [] },
  integrationAccountId: "test-integration", providerConversationId: "test-thread", replyMode: "gmail_real",
  summary: "Analysis pending", triageSignals: [], evidence: [], policyDecisions: [], similarConversationIds: [],
  messages: [{ id: "test-message", author: "customer", body: item.preview, createdAt: item.updatedAt, providerMessageId: "provider-test-message" }],
};

test.describe("database-mode inbox selection with synthetic API responses", () => {
  const requests = new WeakMap<object, string[]>();

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const requestedIds: string[] = [];
    requests.set(page, requestedIds);
    await page.route("**/api/integrations/gmail/status", (route) => route.fulfill({ json: { mode: "database", connected: false, watchConfigured: false } }));
    await page.route("**/api/conversations", async (route) => {
      // Let hydration render before the real list is available.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ json: [item] });
    });
    await page.route("**/api/conversations/*", async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
      requestedIds.push(id);
      await route.fulfill(id === conversationId || id === olderId
        ? { json: { ...detail, id } }
        : { status: 404, json: { error: "not_found", message: "Conversation not found" } });
    });
  });

  for (const route of ["/inbox", "/inbox/conv-00001", `/inbox/${missingId}`]) {
    test(`${route} recovers to a real ID and preserves filters`, async ({ page }) => {
      await page.goto(`${route}?channel=email`);
      await expect(page.getByRole("heading", { name: item.subject })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/inbox/${conversationId}\\?channel=email$`));
      expect(requests.get(page)).not.toContain("conv-00001");
      await page.reload();
      await expect(page.getByRole("heading", { name: item.subject })).toBeVisible();
      await expect(page.getByText("PREVIEW", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Not generated yet", { exact: true })).toBeVisible();
      await expect(page.getByText("Not evaluated", { exact: true }).first()).toBeVisible();
    });
  }

  test("valid older deep links survive the list limit", async ({ page }) => {
    await page.goto(`/inbox/${olderId}`);
    await expect(page.getByRole("heading", { name: item.subject })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/inbox/${olderId}$`));
    expect(requests.get(page)).toEqual([olderId]);
  });

  test("mobile list waits for selection before opening a real conversation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/inbox");
    await page.getByRole("button", { name: /Test Customer.*Gmail selection regression/ }).click();
    await expect(page.getByRole("button", { name: "Inbox", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Inbox", exact: true }).click();
    await expect(page.getByRole("button", { name: /Test Customer.*Gmail selection regression/ })).toBeVisible();
    await expect(page).toHaveURL(/\/inbox$/);
    // Revisit via client navigation, retaining the successful React Query caches.
    for (const name of ["Overview", "Inbox"]) {
      const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
      if (!await navigation.isVisible()) await page.getByLabel("Open navigation").click();
      await navigation.getByRole("link", { name: new RegExp(`^${name}`) }).click();
    }
    await expect(page.getByRole("button", { name: /Test Customer.*Gmail selection regression/ })).toBeVisible();
    await expect(page).toHaveURL(/\/inbox$/);
  });

  test("mobile detail failures show a safe error and allow returning to the list", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(`**/api/conversations/${conversationId}`, (route) => route.fulfill({
      status: 500, json: { error: "gmail_unavailable", message: "Gmail conversation unavailable" },
    }));
    await page.goto(`/inbox/${conversationId}`);
    await expect(page.getByText("Gmail conversation unavailable", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Inbox", exact: true }).click();
    await expect(page.getByRole("button", { name: /Test Customer.*Gmail selection regression/ })).toBeVisible();
    await expect(page).toHaveURL(/\/inbox$/);
  });

  test("narrow Gmail reply review preserves the REAL badge and requires explicit send", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/inbox/${conversationId}`);
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Gmail reply inspector" });
    const badge = await dialog.getByText("REAL", { exact: true }).boundingBox();
    const close = await dialog.getByRole("button", { name: "Close conversation inspector" }).boundingBox();
    expect(badge).not.toBeNull();
    expect(close).not.toBeNull();
    expect(badge!.x + badge!.width).toBeLessThanOrEqual(close!.x);
    await dialog.getByRole("textbox", { name: "Manual Gmail reply" }).fill("Synthetic review only.");
    await dialog.getByRole("button", { name: "Review real send" }).click();
    await expect(dialog.getByText("customer@example.test", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Send real email" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("an empty real inbox makes no detail request or fixture fallback", async ({ page }) => {
    await page.route("**/api/conversations", (route) => route.fulfill({ json: [] }));
    await page.goto("/inbox/conv-00001");
    await expect(page.getByText("No Gmail conversations synced yet.")).toBeVisible();
    await expect(page).toHaveURL(/\/inbox$/);
    expect(requests.get(page)).toEqual([]);
  });

  test("integration configuration errors replace the loading spinner", async ({ page }) => {
    await page.route("**/api/integrations/gmail/status", (route) => route.fulfill({
      status: 500, json: { error: "configuration_missing", message: "DATABASE_URL is required when SUPPORT_DATA_MODE=database" },
    }));
    await page.goto("/integrations");
    await expect(page.getByText("DATABASE_URL is required when SUPPORT_DATA_MODE=database")).toBeVisible();
    await expect(page.getByText("Loading Gmail integration…")).toHaveCount(0);
  });
});
