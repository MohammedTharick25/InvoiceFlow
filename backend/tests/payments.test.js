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
import { createLocalStorageProvider } from "../src/modules/invoices/storage.service.js";
import { Payment } from "../src/modules/payments/payment.model.js";
import { ReminderLog } from "../src/modules/reminders/reminder-log.model.js";

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
  ReminderLog,
];
let replica;
let app;
let storageRoot;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("invoiceflow_payments"));
  await Promise.all(models.map((model) => model.init()));
  storageRoot = await mkdtemp(join(tmpdir(), "invoiceflow-payments-"));
  app = createApp({
    env,
    auth: { passwordChecker: async () => false },
    invoices: { storage: createLocalStorageProvider({ root: storageRoot }) },
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
  const email = `payment-${Math.random().toString(16).slice(2)}@example.test`;
  const password = "Correct Horse Battery 47!";
  const registration = await request(app)
    .post("/api/auth/register")
    .send({ email, password, name: "Payment Owner" });
  const verified = await request(app)
    .post("/api/auth/verify-email")
    .send({ token: registration.body.developmentToken });
  expect(verified.status).toBe(200);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  const business = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${login.body.accessToken}`)
    .send({
      name: "Payment Studio",
      type: "individual",
      address: {
        line1: "1 Main Road",
        city: "Bengaluru",
        stateCode: "29",
        country: "India",
      },
      tax: {},
    });
  expect(business.status).toBe(201);
  const customer = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${business.body.accessToken}`)
    .send({
      name: "Sample Customer",
      email: "customer@example.test",
      billingAddress: {
        line1: "2 Market Road",
        city: "Bengaluru",
        stateCode: "29",
        postalCode: "560001",
      },
    });
  expect(customer.status).toBe(201);
  return {
    token: business.body.accessToken,
    userId: login.body.user.id,
    businessId: business.body.business.id,
    customerId: customer.body.customer.id,
  };
}

async function createPayableInvoice(workspace) {
  const draft = await request(app)
    .post("/api/invoices")
    .set("Authorization", `Bearer ${workspace.token}`)
    .send({
      customerId: workspace.customerId,
      issueDate: "2026-11-09",
      items: [
        {
          description: "Consulting",
          unit: "hour",
          quantityMilli: 1000,
          unitPriceMinor: 10000,
          taxability: "non_gst",
        },
      ],
    });
  expect(draft.status).toBe(201);
  const issued = await request(app)
    .post(`/api/invoices/${draft.body.invoice.id}/finalize`)
    .set("Authorization", `Bearer ${workspace.token}`)
    .send({
      idempotencyKey: `payment-finalize-${Math.random().toString(16).slice(2)}`,
    });
  expect(issued.status).toBe(200);
  return issued.body.invoice;
}

function paymentInput(overrides = {}) {
  return {
    idempotencyKey: "payment-record-key-001",
    amountMinor: 4000,
    paidAt: "2026-11-09T10:00:00.000Z",
    method: "upi",
    reference: "UPI-123",
    notes: "Advance",
    ...overrides,
  };
}

function recordPayment(workspace, invoiceId, input = paymentInput()) {
  return request(app)
    .post(`/api/invoices/${invoiceId}/payments`)
    .set("Authorization", `Bearer ${workspace.token}`)
    .send(input);
}

describe("Phase 6 payment ledger", () => {
  it("records partial and final payments and derives status without claiming delivery", async () => {
    const workspace = await createWorkspace();
    const invoice = await createPayableInvoice(workspace);
    const partial = await recordPayment(workspace, invoice.id);
    expect(partial.status).toBe(201);
    expect(partial.body.invoice).toMatchObject({
      status: "partially_paid",
      amountPaidMinor: 4000,
      balanceMinor: 6000,
      sentAt: null,
    });
    const replay = await recordPayment(workspace, invoice.id);
    expect(replay.status).toBe(201);
    expect(replay.body.replayed).toBe(true);
    expect(
      await Payment.countDocuments({ businessId: workspace.businessId }),
    ).toBe(1);

    const final = await recordPayment(
      workspace,
      invoice.id,
      paymentInput({
        idempotencyKey: "payment-record-key-002",
        amountMinor: 6000,
        reference: "UPI-456",
      }),
    );
    expect(final.status).toBe(201);
    expect(final.body.invoice).toMatchObject({
      status: "paid",
      amountPaidMinor: 10000,
      balanceMinor: 0,
      sentAt: null,
    });
    const history = await request(app)
      .get(`/api/invoices/${invoice.id}/payments?page=1&limit=10`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(history.status).toBe(200);
    expect(history.body.payments).toHaveLength(2);
    expect(history.body.meta.total).toBe(2);
  });

  it("keeps PDF downloads and payments available while blocking new records after trial expiry", async () => {
    const workspace = await createWorkspace();
    const invoice = await createPayableInvoice(workspace);
    await Subscription.updateOne(
      { businessId: workspace.businessId },
      { $set: { status: "expired" } },
    );
    const blockedCustomer = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        name: "Blocked Customer",
        billingAddress: {
          line1: "2 Market Road",
          city: "Bengaluru",
          stateCode: "29",
          postalCode: "560001",
        },
      });
    expect(blockedCustomer.status).toBe(402);
    expect(blockedCustomer.body.error.code).toBe("SUBSCRIPTION_READ_ONLY");

    const pdf = await request(app)
      .get(`/api/invoices/${invoice.id}/pdf`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");

    const exported = await request(app)
      .get("/api/export")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(exported.status).toBe(200);
    expect(exported.body.schemaVersion).toBe("invoiceflow-record-export-v1");
    expect(exported.body.invoices).toEqual(
      expect.arrayContaining([expect.objectContaining({ _id: invoice.id })]),
    );

    const payment = await recordPayment(workspace, invoice.id);
    expect(payment.status).toBe(201);
    expect(payment.body.invoice.balanceMinor).toBe(6000);
  });

  it("rejects overpayment and concurrent payments cannot overpay", async () => {
    const workspace = await createWorkspace();
    const invoice = await createPayableInvoice(workspace);
    const tooMuch = await recordPayment(
      workspace,
      invoice.id,
      paymentInput({ amountMinor: 10001 }),
    );
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error.code).toBe("PAYMENT_EXCEEDS_BALANCE");

    const results = await Promise.all([
      recordPayment(
        workspace,
        invoice.id,
        paymentInput({
          idempotencyKey: "payment-race-key-001",
          amountMinor: 6000,
        }),
      ),
      recordPayment(
        workspace,
        invoice.id,
        paymentInput({
          idempotencyKey: "payment-race-key-002",
          amountMinor: 6000,
        }),
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const saved = await Invoice.findById(invoice.id);
    expect(saved.amountPaidMinor).toBe(6000);
    expect(saved.balanceMinor).toBe(4000);
    expect(
      await Payment.countDocuments({
        invoiceId: invoice.id,
        status: "recorded",
      }),
    ).toBe(1);
  });

  it("reverses once, restores the outstanding balance, and preserves immutable payment facts", async () => {
    const workspace = await createWorkspace();
    const invoice = await createPayableInvoice(workspace);
    const payment = await recordPayment(workspace, invoice.id);
    const paymentId = payment.body.payment.id;
    const input = {
      idempotencyKey: "payment-reverse-key-001",
      reason: "Duplicate entry",
    };
    const reverse = () =>
      request(app)
        .post(`/api/invoices/${invoice.id}/payments/${paymentId}/reverse`)
        .set("Authorization", `Bearer ${workspace.token}`)
        .send(input);
    const result = await reverse();
    expect(result.status).toBe(200);
    expect(result.body.payment).toMatchObject({
      status: "reversed",
      reversalReason: "Duplicate entry",
    });
    expect(result.body.invoice).toMatchObject({
      status: "issued",
      amountPaidMinor: 0,
      balanceMinor: 10000,
    });
    expect((await reverse()).body.payment.status).toBe("reversed");
    expect(await Payment.countDocuments({ invoiceId: invoice.id })).toBe(1);
    await expect(
      Payment.updateOne({ _id: paymentId }, { $set: { notes: "tampered" } }),
    ).rejects.toThrow("append-only");
  });

  it("replays concurrent identical requests with one payment entry", async () => {
    const workspace = await createWorkspace();
    const invoice = await createPayableInvoice(workspace);
    const input = paymentInput({
      idempotencyKey: "same-payment-race-key",
      amountMinor: 2500,
    });
    const results = await Promise.all([
      recordPayment(workspace, invoice.id, input),
      recordPayment(workspace, invoice.id, input),
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0].body.payment.id).toBe(results[1].body.payment.id);
    expect(await Payment.countDocuments({ invoiceId: invoice.id })).toBe(1);
    expect((await Invoice.findById(invoice.id)).amountPaidMinor).toBe(2500);
  });

  it("uses a durable payment key, rejects key reuse with changed data, and isolates tenants", async () => {
    const ownerA = await createWorkspace();
    const invoiceA = await createPayableInvoice(ownerA);
    const ownerB = await createWorkspace();
    const foreign = await recordPayment(ownerB, invoiceA.id);
    expect(foreign.status).toBe(404);

    const first = await recordPayment(ownerA, invoiceA.id);
    expect(first.status).toBe(201);
    const reuse = await recordPayment(
      ownerA,
      invoiceA.id,
      paymentInput({ amountMinor: 3000 }),
    );
    expect(reuse.status).toBe(409);
    expect(reuse.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("locks business currency in the payment transaction", async () => {
    const workspace = await createWorkspace();
    const invoice = await createPayableInvoice(workspace);
    await Business.updateOne(
      { _id: workspace.businessId },
      { $set: { hasFinalizedRecords: false, currencyLockedAt: null } },
    );
    const result = await recordPayment(workspace, invoice.id);
    expect(result.status).toBe(201);
    const business = await Business.findById(workspace.businessId);
    expect(business.hasFinalizedRecords).toBe(true);
    expect(business.currencyLockedAt).toBeTruthy();
    const changed = await request(app)
      .patch("/api/businesses/current/currency")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ currency: "USD" });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe("CURRENCY_LOCKED");
  });
});
