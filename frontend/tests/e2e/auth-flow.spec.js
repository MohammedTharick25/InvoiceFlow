import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("marketing trial URL opens the app registration page", async ({
  page,
}) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "INVALID_REFRESH_TOKEN", message: "Sign in required." },
      }),
    }),
  );
  await page.goto("/register?plan=trial");
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  expect(page.url()).toContain("/register?plan=trial");
});

test("register routes to login and the verified user can create a workspace, refresh, and sign out", async ({
  page,
}) => {
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
  const user = {
    id: "user-1",
    email: "owner@example.test",
    name: "Workspace Owner",
  };
  const workspace = {
    business: { id: "business-1", name: "Example Studio", currency: "INR" },
    membership: { id: "membership-1", role: "owner", slot: 1 },
    subscription: {
      planKey: "king",
      status: "trialing",
      trialEndsAt: "2026-11-23T00:00:00.000Z",
    },
    settings: null,
  };
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "INVALID_REFRESH_TOKEN", message: "Sign in required." },
      }),
    }),
  );
  await page.route("**/api/auth/register", (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ developmentToken: "d".repeat(48) }),
    }),
  );
  await page.route("**/api/auth/verify-email", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "set-cookie":
          "invoiceflow_refresh=test-cookie; HttpOnly; SameSite=Strict; Path=/api/auth",
      },
      body: JSON.stringify({
        accessToken: "access-login",
        tokenType: "Bearer",
        expiresIn: 900,
        user,
        business: null,
      }),
    }),
  );
  await page.route("**/api/businesses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ...workspace,
        accessToken: "access-workspace",
        tokenType: "Bearer",
        expiresIn: 900,
      }),
    });
  });
  await page.route("**/api/businesses/current", (route) => {
    if (route.request().headers().authorization !== "Bearer access-workspace") {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Workspace token required." },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(workspace),
    });
  });
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Signed out." }),
    }),
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in to InvoiceFlow" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Create an account" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("Your name").fill(user.name);
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password").fill("safe-long-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Your email is verified. You can sign in now."),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password").fill("safe-long-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your workspace" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("Business name").fill("Example Studio");
  await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: localStorage, session: sessionStorage }),
    ),
  ).not.toContain("access-workspace");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to InvoiceFlow" }),
  ).toBeVisible();
});

test("email verification and password reset tokens stay out of the visible URL", async ({
  page,
}) => {
  const received = [];
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "REFRESH_TOKEN_INVALID", message: "Sign in required." },
      }),
    }),
  );
  await page.route("**/api/auth/verify-email", async (route) => {
    received.push(await route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Email verified." }),
    });
  });
  await page.route("**/api/auth/reset-password", async (route) => {
    received.push(await route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Password reset." }),
    });
  });

  await page.goto(
    "/auth/verify-email#token=email-verification-secret-token-1234567890",
  );
  await expect(
    page.getByRole("heading", { name: "Email verified" }),
  ).toBeVisible();
  expect(page.url()).not.toContain("email-verification-secret-token");
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.goto(
    "/auth/reset-password#token=password-reset-secret-token-1234567890",
  );
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page.waitForFunction(
    () => !window.location.hash.includes("password-reset-secret-token"),
  );
  await page.getByLabel("New password").fill("brand-new-long-password");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to InvoiceFlow" }),
  ).toBeVisible();
  expect(received).toEqual([
    { token: "email-verification-secret-token-1234567890" },
    {
      token: "password-reset-secret-token-1234567890",
      password: "brand-new-long-password",
    },
  ]);
});
