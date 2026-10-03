import { expect, test } from "@playwright/test";

const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

const routes = ["/overview", "/inbox", "/intelligence", "/knowledge", "/ai-quality?tab=failures"];

for (const viewport of viewports) {
  for (const route of routes) {
    test(`responsive ${viewport.name} ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `document overflow on ${route} at ${viewport.name}`).toBeLessThanOrEqual(1);
      const slug = route.replaceAll("/", "-").replace(/^-/, "") || "root";
      await page.screenshot({ path: `test-results/responsive/${viewport.name}-${slug}.png`, fullPage: true });
    });
  }
}
