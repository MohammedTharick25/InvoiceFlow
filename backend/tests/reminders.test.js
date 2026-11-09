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
import { Payment } from "../src/modules/payments/payment.model.js";
import { ReminderLog } from "../src/modules/reminders/reminder-log.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import { JobLease } from "../src/modules/scheduler/job-lease.model.js";
import { JobRun } from "../src/modules/scheduler/job-run.model.js";
import { createLocalStorageProvider } from "../src/modules/invoices/storage.service.js";
import { businessDate } from "../src/utils/clock.js";

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
  Notification,
  JobLease,
  JobRun,
];
let replica;
let app;
let storageRoot;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("invoiceflow_reminders"));
  await Promise.all(models.map((model) => model.init()));
  storageRoot = await mkdtemp(join(tmpdir(), "invoiceflow-reminders-"));
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
  const email = `reminder-${Math.random().toString(16).slice(2)}@example.test`;
  const password = "Correct Horse Battery 47!";
  const registration = await request(app)
    .post("/api/auth/register")
    .send({ email, password, name: "Reminder Owner" });
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
      name: "Reminder Studio",
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
  const customer = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${onboarding.body.accessToken}`)
    .send({
      name: "Reminder Customer",
      email: "customer@example.test",
      phone: "9876543210",
      billingAddress: {
        line1: "2 Market Road",
        city: "Bengaluru",
        stateCode: "29",
        postalCode: "560001",
      },
      reminderPrefs: { enabled: true },
    });
  expect(customer.status).toBe(201);
  return {
    token: onboarding.body.accessToken,
    businessId: onboarding.body.business.id,
    userId: login.body.user.id,
    customerId: customer.body.customer.id,
  };
}

async function createFinalizedInvoice(
  workspace,
  dueDate = businessDate(new Date(), "Asia/Kolkata"),
) {
  const draft = await request(app)
    .post("/api/invoices")
    .set("Authorization", `Bearer ${workspace.token}`)
    .send({
      customerId: workspace.customerId,
      issueDate: businessDate(new Date(), "Asia/Kolkata"),
      dueDate,
      items: [
        {
          description: "Consulting service",
          unit: "hour",
          quantityMilli: 1000,
          unitPriceMinor: 10000,
          taxability: "non_gst",
        },
      ],
    });
  expect(draft.status).toBe(201);
  const finalized = await request(app)
    .post(`/api/invoices/${draft.body.invoice.id}/finalize`)
    .set("Authorization", `Bearer ${workspace.token}`)
    .send({ idempotencyKey: `reminder-finalize-${Math.random()}` });
  expect(finalized.status).toBe(200);
  return finalized.body.invoice;
}

describe("Phase 8 reminder schedule and notifications", () => {
  it("materializes business-local rules at finalization and deduplicates in-app delivery", async () => {
    const workspace = await createWorkspace();
    const invoice = await createFinalizedInvoice(workspace);
    const logs = await ReminderLog.find({
      businessId: workspace.businessId,
      invoiceId: invoice.id,
    })
      .sort({ ruleKey: 1 })
      .lean();
    expect(logs).toHaveLength(3);
    expect(logs.map((item) => item.ruleKey).sort()).toEqual([
      "after_due_3",
      "before_due_3",
      "on_due",
    ]);
    const onDue = logs.find((item) => item.ruleKey === "on_due");
    expect(onDue.runAt.toISOString()).toContain("T03:30:00.000Z");

    const firstRun = await request(app)
      .post("/api/reminders/run-now")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(firstRun.status).toBe(200);
    expect(firstRun.body).toMatchObject({ acquired: true, processed: 1 });
    const secondRun = await request(app)
      .post("/api/reminders/run-now")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(secondRun.status).toBe(200);
    const serviceStatus = await request(app)
      .get("/api/reminders/status")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(serviceStatus.body.status.lastSuccessfulRunAt).toBeTruthy();
    expect(
      await ReminderLog.countDocuments({ _id: onDue._id, status: "completed" }),
    ).toBe(1);
    const notificationList = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(notificationList.status).toBe(200);
    expect(notificationList.body.notifications).toHaveLength(1);
    expect(notificationList.body.unread).toBe(1);
    const notificationId = notificationList.body.notifications[0].id;
    expect(
      (
        await request(app)
          .patch(`/api/notifications/${notificationId}/read`)
          .set("Authorization", `Bearer ${workspace.token}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/notifications")
          .set("Authorization", `Bearer ${workspace.token}`)
      ).body.unread,
    ).toBe(0);
  });

  it("requires a matching confirmation to disable, cancels existing rows permanently, and does not reopen them", async () => {
    const workspace = await createWorkspace();
    const futureDue = businessDate(
      new Date(Date.now() + 10 * 86400000),
      "Asia/Kolkata",
    );
    const invoice = await createFinalizedInvoice(workspace, futureDue);
    const initial = await ReminderLog.countDocuments({
      businessId: workspace.businessId,
      invoiceId: invoice.id,
      status: "pending",
    });
    expect(initial).toBe(3);

    const refusal = await request(app)
      .patch("/api/settings/reminders")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ enabled: false });
    expect(refusal.status).toBe(422);
    expect(refusal.body.error.code).toBe(
      "REMINDERS_DISABLE_CONFIRMATION_REQUIRED",
    );
    expect(refusal.body.error.details.pendingCount).toBe(3);

    const disabled = await request(app)
      .patch("/api/settings/reminders")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ enabled: false, confirmCancelPending: 3 });
    expect(disabled.status).toBe(200);
    expect(
      await ReminderLog.countDocuments({
        businessId: workspace.businessId,
        invoiceId: invoice.id,
        status: "cancelled",
        skipReason: "business_reminders_disabled",
      }),
    ).toBe(3);

    const reenabled = await request(app)
      .patch("/api/settings/reminders")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ enabled: true });
    expect(reenabled.status).toBe(200);
    expect(
      await ReminderLog.countDocuments({
        businessId: workspace.businessId,
        invoiceId: invoice.id,
      }),
    ).toBe(3);
    expect(
      await ReminderLog.countDocuments({
        businessId: workspace.businessId,
        invoiceId: invoice.id,
        status: "cancelled",
      }),
    ).toBe(3);
  });

  it("skips reminders after the invoice balance reaches zero", async () => {
    const workspace = await createWorkspace();
    const invoice = await createFinalizedInvoice(workspace);
    const payment = await request(app)
      .post(`/api/invoices/${invoice.id}/payments`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        idempotencyKey: "reminder-paid-invoice-01",
        amountMinor: 10000,
        paidAt: new Date().toISOString(),
        method: "cash",
      });
    expect(payment.status).toBe(201);
    expect(payment.body.invoice.status).toBe("paid");
    expect(
      await ReminderLog.countDocuments({
        businessId: workspace.businessId,
        invoiceId: invoice.id,
        status: "skipped",
        skipReason: "invoice_paid",
      }),
    ).toBe(2);
    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(notifications.body.notifications).toHaveLength(0);
  });

  it("scopes reminders and notifications to the current workspace and user", async () => {
    const first = await createWorkspace();
    const invoice = await createFinalizedInvoice(first);
    const run = await request(app)
      .post("/api/reminders/run-now")
      .set("Authorization", `Bearer ${first.token}`);
    expect(run.status).toBe(200);
    const second = await createWorkspace();
    const status = await request(app)
      .get("/api/reminders")
      .set("Authorization", `Bearer ${second.token}`);
    expect(status.status).toBe(200);
    expect(status.body.meta.total).toBe(0);
    const notifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${second.token}`);
    expect(notifications.body.notifications).toHaveLength(0);
    expect(
      await ReminderLog.countDocuments({
        businessId: first.businessId,
        invoiceId: invoice.id,
      }),
    ).toBe(3);
  }, 15000);
});
