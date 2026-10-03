import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase E Automation", () => {
  test("five Automation modes are URL-backed", async ({ page }) => {
    await page.goto("/automation");
    await expect(page.getByRole("heading", { name: "Automation", exact: true })).toBeVisible();

    for (const [label, tab] of [["Policies", "policies"], ["Procedures", "procedures"], ["Rollouts", "rollouts"], ["Audit", "audit"], ["Overview", "overview"]] as const) {
      await page.getByRole("tab", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
    }
  });

  test("policy inspector shows requirements, versions, diff and historical replay", async ({ page }) => {
    await page.goto("/automation?tab=policies");
    const refundRow = page.getByRole("button", { name: /Issue refund.*Eligible payment refunds/ }).first();
    await refundRow.click();
    await expect(page).toHaveURL(/policy=policy-refund/);

    const inspector = page.getByLabel("Automation policy details");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("refund-policy-v12").first()).toBeVisible();
    await expect(inspector.getByText("Meaningful policy diff")).toBeVisible();
    await expect(inspector.getByText("Historical replay impact")).toBeVisible();
    await expect(inspector.getByText("review required")).toBeVisible();
    await expect(inspector.getByText("Execution prohibited")).not.toBeVisible();
  });

  test("historical procedure simulation stops before external mutation and surfaces regressions", async ({ page }) => {
    await page.goto("/automation?tab=procedures");
    await page.getByRole("button", { name: /Damaged order claim/ }).first().click();
    await expect(page).toHaveURL(/procedure=procedure-damaged-order/);

    const inspector = page.getByLabel("Automation procedure details");
    await inspector.getByRole("button", { name: /Run historical replay/ }).click();
    await expect(inspector.getByText("842")).toBeVisible();
    await expect(inspector.getByText("Regressions")).toBeVisible();
    await expect(inspector.getByText("No real external mutation executed.")).toBeVisible();
  });

  test("approval queue requires review then a second financial confirmation", async ({ page }) => {
    await page.goto("/automation?tab=overview");
    await page.getByRole("button", { name: /Issue refund.*Alex Kim/ }).first().click();

    const dialog = page.getByRole("dialog", { name: "Approval action preview" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("$18.20", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Review & approve" }).click();
    await expect(dialog.getByText("Confirm financial action")).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm mock approval" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Mock approval recorded")).toBeVisible();
  });

  test("blocked refund and human-only security scenarios cannot execute", async ({ page }) => {
    await page.goto("/automation?tab=procedures&preview=blockedLargeRefund");
    await expect(page.getByText("$420.00")).toBeVisible();
    await expect(page.getByRole("button", { name: "Execution blocked" })).toBeDisabled();

    await page.getByLabel("Action preview scenario").selectOption("security");
    await expect(page).toHaveURL(/preview=security/);
    await expect(page.getByText("Account takeover signal makes this action human-only.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Execution blocked" })).toBeDisabled();
  });

  test("incident, knowledge and AI-quality gates deep-link to their evidence", async ({ page }) => {
    await page.goto("/automation?tab=rollouts");
    await expect(page.getByText("AUTOMATION PAUSED")).toBeVisible();
    await expect(page.getByText("AUTOMATION DOWNGRADED")).toBeVisible();
    await expect(page.getByText("-7.2pp")).toBeVisible();

    const intelligenceHref = await page.getByRole("link", { name: /Open Intelligence issue/ }).getAttribute("href");
    expect(intelligenceHref).toContain("/intelligence/issue-duplicate-payment");
    const knowledgeHref = await page.getByRole("link", { name: /Inspect Knowledge source/ }).getAttribute("href");
    expect(knowledgeHref).toContain("/knowledge?tab=sources&source=");
    const qualityHref = await page.getByRole("link", { name: /Open evaluation/ }).getAttribute("href");
    expect(qualityHref).toContain("/ai-quality?tab=evaluations");
  });

  test("rollout expansion is mock state and policy gates can block unsafe changes", async ({ page }) => {
    await page.goto("/automation?tab=rollouts");
    const order = page.getByLabel("Rollout for Order tracking");
    await order.selectOption("expanded:50");
    await expect(order).toHaveValue("expanded:50");
    await expect(page.getByText("Mock rollout updated")).toBeVisible();

    const refund = page.getByLabel("Rollout for Refund request");
    await refund.selectOption("canary:5");
    await expect(refund).toHaveValue("paused:0");
    await expect(page.getByText("Rollout change blocked")).toBeVisible();

    await expect(page.getByLabel("Rollout for Account takeover")).toBeDisabled();
  });

  test("kill switch has protected confirmation and preserves stated consequences", async ({ page }) => {
    await page.goto("/automation?tab=rollouts");
    await page.getByRole("button", { name: "Pause all automation" }).click();

    const dialog = page.getByRole("dialog", { name: "Pause all automation confirmation" });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Confirm pause" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Type PAUSE to confirm/).fill("PAUSE");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText("All autonomous automation is paused")).toBeVisible();
    await expect(page.getByText("Copilot suggestions remain available. Human workflows remain active.")).toBeVisible();
  });

  test("audit trace keeps policy decision separate from execution result", async ({ page }) => {
    await page.goto("/automation?tab=audit");
    await page.getByRole("button", { name: "Inspect audit event audit-featured-refund" }).click();

    const inspector = page.getByLabel("Automation audit details");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("Decision vs execution")).toBeVisible();
    await expect(inspector.getByText("refund-policy-v12", { exact: true })).toBeVisible();
    await expect(inspector.getByText(/human approved/i)).toBeVisible();
    await expect(inspector.getByText(/result verified/i)).toBeVisible();
    await expect(inspector.getByText("Rollback unavailable")).toBeVisible();
  });

  test("Inbox, Knowledge, Intelligence and AI Quality connect back into Automation", async ({ page }) => {
    await page.goto("/inbox/conv-00001");
    const inboxLink = page.getByRole("link", { name: "Open action preview" }).first();
    await expect(inboxLink).toHaveAttribute("href", /\/automation\?tab=procedures&preview=/);

    await page.goto("/knowledge?tab=sources&source=ks-refund-policy");
    const policyLink = page.getByRole("link", { name: "Affected automation policy" });
    await expect(policyLink).toHaveAttribute("href", "/automation?tab=policies&policy=policy-refund");

    await page.goto("/intelligence");
    const automationLink = page.getByRole("link", { name: "Affected automation" }).first();
    await expect(automationLink).toHaveAttribute("href", /\/automation\?tab=/);

    await page.goto("/ai-quality?tab=shadow");
    const rolloutGate = page.getByRole("link", { name: "Automation rollout gate" }).first();
    await expect(rolloutGate).toHaveAttribute("href", /\/automation\?tab=rollouts/);
  });

  test("mobile Automation uses drill-down views without document overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/automation?tab=overview");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: /Order tracking.*controlled automation/ }).first().click();
    await expect(page.getByLabel("Automation readiness details")).toBeVisible();

    await page.goto("/automation?tab=audit");
    await page.getByRole("button", { name: "Inspect audit event audit-featured-refund" }).click();
    await expect(page.getByLabel("Automation audit details")).toBeVisible();
    const auditOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(auditOverflow).toBeLessThanOrEqual(1);
  });

  test("@a11y kill switch and approval dialogs have no serious or critical axe violations", async ({ page }) => {
    await page.goto("/automation?tab=rollouts");
    await page.getByRole("button", { name: "Pause all automation" }).click();
    let results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    let blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);

    await page.getByRole("button", { name: "Close kill switch confirmation" }).click();
    await page.goto("/automation?tab=overview");
    await page.getByRole("button", { name: /Issue refund.*Alex Kim/ }).first().click();
    results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test("keyboard can reach and activate Automation controls", async ({ page }) => {
    await page.goto("/automation");
    const policiesTab = page.getByRole("tab", { name: "Policies" });
    await policiesTab.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/tab=policies/);

    const firstPolicy = page.getByRole("button", { name: /Lookup order/ }).first();
    await firstPolicy.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Automation policy details")).toBeVisible();
  });
});
