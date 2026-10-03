import { expect, test } from "@playwright/test";

test.describe("AI Quality overview", () => {
  test("outcome composition, trend controls and root-cause drill-down work", async ({ page }) => {
    await page.goto("/ai-quality");
    await expect(page.getByRole("heading", { name: "AI Quality", exact: true })).toBeVisible();
    await expect(page.getByText("Outcome composition")).toBeVisible();
    await expect(page.getByText("Knowledge quality × AI quality")).toBeVisible();
    await expect(page.getByText("Intent / topic quality")).toBeVisible();

    await page.getByLabel("AI quality time range").selectOption("7d");
    await expect(page).toHaveURL(/range=7d/);
    await page.getByLabel("Quality trend metric").selectOption("unsupportedClaimRate");
    await expect(page).toHaveURL(/metric=unsupportedClaimRate/);

    await page.getByRole("button", { name: /Knowledge issue/ }).click();
    await expect(page).toHaveURL(/tab=failures/);
    await expect(page).toHaveURL(/cause=knowledge/);
    await expect(page.getByText("Failure Explorer")).toBeVisible();
  });

  test("overview deep link opens Failure Explorer", async ({ page }) => {
    await page.goto("/overview");
    await page.getByRole("link", { name: /Inspect failure examples/ }).click();
    await expect(page).toHaveURL(/\/ai-quality\?tab=failures/);
  });
});

test.describe("AI Quality failures", () => {
  test("filters and execution trace connect to product surfaces", async ({ page }) => {
    await page.goto("/ai-quality?tab=failures&range=30d");
    await page.getByLabel("Failure type").selectOption("unsupported_claim");
    await expect(page).toHaveURL(/failure=unsupported_claim/);

    const inspect = page.getByRole("button", { name: /Inspect failure/ }).first();
    await expect(inspect).toBeVisible();
    await inspect.click();

    const trace = page.getByLabel("Failure execution trace");
    await expect(trace).toBeVisible();
    await expect(trace.getByText("Final outcome")).toBeVisible();

    const conversation = trace.getByRole("link", { name: /Open conversation/ });
    expect(await conversation.getAttribute("href")).toMatch(/^\/inbox\/conv-/);
  });
});

test.describe("AI Quality evaluations", () => {
  test("suite detail and segment regressions are visible", async ({ page }) => {
    await page.goto("/ai-quality?tab=evaluations");
    await expect(page.getByText("Version comparison")).toBeVisible();
    await expect(page.getByText("Kazakh mixed-language")).toBeVisible();
    await expect(page.getByText("-4.8pp")).toBeVisible();

    await page.getByText("Multilingual", { exact: true }).click();
    await expect(page).toHaveURL(/suite=multilingual/);
    await expect(page.getByText("Regressions").first()).toBeVisible();
  });
});

test.describe("AI Quality Shadow Mode", () => {
  test("readiness and historical simulation comparison work", async ({ page }) => {
    await page.goto("/ai-quality?tab=shadow");
    await expect(page.getByText("Historical analyzed")).toBeVisible();
    await expect(page.getByText("Shadow Mode never sends customer replies")).toBeVisible();
    await expect(page.getByText("Automation readiness by intent")).toBeVisible();
    await expect(page.getByText("Never autonomous")).toBeVisible();

    await page.getByLabel("Shadow simulation").selectOption("shadow-002");
    await expect(page).toHaveURL(/shadowId=shadow-002/);
    await expect(page.getByText("Actual historical resolution")).toBeVisible();
    await expect(page.getByText("What AI would propose today")).toBeVisible();
    await expect(page.getByText("policy mismatch")).toBeVisible();
  });
});
