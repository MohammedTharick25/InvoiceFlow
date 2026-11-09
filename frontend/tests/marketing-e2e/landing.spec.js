import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("marketing page has pricing, search metadata, and the workspace preview", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle("InvoiceFlow | A clear flow for invoice work");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /14-day trial/,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://invoiceflow.example/og-image.svg",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://invoiceflow.example/",
  );
  await expect(
    page.getByRole("heading", { name: /Good work deserves a clear flow/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "InvoiceFlow dashboard interface preview" }),
  ).toHaveCount(1);
  const dashboardScreenshot = page.getByRole("img", {
    name: /InvoiceFlow dashboard with business totals and recent invoices/,
  });
  await expect(dashboardScreenshot).toBeVisible();
  expect(
    await dashboardScreenshot.evaluate((image) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: "Basic", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("₹299", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start 14-day free trial" }).first(),
  ).toHaveAttribute("href", "http://localhost:5173/register?plan=trial");
  await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute(
    "href",
    "#terms",
  );

  await page.getByRole("button", { name: /Yearly/ }).click();
  await expect(page.getByText("₹249", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Billed annually at ₹2,990", { exact: true }),
  ).toBeVisible();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("landing page has no horizontal overflow at roadmap viewport widths", async ({
  page,
}) => {
  for (const width of [360, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Good work deserves a clear flow/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `horizontal overflow at ${width}px`,
    ).toBeLessThanOrEqual(width);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations, `axe violations at ${width}px`).toEqual([]);
  }
});
