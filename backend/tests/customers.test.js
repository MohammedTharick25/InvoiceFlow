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
import { ExpenseCategory } from "../src/modules/expenses/expense-category.model.js";
import { TaxRate } from "../src/modules/settings/tax-rate.model.js";
import { TaxRateHead } from "../src/modules/settings/tax-rate-head.model.js";
import { Subscription } from "../src/modules/billing/subscription.model.js";
import { ActivityLog } from "../src/modules/activity-logs/activity-log.model.js";
import { Customer } from "../src/modules/customers/customer.model.js";

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
  ActivityLog,
  Customer,
];
let replica;
let app;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("invoiceflow_customers"));
  await Promise.all(models.map((model) => model.init()));
  app = createApp({ env, auth: { passwordChecker: async () => false } });
});

beforeEach(async () => {
  await Promise.all(models.map((model) => model.collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replica?.stop();
});

async function createOwner(name) {
  const email = `${name.toLowerCase().replaceAll(" ", ".")}-${Math.random().toString(16).slice(2)}@example.test`;
  const password = "Correct Horse Battery 47!";
  const registration = await request(app)
    .post("/api/auth/register")
    .send({ email, password, name });
  expect(registration.status).toBe(202);
  const verification = await request(app)
    .post("/api/auth/verify-email")
    .send({ token: registration.body.developmentToken });
  expect(verification.status).toBe(200);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  expect(login.status).toBe(200);
  const onboarding = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${login.body.accessToken}`)
    .send({ name: `${name} business`, type: "individual" });
  expect(onboarding.status).toBe(201);
  return {
    token: onboarding.body.accessToken,
    businessId: onboarding.body.business.id,
    membershipId: onboarding.body.membership.id,
  };
}

const customerInput = (overrides = {}) => ({
  name: "Acme Supplies",
  email: "Accounts@Acme.test",
  phone: "+91 98765 43210",
  billingAddress: {
    line1: "12 Market Road",
    city: "Bengaluru",
    stateCode: "29",
    postalCode: "560001",
  },
  gstin: "29ABCDE1234F1Z5",
  ...overrides,
});

describe("Phase 4 customers", () => {
  it("creates, reads, updates, searches, paginates, and archives a customer", async () => {
    const owner = await createOwner("Owner");
    const created = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send(customerInput());

    expect(created.status).toBe(201);
    expect(created.body.customer).toMatchObject({
      name: "Acme Supplies",
      email: "accounts@acme.test",
      gstin: "29ABCDE1234F1Z5",
      reminderPrefs: { enabled: false },
    });
    expect(created.body.customer.businessId).toBeUndefined();
    const id = created.body.customer.id;

    const read = await request(app)
      .get(`/api/customers/${id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(read.status).toBe(200);
    expect(read.body.customer.id).toBe(id);

    const updated = await request(app)
      .patch(`/api/customers/${id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        name: "Acme Industrial",
        shippingAddress: customerInput().billingAddress,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.customer.name).toBe("Acme Industrial");
    expect(updated.body.customer.shippingAddress.city).toBe("Bengaluru");

    const clearedShipping = await request(app)
      .patch(`/api/customers/${id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ shippingAddress: null });
    expect(clearedShipping.status).toBe(200);
    expect(clearedShipping.body.customer.shippingAddress).toBeUndefined();

    const secondCustomer = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send(customerInput({ name: "Zulu Corporation", email: "", gstin: "" }));
    expect(secondCustomer.status).toBe(201);

    const found = await request(app)
      .get("/api/customers?search=Industrial&page=1&limit=10")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(found.status).toBe(200);
    expect(found.body.total).toBe(1);
    expect(found.body.customers[0].id).toBe(id);

    const pageTwo = await request(app)
      .get("/api/customers?page=2&limit=1")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(pageTwo.body.total).toBe(2);
    expect(pageTwo.body.customers).toHaveLength(1);
    expect(pageTwo.body.customers[0].name).toBe("Zulu Corporation");

    const archived = await request(app)
      .delete(`/api/customers/${id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(archived.status).toBe(200);
    expect(archived.body.customer.archivedAt).toBeTruthy();
    const hidden = await request(app)
      .get(`/api/customers/${id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(hidden.status).toBe(404);
  });

  it("rejects invalid GSTIN structure, GSTIN/state mismatch, and unknown states", async () => {
    const owner = await createOwner("Validator");
    const invalidGstin = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send(customerInput({ gstin: "not-a-gstin" }));
    expect(invalidGstin.status).toBe(422);
    expect(invalidGstin.body.error.code).toBe("VALIDATION_FAILED");

    const mismatch = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send(customerInput({ gstin: "27ABCDE1234F1Z5" }));
    expect(mismatch.status).toBe(422);

    const unknownState = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send(
        customerInput({
          gstin: "",
          billingAddress: {
            ...customerInput().billingAddress,
            stateCode: "99",
          },
        }),
      );
    expect(unknownState.status).toBe(422);
  });

  it("warns about customer matches without blocking create, and seeds starter contacts only once in an empty workspace", async () => {
    const owner = await createOwner("Tier two");
    const created = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send(customerInput());
    expect(created.status).toBe(201);
    const warning = await request(app)
      .post("/api/customers/check-duplicates")
      .set("Authorization", `Bearer ${owner.token}`)
      .send(customerInput({ name: "ACME SUPPLIES" }));
    expect(warning.status).toBe(200);
    expect(warning.body.duplicates[0].matches).toEqual(
      expect.arrayContaining(["email", "phone", "GSTIN", "name"]),
    );
    expect(
      (
        await request(app)
          .post("/api/customers/sample-data")
          .set("Authorization", `Bearer ${owner.token}`)
      ).status,
    ).toBe(409);

    const admin = await createOwner("Admin sample data");
    await BusinessMembership.updateOne(
      { businessId: admin.businessId },
      { $set: { role: "admin" } },
    );
    expect(
      (
        await request(app)
          .post("/api/customers/sample-data")
          .set("Authorization", `Bearer ${admin.token}`)
      ).status,
    ).toBe(403);

    const emptyOwner = await createOwner("Samples");
    const seeded = await request(app)
      .post("/api/customers/sample-data")
      .set("Authorization", `Bearer ${emptyOwner.token}`);
    expect(seeded.status).toBe(201);
    expect(seeded.body.added).toBe(2);
    expect(
      await ActivityLog.countDocuments({
        businessId: emptyOwner.businessId,
        action: "customer.sample_created",
      }),
    ).toBe(2);
    expect(
      seeded.body.customers.every((customer) =>
        customer.name.startsWith("Sample Customer -"),
      ),
    ).toBe(true);
    expect(
      (
        await request(app)
          .post("/api/customers/sample-data")
          .set("Authorization", `Bearer ${emptyOwner.token}`)
      ).status,
    ).toBe(409);
  });

  it("rejects updates that change the billing state away from the GSTIN prefix", async () => {
    const owner = await createOwner("State change");
    const created = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send(customerInput());
    const invalidUpdate = await request(app)
      .patch(`/api/customers/${created.body.customer.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        billingAddress: { ...customerInput().billingAddress, stateCode: "27" },
      });
    expect(invalidUpdate.status).toBe(422);
    expect(invalidUpdate.body.error.code).toBe("GSTIN_INVALID");
  });

  it("prevents cross-tenant reads, edits, and archives in both directions", async () => {
    const ownerA = await createOwner("Tenant A");
    const ownerB = await createOwner("Tenant B");
    const createdA = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${ownerA.token}`)
      .send(customerInput());
    const createdB = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${ownerB.token}`)
      .send(customerInput({ name: "Other customer", gstin: "" }));
    const idA = createdA.body.customer.id;
    const idB = createdB.body.customer.id;

    for (const [token, foreignId] of [
      [ownerA.token, idB],
      [ownerB.token, idA],
    ]) {
      expect(
        (
          await request(app)
            .get(`/api/customers/${foreignId}`)
            .set("Authorization", `Bearer ${token}`)
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .patch(`/api/customers/${foreignId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Injected" })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .delete(`/api/customers/${foreignId}`)
            .set("Authorization", `Bearer ${token}`)
        ).status,
      ).toBe(404);
    }

    const listA = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${ownerA.token}`);
    expect(listA.body.customers.map(({ id }) => id)).toEqual([idA]);
  });

  it("rejects businessId injection, unknown fields, and invalid customer IDs", async () => {
    const owner = await createOwner("Strict input");
    const injected = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ ...customerInput(), businessId: new mongoose.Types.ObjectId() });
    expect(injected.status).toBe(400);
    expect(injected.body.error.code).toBe("BUSINESS_ID_NOT_ALLOWED");

    const unknown = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ ...customerInput({ gstin: "" }), internal: true });
    expect(unknown.status).toBe(422);

    const badId = await request(app)
      .get("/api/customers/not-an-object-id")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(badId.status).toBe(404);
  });

  it("allows accountants to read but not modify customer records", async () => {
    const owner = await createOwner("Accountant");
    const created = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${owner.token}`)
      .send(customerInput());
    await BusinessMembership.updateOne(
      { _id: owner.membershipId },
      { $set: { role: "accountant" } },
    );

    const read = await request(app)
      .get(`/api/customers/${created.body.customer.id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(read.status).toBe(200);
    const write = await request(app)
      .patch(`/api/customers/${created.body.customer.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Blocked edit" });
    expect(write.status).toBe(403);
  });

  it("requires authentication for all customer endpoints", async () => {
    expect((await request(app).get("/api/customers")).status).toBe(401);
    expect(
      (await request(app).post("/api/customers").send(customerInput())).status,
    ).toBe(401);
  });
});
