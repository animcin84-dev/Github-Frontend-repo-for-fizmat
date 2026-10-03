import { expect, test } from "@playwright/test";

test.describe("app shell", () => {
  test("overview, navigation and command palette work", async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByRole("link", { name: "Intelligence" }).first().click();
    await expect(page).toHaveURL(/\/intelligence$/);
    await expect(page.getByRole("heading", { name: "Intelligence" })).toBeVisible();

    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Knowledge/ }).click();
    await expect(page).toHaveURL(/\/knowledge$/);
  });

  test("mobile navigation exposes primary routes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/overview");
    await page.getByLabel("Open navigation").click();
    await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Knowledge" }).click();
    await expect(page).toHaveURL(/\/knowledge$/);
  });
});

test.describe("theme persistence", () => {
  test("saved dark theme survives reload with correct control state", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("si-theme", "dark"));
    await page.goto("/overview");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  });

  test("saved light theme survives reload", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("si-theme", "light"));
    await page.goto("/overview");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Use dark theme" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("system preference is used when no saved override exists", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.removeItem("si-theme"));
    await page.goto("/overview");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  });

  test("toggle icon and aria-label stay synchronized after reload", async ({ page }) => {
    await page.goto("/overview");
    await page.evaluate(() => localStorage.setItem("si-theme", "light"));
    await page.reload();
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  });
});
