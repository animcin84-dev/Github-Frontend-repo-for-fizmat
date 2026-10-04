import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("restaurant section is discoverable and keeps fictional content separate from a live connection", async ({ page }) => {
  const apiRequests: string[] = [];
  await page.route("**/api/**", (route) => {
    apiRequests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ status: 503, json: { message: "Restaurant examples must not use provider APIs" } });
  });
  await page.goto("/settings");
  await page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("link", { name: "WhatsApp", exact: true }).click();
  await expect(page).toHaveURL(/\/whatsapp$/);
  await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();
  await expect(page.getByText("Example restaurant", { exact: true })).toBeVisible();
  const business = page.getByRole("complementary", { name: "Restaurant business profile" });
  await expect(business.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(business.getByRole("link", { name: "View setup ↗" })).toHaveAttribute("href", "/integrations");
  await expect(page.getByRole("button", { name: /Send real|Send message|Analyze/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  expect(apiRequests).toEqual([]);
});

test("booking filters, guest search and selected conversation survive navigation", async ({ page }) => {
  await page.goto("/whatsapp");
  const workspace = page.getByRole("region", { name: "Restaurant conversations", exact: true });
  await page.getByRole("tab", { name: "Bookings 3", exact: true }).click();
  await expect(page).toHaveURL(/view=booking/);
  await expect(workspace.locator(".si-reference-row")).toHaveCount(3);
  await workspace.getByRole("button", { name: /София.*Перенос времени/ }).click();
  await expect(page).toHaveURL(/chat=restaurant-booking-03/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "София · Перенос времени брони" })).toBeVisible();
  await page.getByRole("tab", { name: "Chats 8", exact: true }).click();
  await page.getByRole("textbox", { name: "Search restaurant conversations" }).fill("мадина");
  await expect(workspace.locator(".si-reference-row")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Мадина · Меню и аллергены" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search restaurant conversations" }).fill("nobody matches this request");
  await expect(page.getByText("No matching guest conversations.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(workspace.locator(".si-reference-row")).toHaveCount(8);
  await page.getByRole("button", { name: "Needs reply", exact: true }).click();
  await expect(workspace.locator(".si-reference-row")).toHaveCount(5);
  await page.getByRole("tab", { name: "Orders 2", exact: true }).click();
  await expect(workspace.locator(".si-reference-row")).toHaveCount(1);
});

test("drafts persist per guest without delivery or database writes", async ({ page }) => {
  const apiRequests: string[] = [];
  await page.route("**/api/**", (route) => {
    apiRequests.push(route.request().url());
    return route.fulfill({ status: 503, json: { message: "No live operation is permitted" } });
  });
  await page.goto("/whatsapp?chat=restaurant-booking-01");
  const reply = page.getByRole("textbox", { name: "Reply draft" });
  const text = "Алия, спасибо! Уточню свободный столик у команды ресторана.";
  await reply.fill(text);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("No WhatsApp message was sent.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(reply).toHaveValue(text);
  await expect(page.getByText("Saved in this browser", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Данияр.*Заказ с собой/ }).click();
  await expect(reply).toHaveValue("");
  await reply.fill("Ваш черновик заказа готов для проверки.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: /Алия.*Столик на четверых/ }).click();
  await expect(reply).toHaveValue(text);
  expect(apiRequests).toEqual([]);
});

test("restaurant route is available from the command palette and mobile navigation", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Open command palette" }).click();
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await dialog.getByRole("textbox", { name: "Search pages" }).fill("WhatsApp");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/whatsapp$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await page.getByLabel("Open navigation").click();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "WhatsApp", exact: true }).click();
  await expect(page).toHaveURL(/\/whatsapp$/);
  await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();
});

for (const width of [1440, 1280, 1024, 768, 390]) {
  test(`restaurant layout fits ${width}px and keeps the guest editor reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/whatsapp");
    await expect(page.getByRole("heading", { name: "Алия · Столик на четверых" })).toBeVisible();
    const reply = page.getByRole("textbox", { name: "Reply draft" });
    await reply.fill("Спасибо за обращение.");
    await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("@a11y restaurant workspace remains readable in both themes and on mobile", async ({ page }) => {
  await page.goto("/whatsapp");
  for (const theme of ["light", "dark"]) {
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
    }
  }
});
