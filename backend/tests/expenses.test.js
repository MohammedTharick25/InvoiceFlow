import mongoose from "mongoose";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { ExpenseCategory } from "../src/modules/expenses/expense-category.model.js";
import { Expense } from "../src/modules/expenses/expense.model.js";
import { RecurringExpense } from "../src/modules/expenses/recurring-expense.model.js";
import {
  createRecurringExpenseService,
  nextOccurrence,
} from "../src/modules/expenses/recurring-expense.service.js";
import { TaxRate } from "../src/modules/settings/tax-rate.model.js";
import { TaxRateHead } from "../src/modules/settings/tax-rate-head.model.js";
import { Subscription } from "../src/modules/billing/subscription.model.js";
import { UsageCounter } from "../src/modules/billing/usage-counter.model.js";
import { ActivityLog } from "../src/modules/activity-logs/activity-log.model.js";
import { Customer } from "../src/modules/customers/customer.model.js";
import { Counter } from "../src/modules/invoices/counter.model.js";
import { IdempotencyKey } from "../src/modules/invoices/idempotency-key.model.js";
import { Invoice } from "../src/modules/invoices/invoice.model.js";
import { InvoiceDelivery } from "../src/modules/invoices/invoice-delivery.model.js";
import { StoredFile } from "../src/modules/invoices/stored-file.model.js";
import { Payment } from "../src/modules/payments/payment.model.js";
import { createLocalStorageProvider } from "../src/modules/invoices/storage.service.js";

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
  ExpenseCategory,
  Expense,
  RecurringExpense,
  TaxRate,
  TaxRateHead,
  Subscription,
  UsageCounter,
  ActivityLog,
  Customer,
  Counter,
  IdempotencyKey,
  Invoice,
  InvoiceDelivery,
  StoredFile,
  Payment,
];
let replica;
let app;
let storageRoot;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("invoiceflow_expenses"));
  await Promise.all(models.map((model) => model.init()));
  storageRoot = await mkdtemp(join(tmpdir(), "invoiceflow-expenses-"));
  app = createApp({
    env,
    auth: { passwordChecker: async () => false },
    expenses: { storage: createLocalStorageProvider({ root: storageRoot }) },
  });
});

beforeEach(async () => {
  await Promise.all(models.map((model) => model.collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replica?.stop();
  await rm(storageRoot, { recursive: true, force: true });
});

async function createWorkspace() {
  const email = `expense-${Math.random().toString(16).slice(2)}@example.test`;
  const password = "Correct Horse Battery 47!";
  const registration = await request(app)
    .post("/api/auth/register")
    .send({ email, password, name: "Expense Owner" });
  const verified = await request(app)
    .post("/api/auth/verify-email")
    .send({ token: registration.body.developmentToken });
  expect(verified.status).toBe(200);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  const onboarding = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${login.body.accessToken}`)
    .send({
      name: "Expense Studio",
      type: "individual",
      address: {
        line1: "1 Main Road",
        city: "Bengaluru",
        stateCode: "29",
        country: "India",
      },
      tax: {},
    });
  expect(onboarding.status).toBe(201);
  return {
    token: onboarding.body.accessToken,
    businessId: onboarding.body.business.id,
    userId: login.body.user.id,
  };
}

async function createCategory(workspace, name = "Travel test") {
  const result = await request(app)
    .post("/api/expense-categories")
    .set("Authorization", `Bearer ${workspace.token}`)
    .send({ name });
  expect(result.status).toBe(201);
  return result.body.category;
}

function expenseInput(categoryId, overrides = {}) {
  return {
    categoryId,
    vendor: "City Cab",
    description: "Client meeting travel",
    amountMinor: 12500,
    date: "2026-11-09",
    method: "upi",
    reference: "UPI-EXP-001",
    notes: "Office travel",
    ...overrides,
  };
}

describe("Phase 7 expenses and receipts", () => {
  it("creates and pauses tenant-scoped recurring expense rules and records due occurrences once", async () => {
    const workspace = await createWorkspace();
    const category = await createCategory(workspace, "Subscription test");
    const response = await request(app)
      .post("/api/recurring-expenses")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        categoryId: category.id,
        vendor: "City Cab",
        description: "Client travel",
        amountMinor: 12500,
        method: "upi",
        frequency: "weekly",
        nextRunAt: "2026-11-09",
        endAt: "2026-12-31",
      });
    expect(response.status).toBe(201);
    const indexes = await Expense.collection.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "recurring_expense_occurrence_unique",
          unique: true,
          partialFilterExpression: {
            recurringExpenseId: { $type: "objectId" },
          },
        }),
      ]),
    );
    const edited = await request(app)
      .put(`/api/recurring-expenses/${response.body.recurringExpense.id}`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ description: "Updated client travel", amountMinor: 15000 });
    expect(edited.status).toBe(200);
    expect(edited.body.recurringExpense).toMatchObject({
      description: "Updated client travel",
      amountMinor: 15000,
    });
    expect(
      nextOccurrence("2026-01-31", "monthly").toISOString().slice(0, 10),
    ).toBe("2026-02-28");
    const runner = createRecurringExpenseService({
      now: () => new Date("2026-11-10T00:00:00.000Z"),
    });
    await Subscription.updateOne(
      { businessId: workspace.businessId },
      {
        $set: {
          status: "expired",
          trialEndsAt: new Date("2026-11-01T00:00:00.000Z"),
        },
      },
    );
    expect(await runner.runDue()).toEqual({ generated: 0 });
    expect(
      await Expense.countDocuments({
        recurringExpenseId: response.body.recurringExpense.id,
      }),
    ).toBe(0);
    await Subscription.updateOne(
      { businessId: workspace.businessId },
      {
        $set: {
          planKey: "king",
          status: "active",
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
        },
      },
    );
    expect(await runner.runDue()).toEqual({ generated: 1 });
    expect(await runner.runDue()).toEqual({ generated: 0 });
    expect(
      await Expense.countDocuments({
        recurringExpenseId: response.body.recurringExpense.id,
      }),
    ).toBe(1);
    const list = await request(app)
      .get("/api/recurring-expenses")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(list.body.recurringExpenses[0].nextRunAt).toBe("2026-11-16");
    const paused = await request(app)
      .patch(`/api/recurring-expenses/${response.body.recurringExpense.id}`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ paused: true });
    expect(paused.body.recurringExpense.paused).toBe(true);
    expect(await runner.runDue()).toEqual({ generated: 0 });
  });
  it("creates, lists, updates, and archives tenant-scoped categories", async () => {
    const workspace = await createWorkspace();
    const category = await createCategory(workspace);
    const list = await request(app)
      .get("/api/expense-categories")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(list.status).toBe(200);
    expect(list.body.categories).toContainEqual(
      expect.objectContaining({ id: category.id, name: "Travel test" }),
    );

    const duplicate = await request(app)
      .post("/api/expense-categories")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ name: "Travel test" });
    expect(duplicate.status).toBe(409);
    const updated = await request(app)
      .patch(`/api/expense-categories/${category.id}`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ name: "Local travel" });
    expect(updated.status).toBe(200);
    expect(updated.body.category.name).toBe("Local travel");
    const archived = await request(app)
      .delete(`/api/expense-categories/${category.id}`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(archived.status).toBe(200);
    expect(
      (await ExpenseCategory.findById(category.id)).archivedAt,
    ).toBeTruthy();
  });

  it("records expenses, filters and edits them, and locks business currency transactionally", async () => {
    const workspace = await createWorkspace();
    const category = await createCategory(workspace);
    const created = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send(expenseInput(category.id));
    expect(created.status).toBe(201);
    expect(created.body.expense).toMatchObject({
      amountMinor: 12500,
      currency: "INR",
      category: { name: "Travel test" },
    });
    const list = await request(app)
      .get(
        `/api/expenses?categoryId=${category.id}&from=2026-11-01&to=2026-11-30`,
      )
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    const updated = await request(app)
      .patch(`/api/expenses/${created.body.expense.id}`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ amountMinor: 14000, description: "Updated travel" });
    expect(updated.status).toBe(200);
    expect(updated.body.expense).toMatchObject({
      amountMinor: 14000,
      description: "Updated travel",
    });
    const business = await Business.findById(workspace.businessId);
    expect(business.hasFinalizedRecords).toBe(true);
    expect(business.currencyLockedAt).toBeTruthy();
    const currency = await request(app)
      .patch("/api/businesses/current/currency")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ currency: "USD" });
    expect(currency.status).toBe(409);
    expect(currency.body.error.code).toBe("CURRENCY_LOCKED");

    const archived = await request(app)
      .delete(`/api/expenses/${created.body.expense.id}`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(archived.status).toBe(200);
    expect(
      await Expense.countDocuments({
        businessId: workspace.businessId,
        archivedAt: null,
      }),
    ).toBe(0);
  });

  it("stores, replaces, verifies, downloads, and removes a private PDF receipt", async () => {
    const workspace = await createWorkspace();
    const category = await createCategory(workspace);
    const expense = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send(expenseInput(category.id));
    expect(expense.status).toBe(201);
    const firstBuffer = Buffer.from("%PDF-1.4\nreceipt one\n%%EOF\n");
    const first = await request(app)
      .post(`/api/expenses/${expense.body.expense.id}/receipt`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .attach("receipt", firstBuffer, {
        filename: "first.pdf",
        contentType: "application/pdf",
      });
    expect(first.status).toBe(201);
    expect(first.body.receipt).toMatchObject({
      filename: "first.pdf",
      mime: "application/pdf",
    });

    const secondBuffer = Buffer.from("%PDF-1.4\nreceipt two\n%%EOF\n");
    const second = await request(app)
      .post(`/api/expenses/${expense.body.expense.id}/receipt`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .attach("receipt", secondBuffer, {
        filename: "second.pdf",
        contentType: "application/pdf",
      });
    expect(second.status).toBe(201);
    expect(
      await StoredFile.countDocuments({
        businessId: workspace.businessId,
        purpose: "receipt",
      }),
    ).toBe(1);

    const downloaded = await request(app)
      .get(`/api/expenses/${expense.body.expense.id}/receipt`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["content-type"]).toContain("application/pdf");
    expect(downloaded.body).toEqual(secondBuffer);
    const removed = await request(app)
      .delete(`/api/expenses/${expense.body.expense.id}/receipt`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(removed.status).toBe(200);
    expect(
      await StoredFile.countDocuments({
        businessId: workspace.businessId,
        purpose: "receipt",
      }),
    ).toBe(0);
  });

  it("checks receipt magic bytes and enforces tenant isolation", async () => {
    const ownerA = await createWorkspace();
    const categoryA = await createCategory(ownerA);
    const expenseA = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${ownerA.token}`)
      .send(expenseInput(categoryA.id));
    const invalid = await request(app)
      .post(`/api/expenses/${expenseA.body.expense.id}/receipt`)
      .set("Authorization", `Bearer ${ownerA.token}`)
      .attach("receipt", Buffer.from("not a PDF"), {
        filename: "receipt.pdf",
        contentType: "application/pdf",
      });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("RECEIPT_TYPE_INVALID");

    const ownerB = await createWorkspace();
    const foreign = await request(app)
      .get(`/api/expenses/${expenseA.body.expense.id}`)
      .set("Authorization", `Bearer ${ownerB.token}`);
    expect(foreign.status).toBe(404);
  });

  it("rejects tenant-selected business scope and invalid expense IDs", async () => {
    const workspace = await createWorkspace();
    const category = await createCategory(workspace);
    const injected = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ ...expenseInput(category.id), businessId: workspace.businessId });
    expect(injected.status).toBe(400);
    const invalid = await request(app)
      .get("/api/expenses/not-an-object-id")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(invalid.status).toBe(404);
  });
});
