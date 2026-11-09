import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const business = { id: "business-qa", name: "QA Studio", currency: "INR" };

async function installApi(page) {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "qa-access",
        tokenType: "Bearer",
        expiresIn: 900,
        user: { id: "qa-owner", email: "owner@example.test", name: "QA Owner" },
        business: { id: business.id, role: "owner" },
      }),
    }),
  );
  await page.route("**/api/businesses/current", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        business,
        membership: { id: "qa-membership", role: "owner", slot: 1 },
        subscription: {
          planKey: "king",
          status: "trialing",
          trialEndsAt: "2026-11-23T00:00:00.000Z",
        },
        entitlements: {
          features: {
            expenses: true,
            reports: true,
            cashflow: true,
            fullExport: true,
            receipts: true,
            reminders: true,
            team: false,
          },
        },
        settings: null,
      }),
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
  await page.route("**/api/customers**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "GET")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ customers: [], total: 0, page: 1, limit: 100 }),
      });
    if (method === "POST" && url.pathname.endsWith("/check-duplicates"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          duplicates: [{ name: "Existing customer", matches: ["email"] }],
        }),
      });
    if (method === "POST" && url.pathname.endsWith("/sample-data"))
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ added: 2, customers: [] }),
      });
    if (method === "POST")
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ customer: { id: "new-customer" } }),
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.route("**/api/reports/cashflow", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currency: "INR",
        months: [
          {
            month: "2026-11",
            currency: "INR",
            inflowMinor: "12345",
            outflowMinor: "2500",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/reports/customers.csv", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/csv",
      body: "name\r\nExample",
    }),
  );
  await page.route("**/api/reports/sales.pdf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: Buffer.from("%PDF-1.4 QA report"),
    }),
  );
  await page.route("**/api/expenses**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ expenses: [], page: 1, limit: 100, total: 0 }),
    }),
  );
  await page.route("**/api/expense-categories**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        categories: [{ id: "category-qa", name: "Office" }],
      }),
    }),
  );
  await page.route("**/api/recurring-expenses**", (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ recurringExpense: { id: "rule-qa" } }),
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ recurringExpenses: [] }),
    });
  });
}

test.beforeEach(async ({ page }) => installApi(page));

test("GST invoice can be finalized, downloaded, sent, unmarked, and fully paid", async ({
  page,
}) => {
  const customer = {
    id: "customer-qa",
    name: "Example Customer",
    billingAddress: {
      line1: "1 Market Road",
      city: "Bengaluru",
      stateCode: "29",
      postalCode: "560001",
    },
  };
  let invoice;
  const payments = [];
  await page.route("**/api/businesses/current", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        business: {
          ...business,
          tax: { gstRegistered: true, stateCode: "29" },
        },
        membership: { id: "qa-membership", role: "owner", slot: 1 },
        subscription: { planKey: "king", status: "trialing" },
        entitlements: { features: { expenses: true, reports: true } },
        settings: null,
      }),
    }),
  );
  await page.route("**/api/customers**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        customers: [customer],
        total: 1,
        page: 1,
        limit: 100,
      }),
    }),
  );
  await page.route("**/api/invoices**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "POST" && url.pathname === "/api/invoices") {
      const input = route.request().postDataJSON();
      invoice = {
        id: "invoice-qa",
        customerId: customer.id,
        customerSnapshot: { name: customer.name },
        status: "draft",
        currency: "INR",
        issueDate: "2026-11-09",
        dueDate: "2026-11-23",
        items: [
          {
            ...input.items[0],
            unit: "unit",
            quantityMilli: 1000,
            unitPriceMinor: 10000,
            taxableMinor: 10000,
            cgstMinor: 900,
            sgstMinor: 900,
            igstMinor: 0,
            lineTotalMinor: 11800,
          },
        ],
        totals: {
          subtotalMinor: 10000,
          taxableMinor: 10000,
          taxMinor: 1800,
          totalMinor: 11800,
        },
        amountPaidMinor: 0,
        balanceMinor: 11800,
        placeOfSupply: null,
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ invoice }),
      });
    }
    if (method === "GET" && url.pathname === "/api/invoices") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: invoice ? [invoice] : [],
          total: invoice ? 1 : 0,
          page: 1,
          limit: 100,
        }),
      });
    }
    if (
      method === "GET" &&
      url.pathname === "/api/invoices/invoice-qa/payments"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          payments,
          total: payments.length,
        }),
      });
    }
    if (url.pathname === "/api/invoices/invoice-qa/pdf") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: Buffer.from("%PDF-1.4 synthetic invoice"),
      });
    }
    if (url.pathname === "/api/invoices/invoice-qa/finalize") {
      const input = route.request().postDataJSON();
      expect(input).toMatchObject({
        confirmPlaceOfSupply: true,
        reverseCharge: "not_applicable",
      });
      invoice = { ...invoice, status: "issued", number: "INV2627-000001" };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ invoice }),
      });
    }
    if (url.pathname === "/api/invoices/invoice-qa/mark-sent") {
      expect(route.request().postDataJSON().via).toBe("whatsapp");
      invoice = { ...invoice, status: "sent" };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ invoice }),
      });
    }
    if (url.pathname === "/api/invoices/invoice-qa/unmark-sent") {
      expect(route.request().postDataJSON().note).toBe("Recorded by mistake");
      invoice = { ...invoice, status: "issued" };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ invoice }),
      });
    }
    if (
      url.pathname === "/api/invoices/invoice-qa/payments" &&
      method === "POST"
    ) {
      const input = route.request().postDataJSON();
      expect([5000, 6800]).toContain(input.amountMinor);
      const amountPaidMinor = invoice.amountPaidMinor + input.amountMinor;
      const nextPayment = {
        id: `payment-${payments.length + 1}`,
        amountMinor: input.amountMinor,
        currency: "INR",
        status: "recorded",
        method: "bank_transfer",
        paidAt: "2026-11-09T00:00:00.000Z",
      };
      payments.push(nextPayment);
      invoice = {
        ...invoice,
        status: amountPaidMinor === 11800 ? "paid" : "partially_paid",
        amountPaidMinor,
        balanceMinor: 11800 - amountPaidMinor,
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ payment: nextPayment }),
      });
    }
    if (method === "PATCH" && url.pathname === "/api/invoices/invoice-qa") {
      invoice = { ...invoice, ...route.request().postDataJSON() };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice,
          placeOfSupplyCandidates: [
            { basis: "customer_billing", stateCode: "29" },
          ],
        }),
      });
    }
    if (method === "GET" && url.pathname === "/api/invoices/invoice-qa") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice,
          placeOfSupplyCandidates: [
            { basis: "customer_billing", stateCode: "29" },
          ],
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page.getByLabel("Customer").selectOption(customer.id);
  await page.getByLabel("Description").fill("Consulting services");
  await page.getByLabel("Unit price").fill("100.00");
  await page.getByLabel("Tax treatment").selectOption("taxable");
  await page.getByLabel("Tax rate code").fill("GST18");
  await page.getByLabel("HSN/SAC (if known)").fill("998311");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page
    .getByRole("combobox", { name: "Place of supply" })
    .selectOption("customer_billing:29");
  await page.getByLabel("I confirmed the place of supply shown above.").check();
  await page
    .getByLabel("Reverse-charge declaration")
    .selectOption("not_applicable");
  await page.getByRole("button", { name: "Finalize" }).click();
  await expect(
    page.getByText(/No customer communication was made/),
  ).toBeVisible();
  await expect(page.getByText("INV2627-000001").first()).toBeVisible();
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  expect((await pdfDownload).suggestedFilename()).toBe("INV2627-000001.pdf");
  await page.getByLabel("How was it sent?").selectOption("whatsapp");
  await page.getByRole("button", { name: "Record as sent" }).click();
  await expect(
    page.getByText(/Sent status recorded based on your declaration/),
  ).toBeVisible();
  await page
    .getByLabel("Why are you clearing the sent status?")
    .fill("Recorded by mistake");
  await page.getByRole("button", { name: "Clear sent status" }).click();
  await expect(page.getByText("Sent status cleared.")).toBeVisible();
  await page.getByLabel("How was it sent?").selectOption("whatsapp");
  await page.getByRole("button", { name: "Record as sent" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("50.00");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/Payment recorded/)).toBeVisible();
  await expect(page.getByText(/68\.00/)).toBeVisible();
  await page.getByLabel("Amount", { exact: true }).fill("68.00");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("INV2627-000001 · paid")).toBeVisible();
  await expect(page.getByText("₹0.00", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("inter-state invoice details show IGST and do not show CGST or SGST", async ({
  page,
}) => {
  const invoice = {
    id: "invoice-inter-qa",
    number: "INV2627-000777",
    status: "issued",
    currency: "INR",
    issueDate: "2026-11-09",
    customerSnapshot: { name: "Maharashtra Customer" },
    items: [
      {
        description: "Inter-state consulting",
        hsnSac: "998311",
        taxability: "taxable",
        taxableMinor: 10000,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 1800,
      },
    ],
    totals: { totalMinor: 11800, taxMinor: 1800 },
    amountPaidMinor: 0,
    balanceMinor: 11800,
  };
  await page.route("**/api/invoices**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        invoices: [invoice],
        total: 1,
        page: 1,
        limit: 100,
      }),
    }),
  );
  await page.route("**/api/invoices/invoice-inter-qa", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ invoice }),
    }),
  );
  await page.route("**/api/invoices/invoice-inter-qa/payments", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ payments: [], total: 0 }),
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page.getByRole("button", { name: /INV2627-000777/ }).click();
  await expect(
    page.getByRole("heading", { name: "Invoice calculation" }),
  ).toBeVisible();
  await expect(page.getByText("IGST", { exact: true })).toBeVisible();
  await expect(page.getByText("₹18.00", { exact: true })).toBeVisible();
  await expect(page.getByText("CGST", { exact: true })).toHaveCount(0);
  await expect(page.getByText("SGST", { exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("appending a tax-rate version leaves the finalized invoice display unchanged", async ({
  page,
}) => {
  const invoice = {
    id: "invoice-rate-snapshot-qa",
    number: "INV2627-000778",
    status: "issued",
    currency: "INR",
    issueDate: "2026-11-09",
    customerSnapshot: { name: "Rate Snapshot Customer" },
    items: [
      {
        description: "Saved-rate consulting",
        hsnSac: "998311",
        taxability: "taxable",
        taxableMinor: 10000,
        rateBp: 1800,
        cgstMinor: 900,
        sgstMinor: 900,
        igstMinor: 0,
      },
    ],
    totals: { totalMinor: 11800, taxMinor: 1800 },
    amountPaidMinor: 0,
    balanceMinor: 11800,
  };
  const taxRates = [
    {
      id: "rate-v1",
      code: "GST18",
      name: "Base GST rate",
      kind: "rate",
      rateBp: 1800,
      effectiveFrom: null,
    },
  ];
  await page.route("**/api/invoices**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        invoices: [invoice],
        total: 1,
        page: 1,
        limit: 100,
      }),
    }),
  );
  await page.route("**/api/invoices/invoice-rate-snapshot-qa", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ invoice }),
    }),
  );
  await page.route(
    "**/api/invoices/invoice-rate-snapshot-qa/payments",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ payments: [], total: 0 }),
      }),
  );
  await page.route("**/api/settings/tax-rates", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ taxRates }),
      });
    const input = route.request().postDataJSON();
    expect(input).toMatchObject({
      code: "GST18",
      rateBp: 1900,
      effectiveFrom: "2027-04-01",
    });
    taxRates.push({ id: "rate-v2", ...input });
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ taxRate: taxRates.at(-1) }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page.getByRole("button", { name: /INV2627-000778/ }).click();
  await expect(page.getByText("18%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tax settings", exact: true }).click();
  await expect(page.getByText("GST18 · Base GST rate")).toBeVisible();
  await page.getByLabel("Version name").fill("Future GST rate");
  await page.getByLabel("Rate (%)").fill("19");
  await page.getByLabel("Effective from").fill("2027-04-01");
  await page.getByRole("button", { name: "Add version" }).click();
  await expect(page.getByRole("status")).toContainText(
    "A new GST18 tax-rate version was added",
  );
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page.getByRole("button", { name: /INV2627-000778/ }).click();
  await expect(page.getByText("18%", { exact: true })).toBeVisible();
  await expect(page.getByText("19%", { exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("customer duplicate warning is accessible and allows intentional continuation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByLabel("Customer name").fill("Existing customer");
  await page.getByLabel("Email").fill("same@example.test");
  await page.getByLabel("Street address").fill("1 Market Road");
  await page.getByLabel("City").fill("Mumbai");
  await page.getByLabel("Two-digit state code").fill("27");
  await page.getByLabel("Postal code").fill("400001");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(
    page.getByRole("status", { name: "Possible duplicate customers" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Add anyway" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Customer added." }),
  ).toBeVisible();
});

test("reports expose cash flow and download customer CSV and PDF", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByText("2026-11", { exact: true })).toBeVisible();
  await expect(page.getByText(/123\.45/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download customer CSV" }).click();
  expect((await csvDownload).suggestedFilename()).toBe(
    "invoiceflow-customers.csv",
  );
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).first().click();
  expect((await pdfDownload).suggestedFilename()).toBe("invoiceflow-sales.pdf");
});

test("recurring expense form accepts exact amounts and stores a scheduled rule", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  const recurring = page.getByRole("region", { name: "Recurring expenses" });
  await expect(recurring).toBeVisible();
  await recurring.getByLabel("Category").selectOption("category-qa");
  await page
    .getByLabel("Vendor", { exact: true })
    .last()
    .fill("Internet provider");
  await page
    .getByLabel("Description", { exact: true })
    .last()
    .fill("Monthly internet");
  await recurring.getByLabel("Amount (INR)").fill("125.50");
  const submission = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/recurring-expenses") &&
      request.method() === "POST",
  );
  await recurring
    .getByRole("button", { name: "Create recurring rule" })
    .click();
  expect(JSON.parse((await submission).postData()).amountMinor).toBe(12550);
  await expect(
    page.getByRole("heading", { name: "Recurring expenses" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("empty owner dashboard can add sample contacts with an explicit action", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText(/Adds two clearly labeled sample contacts/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add sample customers" }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
});

test("currency change requires explicit draft amount clearing and preserves draft details", async ({
  page,
}) => {
  let currency = "INR";
  let cleared = false;
  await page.route("**/api/businesses/current/currency", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.currency).toBe("USD");
    if (!cleared)
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "DRAFTS_REQUIRE_REVIEW",
            message: "Review amount-holding drafts before changing currency.",
            details: { draftIds: ["priced-draft-qa"] },
          },
        }),
      });
    currency = "USD";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        business: { id: business.id, currency, currencyVersion: 2 },
      }),
    });
  });
  await page.route(
    "**/api/invoices/priced-draft-qa/clear-amounts",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        confirmation: "CLEAR_AMOUNTS",
      });
      cleared = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            id: "priced-draft-qa",
            status: "draft",
            currency: "INR",
            items: [
              {
                description: "Consulting",
                quantityMilli: 1000,
                unitPriceMinor: 0,
              },
            ],
          },
        }),
      });
    },
  );
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");
  await page.getByRole("button", { name: "Business settings" }).click();
  await page.getByLabel("Invoice currency").selectOption("USD");
  await page.getByRole("button", { name: "Change currency" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Review amount-holding drafts",
  );
  await page
    .getByRole("button", { name: "Clear draft amounts and change currency" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Draft amounts cleared and business currency changed to USD",
  );
  await expect(page.getByLabel("Invoice currency")).toHaveValue("USD");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("reminder disable confirms cancellation and re-enable does not restore cancelled reminders", async ({
  page,
}) => {
  const reminderSettings = {
    enabled: true,
    sendTimeLocal: "09:00",
    schedule: [
      { key: "before_due_3", offsetDays: 3, when: "before_due" },
      { key: "on_due", offsetDays: 0, when: "on_due" },
      { key: "after_due_3", offsetDays: 3, when: "after_due" },
    ],
  };
  const patchPayloads = [];
  await page.route("**/api/settings/reminders", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reminders: reminderSettings }),
      });
    const input = route.request().postDataJSON();
    patchPayloads.push(input);
    if (input.enabled === false && input.confirmCancelPending === undefined)
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "REMINDERS_DISABLE_CONFIRMATION_REQUIRED",
            message: "Confirm cancelling pending reminders.",
            details: { pendingCount: 3 },
          },
        }),
      });
    reminderSettings.enabled = input.enabled ?? reminderSettings.enabled;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reminders: reminderSettings }),
    });
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");
  await page.getByRole("button", { name: "Reminders", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Send reminders" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByText(/will not restore cancelled reminders/),
  ).toBeVisible();
  expect(patchPayloads).toEqual([
    { enabled: false },
    { enabled: false, confirmCancelPending: 3 },
  ]);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("status")).toContainText(
    "Existing cancelled reminders will not be restored",
  );
  expect(patchPayloads.at(-1)).toEqual({ enabled: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
