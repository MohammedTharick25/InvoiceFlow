import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/modules/users/user.model.js";
import { AuthToken } from "../src/modules/auth/auth-token.model.js";
import { RefreshToken } from "../src/modules/auth/refresh-token.model.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { BusinessMembership } from "../src/modules/businesses/business-membership.model.js";
import { BusinessSettings } from "../src/modules/businesses/business-settings.model.js";
import { Customer } from "../src/modules/customers/customer.model.js";
import { Invoice } from "../src/modules/invoices/invoice.model.js";
import { Payment } from "../src/modules/payments/payment.model.js";
import { ExpenseCategory } from "../src/modules/expenses/expense-category.model.js";
import { Expense } from "../src/modules/expenses/expense.model.js";
import { TaxRate } from "../src/modules/settings/tax-rate.model.js";
import { TaxRateHead } from "../src/modules/settings/tax-rate-head.model.js";
import { Subscription } from "../src/modules/billing/subscription.model.js";
import { UsageCounter } from "../src/modules/billing/usage-counter.model.js";
import { ActivityLog } from "../src/modules/activity-logs/activity-log.model.js";

const env = {
  NODE_ENV: "test",
  FRONTEND_ORIGIN: "http://localhost:5173",
  JWT_ACCESS_SECRET: "a".repeat(40),
  JWT_REFRESH_SECRET: "b".repeat(40),
  DEFAULT_FROM_EMAIL: "auth@example.test",
  MAX_BUSINESSES_PER_USER: 1,
};
const models = [
  User,
  AuthToken,
  RefreshToken,
  Business,
  BusinessMembership,
  BusinessSettings,
  Customer,
  Invoice,
  Payment,
  ExpenseCategory,
  Expense,
  TaxRate,
  TaxRateHead,
  Subscription,
  UsageCounter,
  ActivityLog,
];
let replica;
let app;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("invoiceflow_reports"));
  await Promise.all(models.map((model) => model.init()));
  app = createApp({ env, auth: { passwordChecker: async () => false } });
});
beforeEach(async () =>
  Promise.all(models.map((model) => model.collection.deleteMany({}))),
);
afterAll(async () => {
  await mongoose.disconnect();
  await replica?.stop();
});

async function workspace() {
  const email = `report-${Math.random().toString(16).slice(2)}@example.test`;
  const password = "Correct Horse Battery 47!";
  const registration = await request(app)
    .post("/api/auth/register")
    .send({ email, password, name: "Report Owner" });
  await request(app)
    .post("/api/auth/verify-email")
    .send({ token: registration.body.developmentToken });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  const onboard = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${login.body.accessToken}`)
    .send({
      name: "Report Studio",
      type: "individual",
      address: {
        line1: "1 Main Road",
        city: "Bengaluru",
        stateCode: "29",
        country: "India",
      },
      tax: {},
    });
  expect(onboard.status).toBe(201);
  return {
    token: onboard.body.accessToken,
    businessId: new mongoose.Types.ObjectId(onboard.body.business.id),
    userId: new mongoose.Types.ObjectId(login.body.user.id),
  };
}

describe("Phase 9 dashboard and reports", () => {
  it("exports a tenant-scoped sales report with 1,000 representative invoices", async () => {
    const owner = await workspace();
    const customerId = new mongoose.Types.ObjectId();
    const base = {
      businessId: owner.businessId,
      customerId,
      status: "issued",
      issueDate: new Date("2026-11-01T00:00:00.000Z"),
      dueDate: new Date("2026-11-30T00:00:00.000Z"),
      currency: "INR",
      currencyVersion: 1,
      totals: { totalMinor: 12550 },
      amountPaidMinor: 0,
      balanceMinor: 12550,
      createdBy: owner.userId,
      customerSnapshot: { name: "Load review fixture" },
    };
    await Invoice.insertMany(
      Array.from({ length: 1000 }, (_, index) => ({
        ...base,
        number: `LOAD-${String(index + 1).padStart(6, "0")}`,
      })),
      { ordered: false },
    );

    const startedAt = performance.now();
    const response = await request(app)
      .get("/api/reports/sales.csv?from=2026-11-01&to=2026-11-30")
      .set("Authorization", `Bearer ${owner.token}`);
    const durationMs = performance.now() - startedAt;
    expect(response.status).toBe(200);
    expect(response.text.match(/LOAD-/g)).toHaveLength(1000);
    expect(response.text).toContain("LOAD-001000");
    expect(response.text).not.toContain("Foreign business");
    expect(durationMs).toBeLessThan(10_000);
  });

  it("reconciles dashboard figures and tenant-scoped CSV reports with recorded data", async () => {
    const owner = await workspace();
    const customer = await Customer.create({
      businessId: owner.businessId,
      name: "=SUM(1,1)",
      billingAddress: {
        line1: "1 Main",
        city: "Bengaluru",
        stateCode: "29",
        postalCode: "560001",
      },
    });
    const invoice = await Invoice.create({
      businessId: owner.businessId,
      customerId: customer._id,
      number: "INV2627-000001",
      status: "partially_paid",
      issueDate: new Date("2026-11-01T00:00:00.000Z"),
      dueDate: new Date("2026-11-08T00:00:00.000Z"),
      currency: "INR",
      currencyVersion: 1,
      totals: { totalMinor: 10000 },
      amountPaidMinor: 2500,
      balanceMinor: 7500,
      issuedAt: new Date(),
      createdBy: owner.userId,
      customerSnapshot: { name: customer.name },
    });
    const foreignCustomerId = new mongoose.Types.ObjectId();
    await Customer.create({
      businessId: new mongoose.Types.ObjectId(),
      name: "Foreign customer secret",
      email: "foreign@example.test",
      billingAddress: {
        line1: "99 Foreign Road",
        city: "Delhi",
        stateCode: "07",
        postalCode: "110001",
      },
    });
    await Invoice.create({
      businessId: new mongoose.Types.ObjectId(),
      customerId: foreignCustomerId,
      number: "OTHER-000001",
      status: "issued",
      issueDate: new Date("2026-11-01T00:00:00.000Z"),
      currency: "INR",
      currencyVersion: 1,
      totals: { totalMinor: 90000 },
      balanceMinor: 90000,
      createdBy: owner.userId,
      customerSnapshot: { name: "Foreign business" },
    });
    await Payment.create({
      businessId: owner.businessId,
      invoiceId: invoice._id,
      customerId: customer._id,
      amountMinor: 2500,
      currency: "INR",
      paidAt: new Date(),
      method: "upi",
      idempotencyKey: "report-payment-1",
      recordedBy: owner.userId,
    });
    const category = await ExpenseCategory.create({
      businessId: owner.businessId,
      name: "Office",
      createdBy: owner.userId,
      archivedAt: null,
    });
    await Expense.create({
      businessId: owner.businessId,
      categoryId: category._id,
      vendor: "Local store",
      description: "Supplies",
      amountMinor: 1000,
      currency: "INR",
      date: new Date(),
      method: "upi",
      createdBy: owner.userId,
      archivedAt: null,
    });
    const auth = { Authorization: `Bearer ${owner.token}` };

    const dashboard = await request(app)
      .get("/api/reports/dashboard")
      .set(auth);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body).toMatchObject({
      outstandingCount: 1,
      outstandingMinor: "7500",
      overdueCount: 1,
      overdueMinor: "7500",
      activeCustomers: 1,
    });

    const sales = await request(app)
      .get("/api/reports/sales.csv?from=2026-11-01&to=2026-11-30")
      .set(auth);
    expect(sales.status).toBe(200);
    expect(sales.text).toContain("INV2627-000001");
    expect(sales.text).toContain("'=SUM(1,1)");

    const payments = await request(app)
      .get("/api/reports/payments.csv")
      .set(auth);
    expect(payments.status).toBe(200);
    expect(payments.text).toContain('"2500"');
    expect(payments.text).not.toContain("OTHER-000001");

    const outstanding = await request(app)
      .get("/api/reports/outstanding.csv")
      .set(auth);
    expect(outstanding.status).toBe(200);
    expect(outstanding.text).toContain('"7500"');
    expect(outstanding.text).not.toContain("OTHER-000001");

    const overdue = await request(app)
      .get("/api/reports/overdue.csv")
      .set(auth);
    expect(overdue.status).toBe(200);
    expect(overdue.text).toContain("INV2627-000001");

    const balances = await request(app)
      .get("/api/reports/customer-balances.csv")
      .set(auth);
    expect(balances.status).toBe(200);
    expect(balances.text).toContain('"7500"');

    const customersCsv = await request(app)
      .get("/api/reports/customers.csv")
      .set(auth);
    expect(customersCsv.status).toBe(200);
    expect(customersCsv.text).toContain("'=SUM(1,1)");
    expect(customersCsv.text).not.toContain("Foreign customer secret");
    const pdf = await request(app).get("/api/reports/sales.pdf").set(auth);
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
    for (const report of [
      "payments",
      "outstanding",
      "overdue",
      "customer-balances",
    ]) {
      const pdfReport = await request(app)
        .get(`/api/reports/${report}.pdf`)
        .set(auth);
      expect(pdfReport.status).toBe(200);
      expect(pdfReport.body.subarray(0, 4).toString()).toBe("%PDF");
    }
    const cashflow = await request(app).get("/api/reports/cashflow").set(auth);
    expect(cashflow.status).toBe(200);
    expect(cashflow.body.months).toHaveLength(6);
    expect(cashflow.body.months).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currency: "INR",
          inflowMinor: "2500",
          outflowMinor: "1000",
        }),
      ]),
    );
  });

  it("validates report date filters and requires report permission", async () => {
    const owner = await workspace();
    const invalid = await request(app)
      .get("/api/reports/sales.csv?from=2026-12-01&to=2026-01-01")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(invalid.status).toBe(422);
    await BusinessMembership.updateOne(
      { businessId: owner.businessId, userId: owner.userId },
      { $set: { role: "staff", permissions: ["invoices:read"] } },
    );
    const forbidden = await request(app)
      .get("/api/reports/dashboard")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(forbidden.status).toBe(403);
  });

  it("enforces report plan entitlements server-side", async () => {
    const owner = await workspace();
    await Subscription.updateOne(
      { businessId: owner.businessId },
      {
        $set: {
          planKey: "basic",
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      },
    );
    const response = await request(app)
      .get("/api/reports/dashboard")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(response.status).toBe(402);
    expect(response.body.error).toMatchObject({
      code: "FEATURE_NOT_IN_PLAN",
      details: { requiredPlan: "anointed" },
    });
  });

  it("gates cash-flow and customer CSV exports by their separate plan features", async () => {
    const owner = await workspace();
    await Subscription.updateOne(
      { businessId: owner.businessId },
      {
        $set: {
          planKey: "anointed",
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      },
    );
    const auth = { Authorization: `Bearer ${owner.token}` };
    expect(
      (await request(app).get("/api/reports/customers.csv").set(auth)).status,
    ).toBe(200);
    const cashflow = await request(app).get("/api/reports/cashflow").set(auth);
    expect(cashflow.status).toBe(402);
    expect(cashflow.body.error.details.requiredPlan).toBe("king");
    await Subscription.updateOne(
      { businessId: owner.businessId },
      { $set: { planKey: "basic" } },
    );
    const customerExport = await request(app)
      .get("/api/reports/customers.csv")
      .set(auth);
    expect(customerExport.status).toBe(402);
    expect(customerExport.body.error.details.requiredPlan).toBe("anointed");
  });
});
