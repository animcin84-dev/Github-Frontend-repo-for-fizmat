import { expect, test } from "@playwright/test";

test.describe("Phase F2 Gmail integrations surface", () => {
  test("mock CI mode is explicit and does not pretend Gmail is connected", async ({ page }) => {
    await page.goto("/integrations");
    await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();
    await expect(page.getByText("MOCK MODE")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gmail" })).toBeVisible();
    const connect = page.getByText("Connect Gmail", { exact: true });
    await expect(connect).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Set SUPPORT_DATA_MODE=database", { exact: false })).toBeVisible();
    await expect(page.getByText("CONNECTED", { exact: true })).toHaveCount(0);
  });

  test("Inbox fixture mode is explicitly marked mock/simulation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/inbox/conv-00001");
    await expect(page.getByText("MOCK", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("SIMULATION", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve & send" })).toBeVisible();
  });
});
