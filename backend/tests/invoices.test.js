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
import { ReminderLog } from "../src/modules/reminders/reminder-log.model.js";
import {
  amountInWords,
  buildInvoicePdfModel,
  renderInvoicePdf,
} from "../src/modules/invoices/pdf.service.js";
import {
  createInvoiceStorageProvider,
  createLocalStorageProvider,
} from "../src/modules/invoices/storage.service.js";
import { businessDate } from "../src/utils/clock.js";
import { createInvoiceService } from "../src/modules/invoices/invoice.service.js";

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
  ReminderLog,
];
let replica;
let app;
let storageRoot;
let failStage = false;
let failBeforeFinalizeCommit = false;
let storage;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("invoiceflow_invoices"));
  await Promise.all(models.map((model) => model.init()));
  storageRoot = await mkdtemp(join(tmpdir(), "invoiceflow-invoices-"));
  const local = createLocalStorageProvider({ root: storageRoot });
  storage = {
    ...local,
    stage: async (input) => {
      if (failStage) throw new Error("simulated storage failure");
      return local.stage(input);
    },
    promote: local.promote.bind(local),
    read: local.read.bind(local),
    remove: local.remove.bind(local),
  };
  app = createApp({
    env,
    auth: { passwordChecker: async () => false },
    invoices: {
      storage,
      beforeFinalizeCommit: async () => {
        if (failBeforeFinalizeCommit)
          throw new Error("simulated transaction failure");
      },
    },
  });
});

beforeEach(async () => {
  failStage = false;
  failBeforeFinalizeCommit = false;
  await Promise.all(models.map((model) => model.collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replica?.stop();
  await rm(storageRoot, { recursive: true, force: true });
});

async function createWorkspace({ gstRegistered = false } = {}) {
  const email = `invoice-${Math.random().toString(16).slice(2)}@example.test`;
  const password = "Correct Horse Battery 47!";
  const registration = await request(app)
    .post("/api/auth/register")
    .send({ email, password, name: "Invoice Owner" });
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
      name: "Example Studio",
      type: "individual",
      address: {
        line1: "1 Main Road",
        city: "Bengaluru",
        stateCode: "29",
        country: "India",
      },
      tax: gstRegistered
        ? { gstRegistered: true, gstin: "29ABCDE1234F1Z5", stateCode: "29" }
        : {},
    });
  expect(onboarding.status).toBe(201);
  const customerResponse = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${onboarding.body.accessToken}`)
    .send({
      name: "Sample Customer",
      email: "customer@example.test",
      phone: "9876543210",
      billingAddress: {
        line1: "2 Market Road",
        city: "Bengaluru",
        stateCode: "29",
        postalCode: "560001",
      },
      ...(gstRegistered ? { gstin: "29ABCDE1234F1Z5" } : {}),
    });
  expect(customerResponse.status).toBe(201);
  return {
    token: onboarding.body.accessToken,
    userId: login.body.user.id,
    businessId: onboarding.body.business.id,
    customerId: customerResponse.body.customer.id,
  };
}

const draftBody = (customerId, overrides = {}) => ({
  customerId,
  issueDate: "2026-11-09",
  items: [
    {
      description: "Consulting service",
      unit: "hour",
      quantityMilli: 1000,
      unitPriceMinor: 10000,
      taxability: "non_gst",
    },
  ],
  ...overrides,
});

async function createDraft(workspace, body = draftBody(workspace.customerId)) {
  const response = await request(app)
    .post("/api/invoices")
    .set("Authorization", `Bearer ${workspace.token}`)
    .send(body);
  expect(response.status).toBe(201);
  return response.body.invoice;
}

describe("Phase 5 invoice lifecycle and PDFs", () => {
  it("keeps local storage as the default and defines the PDF download retention index", () => {
    expect(
      createInvoiceStorageProvider({ env: {}, root: storageRoot }).name,
    ).toBe("local");
    const downloadIndex = InvoiceDelivery.schema
      .indexes()
      .find(
        ([keys, options]) =>
          keys.recordedAt === 1 && options.expireAfterSeconds !== undefined,
      );
    expect(downloadIndex[1]).toMatchObject({
      expireAfterSeconds: 400 * 24 * 60 * 60,
      partialFilterExpression: { method: "pdf_download" },
    });
  });

  it("creates and pages tenant-scoped drafts, calculates totals, and renders a labelled draft PDF", async () => {
    const workspace = await createWorkspace();
    const invoice = await createDraft(workspace);
    expect(invoice.number).toBeNull();
    expect(invoice.status).toBe("draft");
    expect(invoice.totals.totalMinor).toBe(10000);
    expect(invoice.items[0].taxMinor).toBe(0);

    const list = await request(app)
      .get("/api/invoices?page=1&limit=10&sort=issueDate")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(list.status).toBe(200);
    expect(list.body.invoices.map((item) => item.id)).toContain(invoice.id);
    expect(list.body.meta).toMatchObject({
      page: 1,
      limit: 10,
      total: 1,
      pages: 1,
    });

    const pdf = await request(app)
      .get(`/api/invoices/${invoice.id}/pdf`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(
      await InvoiceDelivery.countDocuments({ method: "pdf_download" }),
    ).toBe(0);
  });

  it("finalizes atomically with snapshots, a gapless FY number, a usage increment, and an archived PDF", async () => {
    const workspace = await createWorkspace();
    const invoice = await createDraft(workspace);
    const finalized = await request(app)
      .post(`/api/invoices/${invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ idempotencyKey: "finalize-key-0001" });
    expect(finalized.status).toBe(200);
    expect(finalized.body.invoice).toMatchObject({
      number: "INV2627-000001",
      status: "issued",
      calcVersion: "gst-calc-v1",
    });
    expect(finalized.body.invoice.customerSnapshot.name).toBe(
      "Sample Customer",
    );
    expect(finalized.body.invoice.businessSnapshot.name).toBe("Example Studio");
    expect(finalized.body.invoice.pdfSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await UsageCounter.countDocuments({
        businessId: workspace.businessId,
        finalizedInvoices: 1,
      }),
    ).toBe(1);
    expect(
      (await Business.findById(workspace.businessId)).hasFinalizedRecords,
    ).toBe(true);

    const replay = await request(app)
      .post(`/api/invoices/${invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ idempotencyKey: "finalize-key-0001" });
    expect(replay.status).toBe(200);
    expect(replay.body.invoice.number).toBe("INV2627-000001");
    expect(
      await Counter.countDocuments({ businessId: workspace.businessId }),
    ).toBe(1);

    const downloaded = await request(app)
      .get(`/api/invoices/${invoice.id}/pdf`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(downloaded.status).toBe(200);
    expect(downloaded.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(
      await InvoiceDelivery.countDocuments({
        invoiceId: invoice.id,
        method: "pdf_download",
      }),
    ).toBe(1);
    const archived = await request(app)
      .post(`/api/invoices/${invoice.id}/archive`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(archived.status).toBe(200);
    expect(archived.body.invoice.archivedAt).toBeTruthy();
    const hidden = await request(app)
      .get(`/api/invoices/${invoice.id}`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(hidden.status).toBe(404);
  });

  it("allows only one concurrent finalize at the plan limit and allocates no number gap", async () => {
    const workspace = await createWorkspace();
    const subscription = await Subscription.findOne({
      businessId: workspace.businessId,
    });
    subscription.planKey = "basic";
    subscription.status = "active";
    subscription.currentPeriodEnd = new Date(Date.now() + 30 * 86400000);
    await subscription.save();
    const periodKey = businessDate(new Date(), "Asia/Kolkata").slice(0, 7);
    await UsageCounter.create({
      businessId: workspace.businessId,
      periodKey,
      finalizedInvoices: 29,
      updatedAt: new Date(),
    });
    const drafts = [];
    for (let index = 0; index < 20; index += 1) {
      drafts.push(
        await createDraft(
          workspace,
          draftBody(workspace.customerId, {
            notes: `Concurrent invoice ${index}`,
          }),
        ),
      );
    }
    const results = await Promise.all(
      drafts.map((draft, index) =>
        request(app)
          .post(`/api/invoices/${draft.id}/finalize`)
          .set("Authorization", `Bearer ${workspace.token}`)
          .send({
            idempotencyKey: `limit-finalize-${String(index).padStart(4, "0")}`,
          }),
      ),
    );
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(
      results.filter(
        (result) => result.body.error?.code === "PLAN_LIMIT_REACHED",
      ),
    ).toHaveLength(19);
    const usage = await UsageCounter.findOne({
      businessId: workspace.businessId,
      periodKey,
    });
    expect(usage.finalizedInvoices).toBe(30);
    expect(
      await Invoice.countDocuments({
        businessId: workspace.businessId,
        status: "issued",
      }),
    ).toBe(1);
    const counter = await Counter.findOne({ businessId: workspace.businessId });
    expect(counter.seq).toBe(1);
  });

  it("rolls back the invoice number, usage and stored-file record when PDF staging fails", async () => {
    const workspace = await createWorkspace();
    const invoice = await createDraft(workspace);
    failStage = true;
    const result = await request(app)
      .post(`/api/invoices/${invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ idempotencyKey: "finalize-fail-key-01" });
    expect(result.status).toBe(500);
    expect((await Invoice.findById(invoice.id)).status).toBe("draft");
    expect(
      await Counter.countDocuments({ businessId: workspace.businessId }),
    ).toBe(0);
    expect(
      await UsageCounter.countDocuments({ businessId: workspace.businessId }),
    ).toBe(0);
    expect(
      await StoredFile.countDocuments({ businessId: workspace.businessId }),
    ).toBe(0);
  });

  it("rolls back finalization side effects after an injected pre-commit failure", async () => {
    const workspace = await createWorkspace();
    const invoice = await createDraft(workspace);
    failBeforeFinalizeCommit = true;
    const result = await request(app)
      .post(`/api/invoices/${invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ idempotencyKey: "finalize-rollback-key" });
    expect(result.status).toBe(500);
    expect((await Invoice.findById(invoice.id)).status).toBe("draft");
    expect(
      await Counter.countDocuments({ businessId: workspace.businessId }),
    ).toBe(0);
    expect(
      await UsageCounter.countDocuments({ businessId: workspace.businessId }),
    ).toBe(0);
    expect(
      await StoredFile.countDocuments({ businessId: workspace.businessId }),
    ).toBe(0);
  });

  it("calculates registered intra-state GST and requires explicit place and reverse-charge confirmations", async () => {
    const workspace = await createWorkspace({ gstRegistered: true });
    const invoice = await createDraft(
      workspace,
      draftBody(workspace.customerId, {
        placeOfSupply: { stateCode: "29", basis: "customer_billing" },
        items: [
          {
            description: "Consulting service",
            quantityMilli: 1000,
            unitPriceMinor: 10000,
            taxability: "taxable",
            taxCode: "GST18",
          },
        ],
      }),
    );
    expect(invoice.supplyType).toBe("intra");
    expect(invoice.totals).toMatchObject({
      cgstMinor: 900,
      sgstMinor: 900,
      totalMinor: 11800,
    });
    const noReverseAnswer = await request(app)
      .post(`/api/invoices/${invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        idempotencyKey: "gst-confirm-key-0001",
        confirmPlaceOfSupply: true,
      });
    expect(noReverseAnswer.body.error.code).toBe(
      "REVERSE_CHARGE_CONFIRMATION_REQUIRED",
    );
    const issued = await request(app)
      .post(`/api/invoices/${invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        idempotencyKey: "gst-confirm-key-0002",
        confirmPlaceOfSupply: true,
        reverseCharge: "not_applicable",
      });
    expect(issued.status).toBe(200);
    expect(issued.body.invoice.reverseCharge).toMatchObject({
      status: "not_applicable",
      confirmedBy: workspace.userId,
    });
    expect(issued.body.invoice.templateType).toBe("tax_invoice");
  });

  it("requires draft rate review after an effective-dated rate version changes", async () => {
    const workspace = await createWorkspace({ gstRegistered: true });
    const invoice = await createDraft(
      workspace,
      draftBody(workspace.customerId, {
        placeOfSupply: { stateCode: "29", basis: "customer_billing" },
        items: [
          {
            description: "Consulting service",
            quantityMilli: 1000,
            unitPriceMinor: 10000,
            taxability: "taxable",
            taxCode: "GST18",
          },
        ],
      }),
    );
    const version = await request(app)
      .post("/api/settings/tax-rates")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        code: "GST18",
        name: "GST 18% revised",
        kind: "rate",
        rateBp: 1900,
        effectiveFrom: "2026-11-01",
      });
    expect(version.status).toBe(201);
    const result = await request(app)
      .post(`/api/invoices/${invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        idempotencyKey: "rate-review-key-001",
        confirmPlaceOfSupply: true,
        reverseCharge: "not_applicable",
      });
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe("TAX_RATE_CHANGED_REVIEW_REQUIRED");
    expect((await Invoice.findById(invoice.id)).status).toBe("draft");
  });

  it("keeps a finalized invoice calculation unchanged after a later rate version is appended", async () => {
    const workspace = await createWorkspace({ gstRegistered: true });
    const draft = await createDraft(
      workspace,
      draftBody(workspace.customerId, {
        placeOfSupply: { stateCode: "29", basis: "customer_billing" },
        items: [
          {
            description: "Archived consulting service",
            quantityMilli: 1000,
            unitPriceMinor: 10000,
            taxability: "taxable",
            taxCode: "GST18",
          },
        ],
      }),
    );
    const auth = { Authorization: `Bearer ${workspace.token}` };
    const finalized = await request(app)
      .post(`/api/invoices/${draft.id}/finalize`)
      .set(auth)
      .send({
        idempotencyKey: "old-rate-snapshot-001",
        confirmPlaceOfSupply: true,
        reverseCharge: "not_applicable",
      });
    expect(finalized.status).toBe(200);
    const before = await Invoice.findById(draft.id).lean();
    expect(before.items[0].rateBp).toBe(1800);
    const beforeSnapshot = {
      totals: before.totals,
      item: before.items[0],
      calcVersion: before.calcVersion,
    };

    const version = await request(app)
      .post("/api/settings/tax-rates")
      .set(auth)
      .send({
        code: "GST18",
        name: "GST 18% revised for future invoices",
        kind: "rate",
        rateBp: 1900,
        effectiveFrom: "2098-01-01",
      });
    expect(version.status).toBe(201);

    const after = await Invoice.findById(draft.id).lean();
    expect({
      totals: after.totals,
      item: after.items[0],
      calcVersion: after.calcVersion,
    }).toEqual(beforeSnapshot);
  });

  it("serializes concurrent tax-rate versions through the TaxRateHead", async () => {
    const workspace = await createWorkspace({ gstRegistered: true });
    const requests = ["Concurrent A", "Concurrent B"].map((name) =>
      request(app)
        .post("/api/settings/tax-rates")
        .set("Authorization", `Bearer ${workspace.token}`)
        .send({
          code: "GST18",
          name,
          kind: "rate",
          rateBp: 1800,
          effectiveFrom: "2027-04-01",
        }),
    );
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const head = await TaxRateHead.findOne({
      businessId: workspace.businessId,
      code: "GST18",
    });
    expect(head.versionCount).toBe(2);
    expect(
      await TaxRate.countDocuments({
        businessId: workspace.businessId,
        code: "GST18",
      }),
    ).toBe(2);
  });

  it("enforces required HSN policy and supports clear-amounts and draft deletion", async () => {
    const workspace = await createWorkspace({ gstRegistered: true });
    const policy = await request(app)
      .patch("/api/settings/hsn-policy")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ declaredTurnoverBand: "declared_band_3", confirmed: true });
    expect(policy.status).toBe(200);
    const missingHsnDraft = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${workspace.token}`)
      .send(
        draftBody(workspace.customerId, {
          placeOfSupply: { stateCode: "29", basis: "customer_billing" },
          items: [
            {
              description: "Consulting service",
              quantityMilli: 1000,
              unitPriceMinor: 10000,
              taxability: "taxable",
              taxCode: "GST18",
            },
          ],
        }),
      );
    expect(missingHsnDraft.status).toBe(201);
    const issued = await request(app)
      .post(`/api/invoices/${missingHsnDraft.body.invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        idempotencyKey: "hsn-policy-finalize-001",
        confirmPlaceOfSupply: true,
        reverseCharge: "not_applicable",
      });
    expect(issued.status).toBe(200);
    expect(issued.body.warnings).toContainEqual(
      expect.objectContaining({ reason: "missing", minDigits: 4 }),
    );

    const invoice = await createDraft(workspace);
    const cleared = await request(app)
      .post(`/api/invoices/${invoice.id}/clear-amounts`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ confirmation: "CLEAR_AMOUNTS" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.invoice.totals.totalMinor).toBe(0);

    const removed = await request(app)
      .delete(`/api/invoices/${invoice.id}`)
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(removed.status).toBe(200);
    expect(await Invoice.exists({ _id: invoice.id })).toBeNull();
    const invalidId = await request(app)
      .get("/api/invoices/not-an-object-id")
      .set("Authorization", `Bearer ${workspace.token}`);
    expect(invalidId.status).toBe(404);
  });

  it("records Mark as sent and enforces safe Unmark sent with audit history", async () => {
    const workspace = await createWorkspace();
    const invoice = await createDraft(workspace);
    const finalized = await request(app)
      .post(`/api/invoices/${invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ idempotencyKey: "deliver-finalize-0001" });
    expect(finalized.status).toBe(200);
    const marked = await request(app)
      .post(`/api/invoices/${invoice.id}/mark-sent`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        idempotencyKey: "mark-sent-key-0001",
        via: "whatsapp",
        declaredAt: "2026-11-09T10:00:00.000Z",
        note: "Shared with the customer",
      });
    expect(marked.status).toBe(200);
    expect(marked.body.invoice).toMatchObject({
      status: "sent",
      sentVia: "whatsapp",
      sentBasis: "user_declared",
    });
    const unmarked = await request(app)
      .post(`/api/invoices/${invoice.id}/unmark-sent`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        idempotencyKey: "unmark-sent-key-0001",
        note: "Selected the wrong customer chat",
      });
    expect(unmarked.status).toBe(200);
    expect(unmarked.body.invoice.status).toBe("issued");
    expect(unmarked.body.invoice.sentAt).toBeNull();
    expect(unmarked.body.invoice.deliveryFenceSeq).toBe(1);
    expect(
      await InvoiceDelivery.countDocuments({
        invoiceId: invoice.id,
        method: "unmark_sent",
      }),
    ).toBe(1);
    expect(
      await ActivityLog.countDocuments({
        businessId: workspace.businessId,
        action: "invoice.unmarked_sent",
      }),
    ).toBe(1);
  });

  it("uses the delivery fence to block Unmark while email is in flight and after acceptance", async () => {
    const workspace = await createWorkspace();
    const invoice = await createDraft(workspace);
    const finalized = await request(app)
      .post(`/api/invoices/${invoice.id}/finalize`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({ idempotencyKey: "email-fence-finalize-1" });
    expect(finalized.status).toBe(200);
    const service = createInvoiceService({ storage });
    const started = await service.beginEmailDelivery({
      businessId: workspace.businessId,
      invoiceId: invoice.id,
      userId: workspace.userId,
      input: { idempotencyKey: "email-fence-begin-001", manual: true },
    });
    expect(started.fenceSeq).toBe(1);
    const blocked = await request(app)
      .post(`/api/invoices/${invoice.id}/unmark-sent`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        idempotencyKey: "email-fence-unmark-001",
        note: "Correcting a mistake",
      });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.details).toMatchObject({
      reason: "email_in_flight",
      retryable: true,
    });

    await service.completeEmailDelivery({
      businessId: workspace.businessId,
      invoiceId: invoice.id,
      deliveryId: started.deliveryId,
      leaseToken: started.leaseToken,
      status: "accepted",
      userId: workspace.userId,
    });
    const afterAccept = await request(app)
      .post(`/api/invoices/${invoice.id}/unmark-sent`)
      .set("Authorization", `Bearer ${workspace.token}`)
      .send({
        idempotencyKey: "email-fence-unmark-002",
        note: "Correcting a mistake",
      });
    expect(afterAccept.status).toBe(422);
    expect(afterAccept.body.error.details.reason).toBe("sent_by_email");
  });

  it("isolates invoice reads and denies an authenticated user in another tenant", async () => {
    const ownerA = await createWorkspace();
    const invoice = await createDraft(ownerA);
    const ownerB = await createWorkspace();
    const result = await request(app)
      .get(`/api/invoices/${invoice.id}`)
      .set("Authorization", `Bearer ${ownerB.token}`);
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });
});

describe("invoice PDF model", () => {
  it("covers the required invoice particulars and Indian amount words from snapshots", async () => {
    const sample = {
      status: "issued",
      number: "INV2627-000001",
      issueDate: new Date("2026-11-09T00:00:00.000Z"),
      dueDate: new Date("2026-12-09T00:00:00.000Z"),
      currency: "INR",
      placeOfSupply: { stateCode: "29" },
      stateTaxLabel: "SGST",
      supplyType: "intra",
      totals: {
        subtotalMinor: 10000,
        taxableMinor: 10000,
        cgstMinor: 900,
        sgstMinor: 900,
        taxMinor: 1800,
        totalMinor: 11800,
      },
      taxSummary: [
        {
          taxCode: "GST18",
          rateBp: 1800,
          taxableMinor: 10000,
          cgstMinor: 900,
          sgstMinor: 900,
          igstMinor: 0,
        },
      ],
      items: [
        {
          description: "Consulting service",
          hsnSac: "998314",
          quantityMilli: 1000,
          unit: "hour",
          unitPriceMinor: 10000,
          discountMinor: 0,
          invoiceDiscountMinor: 0,
          taxableMinor: 10000,
          taxability: "taxable",
          rateBp: 1800,
          cgstMinor: 900,
          sgstMinor: 900,
          igstMinor: 0,
          taxMinor: 1800,
          lineTotalMinor: 11800,
        },
      ],
      charges: [],
      customerSnapshot: {
        name: "Sample Customer",
        email: "customer@example.test",
        phone: "9876543210",
        gstin: "",
        billingAddress: {
          line1: "2 Market Road",
          city: "Bengaluru",
          stateCode: "29",
          postalCode: "560001",
          country: "India",
        },
      },
      businessSnapshot: {
        name: "Example Studio",
        address: {
          line1: "1 Main Road",
          city: "Bengaluru",
          stateCode: "29",
          country: "India",
        },
        tax: { gstRegistered: true, gstin: "29ABCDE1234F1Z5" },
        settings: {
          invoice: { signatoryName: "Owner", declarations: ["Terms apply"] },
          payment: { upiId: "owner@example" },
        },
      },
      reverseCharge: { status: "not_applicable" },
      terms: "Pay within 30 days",
      notes: "Thank you",
      issuedAt: new Date("2026-11-09T00:00:00.000Z"),
    };
    const model = buildInvoicePdfModel(sample);
    expect(model).toMatchObject({
      title: "Tax Invoice",
      number: "INV2627-000001",
      placeOfSupply: "Karnataka (29)",
      reverseCharge: "Tax payable on reverse charge: No",
    });
    expect(model.items[0]).toMatchObject({
      description: "Consulting service",
      hsnSac: "998314",
      quantityMilli: 1000,
      rateBp: 1800,
    });
    expect(model.amountWords).toBe("one hundred eighteen rupees only");
    expect(model.disclaimer).toContain("does not file GST returns");
    const rendered = await renderInvoicePdf(sample);
    expect(rendered.model.title).toBe("Tax Invoice");
    expect(rendered.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(rendered.buffer.length).toBeGreaterThan(1000);
  });

  it("labels drafts and does not allocate a number", () => {
    const model = buildInvoicePdfModel({
      status: "draft",
      currency: "INR",
      totals: { totalMinor: 0 },
      items: [],
      charges: [],
    });
    expect(model).toMatchObject({
      title: "Invoice",
      draft: true,
      number: null,
      amountWords: "zero rupees only",
    });
    expect(amountInWords(123456, "INR")).toBe(
      "one thousand two hundred thirty four rupees and fifty six paise only",
    );
  });
});
