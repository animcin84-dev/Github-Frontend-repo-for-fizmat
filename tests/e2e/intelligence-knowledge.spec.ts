import { expect, test } from "@playwright/test";

test.describe("intelligence", () => {
  test("filters, chart, issue detail and cross-product links work", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/intelligence?range=24h&sort=growth");
    await expect(page.getByRole("heading", { name: "Intelligence" })).toBeVisible();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    await page.getByLabel("Issue severity").selectOption("high");
    await expect(page).toHaveURL(/severity=high/);

    await page.getByRole("link", { name: /Investigate Duplicate card authorization/ }).click();
    await expect(page).toHaveURL(/\/intelligence\/issue-duplicate-payment/);
    await expect(page.getByRole("heading", { name: "Duplicate card authorization" })).toBeVisible();

    await page.getByRole("link", { name: /conv-00001/ }).first().click();
    await expect(page).toHaveURL(/\/inbox\/conv-00001/);

    await page.goto("/intelligence/issue-duplicate-payment");
    await page.getByRole("link", { name: /Payment authorization policy/ }).click();
    await expect(page).toHaveURL(/\/knowledge\?tab=sources&source=ks-payment-auth/);
    expect(errors).toEqual([]);
  });
});

test.describe("knowledge", () => {
  test("sources, gaps, conflicts, coverage and source deep links work", async ({ page }) => {
    await page.goto("/knowledge?tab=sources&source=ks-payment-auth");
    await expect(page.getByRole("heading", { name: "Knowledge" })).toBeVisible();
    await expect(page.getByLabel("Knowledge source details")).toBeVisible();
    await page.getByLabel("Knowledge source details").getByRole("link", { name: "conv-00001" }).click();
    await expect(page).toHaveURL(/\/inbox\/conv-00001/);

    await page.goto("/knowledge");
    await page.getByRole("tab", { name: /Gaps/ }).click();
    await expect(page).toHaveURL(/tab=gaps/);
    await page.getByRole("button", { name: /Subscription pause eligibility/ }).click();
    await expect(page.getByRole("heading", { name: "Subscription pause eligibility", level: 2 })).toBeVisible();

    await page.getByRole("tab", { name: /Conflicts/ }).click();
    await expect(page).toHaveURL(/tab=conflicts/);
    await page.getByRole("button", { name: /Refund request window/ }).click();
    await expect(page.getByRole("heading", { name: "Refund request window", level: 2 })).toBeVisible();

    await page.getByRole("tab", { name: "Coverage" }).click();
    await expect(page).toHaveURL(/tab=coverage/);
    await page.getByRole("button", { name: /Duplicate payment/ }).click();
    await expect(page.getByRole("heading", { name: "Duplicate payment", level: 2 })).toBeVisible();
  });
});
