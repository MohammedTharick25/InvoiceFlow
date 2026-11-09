import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  const business = {
    id: "business-smoke",
    name: "Smoke Test Business",
    currency: "INR",
  };
  const current = {
    business,
    membership: { id: "membership-smoke", role: "owner", slot: 1 },
    subscription: {
      planKey: "king",
      status: "trialing",
      trialEndsAt: "2026-11-23T00:00:00.000Z",
    },
    settings: null,
  };
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "smoke-access-token",
        tokenType: "Bearer",
        expiresIn: 900,
        user: {
          id: "user-smoke",
          email: "owner@example.test",
          name: "Smoke Owner",
        },
        business: { id: business.id, role: "owner" },
      }),
    }),
  );
  await page.route("**/api/businesses/current", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(current),
    }),
  );
  await page.route("**/api/reports/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        asOf: "2026-11-09",
        currency: "INR",
        issuedThisMonth: 0,
        outstandingCount: 0,
        outstandingMinor: "0",
        overdueCount: 0,
        overdueMinor: "0",
        activeCustomers: 0,
        recentInvoices: [],
      }),
    }),
  );
  await page.route("**/api/notifications**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], unread: 0 }),
    }),
  );
  await page.route("**/api/reminders/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: { healthy: true, dueUnprocessed: 0, failed: 0 },
      }),
    }),
  );
});

test("preview renders and has no axe accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(250);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole("button", { name: "Tax settings" }).click();
  await page.waitForTimeout(250);
  const taxPage = await new AxeBuilder({ page }).analyze();
  expect(taxPage.violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.waitForTimeout(250);
  const darkTheme = await new AxeBuilder({ page }).analyze();
  expect(darkTheme.violations).toEqual([]);
});

test("shell fits target viewport widths and keeps navigation usable", async ({
  page,
}) => {
  for (const width of [360, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations, `axe violations at ${width}px`).toEqual([]);
    if (width < 1024) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(
        page.getByRole("button", { name: "Customers", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Customers", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Customers", exact: true }).first(),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeVisible();
    }
  }
});

test("shared BigInt financial fixtures pass in Chromium", async ({ page }) => {
  await page.goto("/parity/");
  const results = await page.locator("#results").textContent();
  expect(JSON.parse(results).every((entry) => entry.passed)).toBe(true);
});
