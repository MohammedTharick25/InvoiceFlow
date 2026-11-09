import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const frontendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const marketingPublicDirectory = path.resolve(
  frontendDirectory,
  "../marketing/public",
);
const server = await createServer({
  configFile: path.join(frontendDirectory, "vite.config.js"),
  root: frontendDirectory,
  server: { host: "127.0.0.1", port: 4175, strictPort: true },
});
const browser = await chromium.launch();

try {
  await server.listen();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: 1,
  });
  const business = {
    id: "marketing-demo-business",
    name: "Northstar Studio",
    currency: "INR",
    timezone: "Asia/Kolkata",
    tax: { gstRegistered: true, stateCode: "29" },
  };
  const current = {
    business,
    membership: { id: "marketing-demo-membership", role: "owner", slot: 1 },
    subscription: {
      planKey: "anointed",
      status: "active",
      currentPeriodEnd: "2026-12-09T00:00:00.000Z",
    },
    entitlements: {
      planKey: "anointed",
      state: "active",
      readOnly: false,
      limits: {
        finalizedInvoicesPerMonth: 300,
        activeCustomers: 1000,
        teamMembers: 3,
      },
      features: {
        expenses: true,
        reports: true,
        reminders: true,
        fullReminders: true,
        receipts: true,
        team: true,
        fullExport: true,
      },
    },
    settings: { reminders: { enabled: true, enabledSince: "2026-01-01" } },
    readOnly: false,
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname.endsWith("/auth/refresh")) {
      body = {
        accessToken: "marketing-preview-access-token",
        tokenType: "Bearer",
        expiresIn: 900,
        user: {
          id: "marketing-demo-owner",
          email: "owner@example.test",
          name: "Sam Rivera",
        },
        business: { id: business.id, role: "owner" },
      };
    } else if (url.pathname.endsWith("/businesses/current")) {
      body = current;
    } else if (url.pathname.endsWith("/reports/dashboard")) {
      body = {
        issuedThisMonth: 12,
        outstandingCount: 6,
        outstandingMinor: "4850000",
        overdueCount: 2,
        overdueMinor: "1200000",
        activeCustomers: 18,
        recentInvoices: [
          {
            id: "invoice-preview-41",
            number: "INV-2026-041",
            customer: "Northstar Studio",
            issueDate: "09 Nov 2026",
            status: "sent",
            balanceMinor: "1800000",
            currency: "INR",
          },
          {
            id: "invoice-preview-40",
            number: "INV-2026-040",
            customer: "Paper Kite Co.",
            issueDate: "07 Nov 2026",
            status: "paid",
            balanceMinor: "0",
            currency: "INR",
          },
          {
            id: "invoice-preview-39",
            number: "INV-2026-039",
            customer: "Field Notes Ltd.",
            issueDate: "04 Nov 2026",
            status: "overdue",
            balanceMinor: "1200000",
            currency: "INR",
          },
        ],
      };
    } else if (url.pathname.endsWith("/notifications")) {
      body = { notifications: [], unread: 0 };
    } else if (url.pathname.endsWith("/reminders/status")) {
      body = {
        status: {
          healthy: true,
          dueUnprocessed: 0,
          failed: 0,
          held: 0,
          uncertain: 0,
        },
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("http://127.0.0.1:4175/");
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
  await page.getByRole("region", { name: "Business overview" }).waitFor();
  await page.waitForTimeout(750);
  await page.screenshot({
    path: path.join(marketingPublicDirectory, "dashboard-screenshot.png"),
    fullPage: true,
    animations: "disabled",
  });
} finally {
  await browser.close();
  await server.close();
}
