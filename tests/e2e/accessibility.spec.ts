import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const criticalRoutes = [
  "/overview",
  "/integrations",
  "/inbox",
  "/inbox/conv-00001",
  "/intelligence",
  "/intelligence/issue-duplicate-payment",
  "/knowledge",
  "/ai-quality",
  "/ai-quality?tab=failures",
  "/ai-quality?tab=evaluations",
  "/ai-quality?tab=shadow",
  "/automation",
  "/automation?tab=policies",
  "/automation?tab=procedures",
  "/automation?tab=rollouts",
  "/automation?tab=audit",
];

for (const route of criticalRoutes) {
  test(`@a11y ${route} has no serious or critical axe violations`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
