import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ConversationListItem } from "@/lib/domain";

// Synthetic API data proves frontend boundaries; these are not real provider tests.
const conversations: ConversationListItem[] = [
  {
    id: "66666666-6666-4666-8666-666666666661", customer: { id: "reference-customer-a", name: "Billing customer" },
    subject: "Reference billing inquiry", preview: "Synthetic billing question", channel: "email", source: "gmail", providerLabel: "Gmail",
    status: "open", priority: "high", category: "Billing", unread: true, analysisState: "completed", aiState: "unanalyzed", slaRisk: "none", updatedAt: "2026-10-04T12:00:00Z",
  },
  {
    id: "66666666-6666-4666-8666-666666666662", customer: { id: "reference-customer-b", name: "Phone customer" },
    subject: "Reference phone inquiry", preview: "Synthetic WhatsApp question", channel: "whatsapp", source: "whatsapp", providerLabel: "WhatsApp",
    status: "open", priority: "untriaged", category: "Untriaged", unread: false, analysisState: "pending", aiState: "unanalyzed", slaRisk: "none", updatedAt: "2026-10-04T11:00:00Z",
  },
  {
    id: "66666666-6666-4666-8666-666666666663", customer: { id: "reference-customer-c", name: "Resolved customer" },
    subject: "Reference resolved inquiry", preview: "Synthetic resolved question", channel: "email", source: "gmail", providerLabel: "Gmail",
    status: "resolved", priority: "low", category: "General", unread: false, analysisState: "completed", aiState: "unanalyzed", slaRisk: "none", updatedAt: "2026-10-04T10:00:00Z",
  },
  {
    id: "66666666-6666-4666-8666-666666666664", customer: { id: "reference-customer-d", name: "New customer" },
    subject: "Reference new inquiry", preview: "Synthetic new question", channel: "email", source: "gmail", providerLabel: "Gmail",
    status: "new", priority: "untriaged", category: "Untriaged", unread: true, analysisState: "pending", aiState: "unanalyzed", slaRisk: "none", updatedAt: "2026-10-04T09:00:00Z",
  },
];

async function mockDatabaseOverview(page: Page, items = conversations) {
  const requested: string[] = [];
  const unexpected: string[] = [];
  // Catch every API request so an accidental fixture endpoint, Analyze, sync or
  // reply cannot reach the application during this frontend-only regression.
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const request = `${route.request().method()} ${path}`;
    requested.push(request);
    if (request === "GET /api/conversations") return route.fulfill({ json: items });
    if (request === "GET /api/integrations/gmail/status") {
      return route.fulfill({ json: { mode: "database", connected: true, watchConfigured: false } });
    }
    unexpected.push(request);
    return route.fulfill({ status: 503, json: { message: "Unexpected API request in reference regression" } });
  });
  return { requested, unexpected };
}

async function expectMetric(summary: Locator, label: string, value: number) {
  // Anchor to the user-facing metric label rather than a presentation class.
  const metric = summary.getByText(label, { exact: true }).locator("..");
  await expect(metric.getByText(String(value), { exact: true })).toBeVisible();
}

test.describe("reference shell and database-aware Overview", () => {
  for (const width of [1280, 1440]) {
    test(`desktop ${width} keeps horizontal navigation and reference pane proportions`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await mockDatabaseOverview(page);
      await page.goto("/overview");
      const summary = page.getByRole("region", { name: "Workspace summary", exact: true });
      const workspace = page.getByRole("region", { name: "Conversations", exact: true });
      await expect(summary).toBeVisible();
      await expect(workspace).toBeVisible();

      const navigation = page.getByRole("navigation", { name: "Primary navigation", exact: true });
      await expect(navigation).toBeVisible();
      const navigationBounds = await navigation.boundingBox();
      expect(navigationBounds).not.toBeNull();
      expect(navigationBounds!.width).toBeGreaterThan(navigationBounds!.height * 5);
      for (const [label, href] of [
        ["Overview", "/overview"], ["Inbox", "/inbox"], ["Intelligence", "/intelligence"],
        ["Knowledge", "/knowledge"], ["AI Quality", "/ai-quality"], ["Automation", "/automation"],
      ]) {
        const link = navigation.getByRole("link", { name: label, exact: true });
        await expect(link).toHaveAttribute("href", href);
        const bounds = await link.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.y).toBeGreaterThanOrEqual(navigationBounds!.y);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(navigationBounds!.y + navigationBounds!.height + 1);
      }
      await expect(navigation.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
      for (const [label, href] of [["Integrations", "/integrations"], ["Settings", "/settings"]]) {
        const utility = page.getByRole("link", { name: label, exact: true }).filter({ visible: true });
        await expect(utility).toHaveAttribute("href", href);
        const bounds = await utility.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.y).toBeLessThan(navigationBounds!.y + navigationBounds!.height);
      }
      await expect(page.getByRole("complementary")).toHaveCount(0);
      const summaryBounds = await summary.boundingBox();
      expect(summaryBounds).not.toBeNull();
      // A permanent desktop sidebar would move the operational surface inward.
      expect(summaryBounds!.x).toBeLessThan(64);

      // Geometry selectors deliberately address the two user-specified panels.
      const primary = await summary.locator(":scope > div").nth(0).boundingBox();
      const signal = await summary.locator(":scope > div").nth(1).boundingBox();
      const master = await workspace.locator(".si-master-pane").boundingBox();
      const detail = await workspace.locator(".si-detail-pane").boundingBox();
      expect(primary).not.toBeNull(); expect(signal).not.toBeNull();
      expect(master).not.toBeNull(); expect(detail).not.toBeNull();
      const summaryRatio = primary!.width / (primary!.width + signal!.width);
      const workspaceRatio = master!.width / (master!.width + detail!.width);
      expect(summaryRatio).toBeCloseTo(.62, 2);
      expect(workspaceRatio).toBeCloseTo(.34, 2);
      expect(Math.abs(primary!.y - signal!.y)).toBeLessThanOrEqual(1);
      expect(master!.x + master!.width).toBeLessThanOrEqual(detail!.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await testInfo.attach("reference-geometry", { body: JSON.stringify({ width, summaryRatio, workspaceRatio, navigationBounds, primary, signal, master, detail }, null, 2), contentType: "application/json" });
    });
  }

  test("Overview channel and tabs change selection without starting operations", async ({ page }) => {
    const calls = await mockDatabaseOverview(page);
    await page.goto("/overview");
    const workspace = page.getByRole("region", { name: "Conversations", exact: true });
    const tabs = page.getByRole("tablist", { name: "Workspace views", exact: true });
    const channel = page.getByRole("combobox", { name: "Overview channel", exact: true });
    await expect(workspace.getByRole("heading", { name: conversations[0].subject, exact: true })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /^Open/ })).toHaveAttribute("aria-selected", "true");
    await expect(workspace.getByRole("button", { name: new RegExp(conversations[2].subject) })).toHaveCount(0);

    await channel.selectOption("whatsapp");
    await expect(workspace.getByRole("heading", { name: conversations[1].subject, exact: true })).toBeVisible();
    await expect(workspace.getByRole("button", { name: new RegExp(conversations[0].subject) })).toHaveCount(0);
    await tabs.getByRole("tab", { name: /^Unread/ }).click();
    await expect(workspace.getByText("No conversations match this view.", { exact: true })).toBeVisible();
    await expect(workspace.getByRole("heading", { name: "No conversation selected", exact: true })).toBeVisible();

    await channel.selectOption("email");
    await expect(workspace.getByRole("button", { name: new RegExp(conversations[0].subject) })).toBeVisible();
    await expect(workspace.getByRole("button", { name: new RegExp(conversations[3].subject) })).toBeVisible();
    await expect(workspace.getByRole("button", { name: new RegExp(conversations[2].subject) })).toHaveCount(0);
    await tabs.getByRole("tab", { name: /^All/ }).click();
    const resolved = workspace.getByRole("button", { name: new RegExp(conversations[2].subject) });
    await resolved.click();
    await expect(resolved).toHaveAttribute("aria-pressed", "true");
    await expect(workspace.getByRole("heading", { name: conversations[2].subject, exact: true })).toBeVisible();
    await expect(workspace.getByRole("link", { name: "Open conversation ↗", exact: true })).toHaveAttribute("href", `/inbox/${conversations[2].id}`);
    expect(calls.unexpected).toEqual([]);
    expect([...new Set(calls.requested)].sort()).toEqual(["GET /api/conversations", "GET /api/integrations/gmail/status"]);
  });

  test("database Overview metrics reflect only returned conversation data", async ({ page }) => {
    const calls = await mockDatabaseOverview(page);
    await page.goto("/overview");
    await expect(page.getByText("Database workspace", { exact: true })).toBeVisible();
    const summary = page.getByRole("region", { name: "Workspace summary", exact: true });
    await expectMetric(summary, "Open conversations", 3);
    await expectMetric(summary, "Needs attention", 1);
    await expectMetric(summary, "Untriaged", 2);
    const realAnalyses = summary.getByText("Completed real analyses", { exact: true }).locator("..");
    await expect(realAnalyses).toContainText("2");
    await expect(summary.getByText("Persisted triage", { exact: true }).locator("..").getByText("2", { exact: true })).toBeVisible();
    await expect(page.getByText("Counts reflect persisted conversations", { exact: true })).toBeVisible();
    await expect(page.getByText(/Fixture data|Demo analysis|Simulated analyses/)).toHaveCount(0);
    expect(calls.unexpected).toEqual([]);
    expect([...new Set(calls.requested)].sort()).toEqual(["GET /api/conversations", "GET /api/integrations/gmail/status"]);
  });

  test("an empty database stays empty without fixture fallback or invented metrics", async ({ page }) => {
    const calls = await mockDatabaseOverview(page, []);
    await page.goto("/overview");
    const summary = page.getByRole("region", { name: "Workspace summary", exact: true });
    for (const label of ["Open conversations", "Needs attention", "Untriaged"]) await expectMetric(summary, label, 0);
    await expect(page.getByRole("heading", { name: "No conversation selected", exact: true })).toBeVisible();
    await expect(page.getByText("No conversations match this view.", { exact: true })).toBeVisible();
    await expect(page.getByText("Connect a mailbox and sync real messages to begin.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open integrations", exact: true })).toHaveAttribute("href", "/integrations");
    await expect(page.getByRole("link", { name: "Open conversation ↗", exact: true })).toHaveCount(0);
    await expect(page.getByText(/Duplicate card charge|Fixture data|Simulated analyses/)).toHaveCount(0);
    expect(calls.unexpected).toEqual([]);
  });
});
