import { expect, test } from "@playwright/test";

test.describe("inbox critical flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("conversation selection preserves URL filters and keyboard navigation ignores inputs", async ({ page }) => {
    await page.goto("/inbox/conv-00001?channel=email");
    await expect(page.getByText("Duplicate card charge").first()).toBeVisible();

    const search = page.getByPlaceholder("Search conversations");
    await search.focus();
    await page.keyboard.press("j");
    await expect(search).toHaveValue("j");
    await expect(page).toHaveURL(/conv-00001\?channel=email/);

    await page.goto("/inbox/conv-00001?channel=email");
    await expect(page.getByText("1,300 of 5,200")).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page.getByPlaceholder("Search conversations")).not.toBeFocused();
    await page.keyboard.press("j");
    await expect(page).toHaveURL(/\/inbox\/conv-00005\?channel=email/);
  });

  test("safe draft mock action works and evidence deep-links to Knowledge", async ({ page }) => {
    await page.goto("/inbox/conv-00001");
    await page.getByText("Payment authorization policy").click();
    await page.getByRole("link", { name: /Open knowledge source/ }).first().click();
    await expect(page).toHaveURL(/\/knowledge\?tab=sources&source=ks-payment-auth/);

    await page.goto("/inbox/conv-00001");
    await page.getByRole("button", { name: "Approve draft" }).click();
    await expect(page.getByText("Reply approved locally")).toBeVisible();
    await expect(page.getByText("No email was sent.")).toBeVisible();
  });

  test("unsafe subscription draft cannot be sent", async ({ page }) => {
    await page.goto("/inbox/conv-00002");
    await expect(page.getByText("Needs human")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve draft" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Escalate" }).first()).toBeVisible();
  });

  test("narrow inbox uses drill-down and evidence sheet without viewport overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/inbox");
    await page.getByRole("button", { name: /Aruzhan K.*Duplicate card charge/i }).first().click();
    await expect(page.getByRole("button", { name: "Inbox" })).toBeVisible();
    await page.getByRole("button", { name: "AI & evidence" }).click();
    await expect(page.getByRole("dialog", { name: "AI and evidence inspector" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
