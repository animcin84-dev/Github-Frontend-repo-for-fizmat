import { expect, test, type Page } from "@playwright/test";
import type { IntegrationStatusDTO } from "@/server/contracts";
import AxeBuilder from "@axe-core/playwright";

const routes = [
  ["/overview", "Overview"], ["/inbox", "Inbox"], ["/intelligence", "Intelligence"],
  ["/knowledge", "Knowledge"], ["/ai-quality", "AI Quality"], ["/automation", "Automation"],
  ["/integrations", "Integrations"], ["/settings", "Settings"],
] as const;

// These fixtures prove frontend presentation only. No provider credentials or
// operations are used, and no synthetic result is real Gmail/phone acceptance.
const gmail: IntegrationStatusDTO = {
  mode: "database", connected: true, provider: "gmail", mailbox: "reference-mailbox@example.test",
  status: "connected", syncState: "idle", watchConfigured: false,
  backfillDays: 30, syncQuery: "in:inbox newer_than:30d", storedThreads: 7, storedMessages: 11,
  lastSyncedAt: "2026-10-03T10:00:00Z", latestSync: {
    id: "reference-sync", kind: "incremental", status: "succeeded", threadsFound: 2,
    messagesFound: 3, messagesInserted: 1, messagesSkipped: 2,
  },
};
const whatsapp = {
  provider: "whatsapp", mode: "database", connected: false, replyEnabled: false,
  configured: true, missing: [], status: "configured", storedMessages: 0, lastInboundAt: null,
  webhookPath: "/api/integrations/whatsapp/webhook", realAcceptance: "not_verified",
};

async function interceptIntegrationStatus(page: Page) {
  const unexpected: string[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const operation = `${request.method()} ${new URL(request.url()).pathname}`;
    if (operation === "GET /api/integrations/gmail/status") return route.fulfill({ json: gmail });
    if (operation === "GET /api/integrations/whatsapp/status") return route.fulfill({ json: whatsapp });
    unexpected.push(operation);
    return route.fulfill({ status: 503, json: { message: "Unexpected operation in frontend regression" } });
  });
  return unexpected;
}

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 1024, height: 768 }, { width: 390, height: 844 },
]) {
  test(`reference routes fit ${viewport.width}px after their workspace loads`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const measurements: Array<{ route: string; overflow: number }> = [];
    for (const [route, title] of routes) {
      await test.step(title, async () => {
        await page.goto(route);
        await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
        // Await populated workspace structure rather than measuring the small
        // loading placeholder and accidentally approving an overflowing page.
        if (route === "/inbox") {
          // Narrow Inbox deliberately uses the compact queue instead of the
          // desktop summary. Its heading is rendered after both API queries.
          await expect(page.getByText("MOCK", { exact: true }).first()).toBeVisible();
        } else {
          await expect(page.getByRole("region", { name: "Workspace summary", exact: true })).toBeVisible();
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        measurements.push({ route, overflow });
        expect(overflow, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(1);
      });
    }
    await testInfo.attach("route-widths", { body: JSON.stringify({ viewport, measurements }, null, 2), contentType: "application/json" });
  });
}

test("workspace tabs support roving focus and keyboard selection with URL-backed details", async ({ page }) => {
  await page.goto("/knowledge");
  const tabs = page.getByRole("tablist", { name: "Knowledge workspace views", exact: true });
  const sources = tabs.getByRole("tab", { name: /^Sources/ });
  const gaps = tabs.getByRole("tab", { name: /^Gaps/ });
  const coverage = tabs.getByRole("tab", { name: "Coverage", exact: true });
  await sources.focus();
  await page.keyboard.press("ArrowRight");
  await expect(gaps).toBeFocused();
  await expect(gaps).toHaveAttribute("aria-selected", "true");
  await expect(gaps).toHaveAttribute("tabindex", "0");
  await expect(sources).toHaveAttribute("tabindex", "-1");
  await expect(page).toHaveURL(/tab=gaps/);
  const panelId = await gaps.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  const panel = page.getByRole("tabpanel").filter({ visible: true });
  await expect(panel).toHaveAttribute("id", panelId!);
  await expect(panel.getByRole("heading", { level: 2 })).toBeVisible();

  await page.keyboard.press("End");
  await expect(coverage).toBeFocused();
  await expect(coverage).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/tab=coverage/);
  await page.keyboard.press("Home");
  await expect(sources).toBeFocused();
  await expect(sources).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Knowledge source details", { exact: true })).toBeVisible();
});

test("desktop operator workspaces begin early and keep useful list density", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const geometry = [];
  for (const [route, title] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Workspace summary", exact: true })).toBeVisible();
    const workspace = page.locator(".si-operational-workspace").filter({ visible: true });
    await expect(workspace).toBeVisible();
    const bounds = await workspace.boundingBox();
    expect(bounds!.y, `${route} workspace start`).toBeLessThanOrEqual(360);
    expect(bounds!.height, `${route} workspace height`).toBeGreaterThanOrEqual(530);
    geometry.push({ route, ...bounds });
    if (route === "/overview" || route === "/inbox") {
      const rows = workspace.locator(".si-master-pane button.si-reference-row,.si-master-pane button.si-inbox-row");
      await expect(rows.first()).toBeVisible();
      const visibleRows = await rows.evaluateAll((items) => {
        const pane = items[0]?.closest(".si-master-pane")?.getBoundingClientRect();
        return items.filter((item) => { const row = item.getBoundingClientRect(); return pane && row.top >= pane.top && row.bottom <= pane.bottom; }).length;
      });
      expect(visibleRows, `${route} fully visible rows`).toBeGreaterThanOrEqual(7);
    }
  }
  await testInfo.attach("operator-geometry", { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
});

test("@a11y selected quality severity stays readable on the steel surface", async ({ page }) => {
  await page.goto("/ai-quality");
  const selected = page.locator(".si-quality-workspace .si-reference-row.is-selected");
  await expect(selected.getByText("high", { exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include(".si-quality-workspace .si-reference-row.is-selected > span:last-child")
    .withRules(["color-contrast"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("all operator workspaces expand to the viewport and restore their selection with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [route, title] of routes) {
    await test.step(title, async () => {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
      const workspace = page.locator(".si-operational-workspace");
      const heading = workspace.locator(".si-detail-pane").getByRole("heading", { level: 2 }).first();
      await expect(heading).toBeVisible();
      const selectedTitle = await heading.textContent();
      const before = await workspace.boundingBox();
      expect(before!.height).toBeGreaterThanOrEqual(680);
      const expandControl = workspace.getByRole("button", { name: "Expand workspace", exact: true });
      const controlBox = await expandControl.boundingBox();
      const tabsBox = await workspace.locator(".si-workspace-notch").boundingBox();
      expect(controlBox!.x + controlBox!.width).toBeLessThanOrEqual(tabsBox!.x);
      expect(tabsBox!.y).toBeGreaterThan(before!.y);
      expect(tabsBox!.x + tabsBox!.width).toBeLessThan(before!.x + before!.width);
      const detailBox = await workspace.locator(".si-detail-pane").boundingBox();
      expect(detailBox!.y).toBeGreaterThanOrEqual(tabsBox!.y + tabsBox!.height + 4);
      await expandControl.click();
      const minimize = workspace.getByRole("button", { name: "Minimize workspace", exact: true });
      await expect(minimize).toBeFocused();
      await expect(minimize).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => (await workspace.boundingBox())!.y).toBeLessThanOrEqual(16);
      const expanded = await workspace.boundingBox();
      expect(expanded!.height).toBeGreaterThanOrEqual(860);
      expect(expanded!.y + expanded!.height).toBeLessThanOrEqual(900);
      await expect(heading).toHaveText(selectedTitle!);
      await page.keyboard.press("Escape");
      const expand = workspace.getByRole("button", { name: "Expand workspace", exact: true });
      await expect(expand).toBeFocused();
      await expect(expand).toHaveAttribute("aria-pressed", "false");
      await expect.poll(async () => Math.abs((await workspace.boundingBox())!.height - before!.height)).toBeLessThanOrEqual(1);
      await expect(heading).toHaveText(selectedTitle!);
    });
  }
});

test("source selection updates the detail panel and survives reload", async ({ page }) => {
  await page.goto("/knowledge?tab=sources&source=ks-payment-auth");
  const workspace = page.getByRole("region", { name: "Knowledge documents", exact: true });
  const source = workspace.getByRole("button", { name: /Refund policy/ }).first();
  await source.click();
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/source=ks-refund-policy/);
  const details = page.getByLabel("Knowledge source details", { exact: true });
  await expect(details.getByRole("heading", { name: /Refund policy/, level: 2 })).toBeVisible();
  await expect(details.getByRole("link", { name: "Affected automation policy", exact: true })).toHaveAttribute("href", "/automation?tab=policies&policy=policy-refund");
  await page.reload();
  await expect(details.getByRole("heading", { name: /Refund policy/, level: 2 })).toBeVisible();
});

test("evaluation selection displays the selected input, output and judge evidence", async ({ page }) => {
  await page.goto("/ai-quality?tab=evaluations");
  const workspace = page.getByRole("region", { name: "Evaluation suites", exact: true });
  const suite = workspace.getByRole("button", { name: /Multilingual.*cases/ });
  await suite.click();
  await expect(page).toHaveURL(/suite=multilingual/);
  await expect(suite).toHaveAttribute("aria-pressed", "true");
  await expect(workspace.getByRole("heading", { name: "Multilingual rubric", exact: true })).toBeVisible();
  const sample = workspace.getByRole("button", { name: /Можно заморозить annual plan/ });
  await sample.click();
  await expect(sample).toHaveAttribute("aria-pressed", "true");
  const trace = page.getByLabel("Selected evaluation case", { exact: true });
  await expect(trace.getByText("Можно заморозить annual plan?", { exact: true })).toBeVisible();
  await expect(trace.getByText("Correct intent; blocks unsupported answer.", { exact: true })).toBeVisible();
  await expect(trace.getByText("RU/EN mixed suite.", { exact: true })).toBeVisible();
  await expect(trace).toContainText("passed · improved");
});

test("policy selection keeps the human approval boundary in the selected detail", async ({ page }) => {
  await page.goto("/automation?tab=policies");
  const policy = page.getByRole("button", { name: /Issue refund.*Eligible payment refunds/ }).first();
  await policy.click();
  await expect(page).toHaveURL(/policy=policy-refund/);
  await expect(policy).toHaveAttribute("aria-pressed", "true");
  const details = page.getByLabel("Automation policy details", { exact: true });
  await expect(details.getByText("refund-policy-v12", { exact: true }).first()).toBeVisible();
  await expect(details.getByText("review required", { exact: true })).toBeVisible();
  await expect(details.getByText("Historical replay impact", { exact: true })).toBeVisible();
});

test("integration status and search distinguish connected Gmail from unverified phone setup", async ({ page }) => {
  const unexpected = await interceptIntegrationStatus(page);
  await page.goto("/integrations");
  await expect(page.getByText("REAL DATA MODE", { exact: true })).toBeVisible();
  await expect(page.getByText("CONNECTED", { exact: true })).toBeVisible();
  const summary = page.getByRole("region", { name: "Workspace summary", exact: true });
  await expect(summary.getByText("Stored Gmail threads", { exact: true }).locator("..")).toContainText("7");
  await expect(summary.getByText("Stored messages", { exact: true }).locator("..")).toContainText("11");
  const workspace = page.getByRole("region", { name: "Channel integrations", exact: true });
  const search = page.getByRole("textbox", { name: "Search integrations", exact: true });
  await search.fill("WhatsApp");
  await expect(workspace.getByRole("button", { name: /^Gmail/ })).toHaveCount(0);
  const phone = workspace.getByRole("button", { name: /^WhatsApp/ });
  await phone.click();
  await expect(phone).toHaveAttribute("aria-pressed", "true");
  await expect(workspace.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();
  await expect(workspace.getByText("CONFIGURED · TEST PENDING", { exact: true })).toBeVisible();
  await expect(workspace.getByText("Not verified", { exact: true })).toHaveCount(2);
  await expect(workspace.getByText("CONNECTED", { exact: true })).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: /Send|Sync now/ })).toHaveCount(0);
  await search.fill("nonexistent connector");
  await expect(workspace.getByText("No matching integrations.", { exact: true })).toBeVisible();
  expect(unexpected).toEqual([]);
});

test("Settings stays read-only and its appearance preference persists only in this browser", async ({ page }) => {
  const mutations: string[] = [];
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") mutations.push(route.request().url());
    return route.fulfill({ status: 503, json: { message: "Settings has no API operation" } });
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("si-theme")) localStorage.setItem("si-theme", "light");
  });
  await page.goto("/settings");
  await expect(page.getByText("Configuration scaffold", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Settings section", exact: true }).selectOption("appearance");
  const appearance = page.getByRole("region", { name: "Browser appearance preference", exact: true });
  await appearance.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("si-theme"))).toBe("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Settings section", exact: true }).selectOption("appearance");
  await expect(appearance.getByRole("button", { name: "Use light theme", exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test("command palette supports keyboard navigation and returns focus when dismissed", async ({ page }) => {
  await page.goto("/settings");
  const opener = page.getByRole("button", { name: "Open command palette", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Command palette", exact: true });
  const input = dialog.getByRole("textbox", { name: "Search pages", exact: true });
  await expect(input).toBeFocused();
  await input.fill("Settings");
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("button", { name: "Settings /settings", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await input.fill("Knowledge");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/knowledge$/);
  await expect(page.getByRole("heading", { name: "Knowledge", exact: true, level: 1 })).toBeVisible();
});

test("@a11y reference Settings has no serious or critical violations in either theme", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("combobox", { name: "Settings section", exact: true }).selectOption("appearance");
  const appearance = page.getByRole("region", { name: "Browser appearance preference", exact: true });
  for (const theme of ["light", "dark"]) {
    const toggle = appearance.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  }
});
