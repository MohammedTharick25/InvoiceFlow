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
import { Invoice } from "../src/modules/invoices/invoice.model.js";
import { permissionMatrix } from "../src/middlewares/authorize.js";
import { createAccessToken } from "../src/modules/auth/auth.service.js";
import { safeParseEnv } from "../src/config/env.js";

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
  Invoice,
];
let replica;
let app;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("invoiceflow_phase2"));
  await Promise.all(models.map((model) => model.init()));
  app = createApp({ env, auth: { passwordChecker: async () => false } });
});

beforeEach(async () => {
  await Promise.all(models.map((model) => model.collection.deleteMany({})));
  await Invoice.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await replica?.stop();
});

async function createVerifiedAccount(name = "Owner") {
  const email = `${name.toLowerCase().replaceAll(" ", ".")}-${Math.random().toString(16).slice(2)}@example.test`;
  const password = "Correct Horse Battery 47!";
  const registration = await request(app)
    .post("/api/auth/register")
    .send({ email, password, name });
  expect(registration.status).toBe(202);
  expect(registration.body.developmentToken).toBeTruthy();
  const verification = await request(app)
    .post("/api/auth/verify-email")
    .send({ token: registration.body.developmentToken });
  expect(verification.status).toBe(200);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  expect(login.status).toBe(200);
  return {
    email,
    password,
    accessToken: login.body.accessToken,
    cookie: login.headers["set-cookie"][0].split(";")[0],
  };
}

async function onboard(token, overrides = {}, targetApp = app) {
  return request(targetApp)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Example business", type: "individual", ...overrides });
}

describe("Phase 2 auth and onboarding", () => {
  it("checks breached passwords with only a SHA-1 prefix sent to the range endpoint", async () => {
    let calledUrl;
    let headers;
    const { isBreachedPassword } =
      await import("../src/modules/auth/password-security.js");
    const breached = await isBreachedPassword(
      "password",
      async (url, options) => {
        calledUrl = url;
        headers = options.headers;
        return {
          ok: true,
          text: async () => "1E4C9B93F3F0682250B6CF8331B7EE68FD8:10\r\n",
        };
      },
    );
    expect(breached).toBe(true);
    expect(calledUrl).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(headers["Add-Padding"]).toBe("true");
    expect(calledUrl).not.toContain("1E4C9B93F3F0682250B6CF8331B7EE68FD8");
  });

  it("fails closed if the breached-password range service is unavailable", async () => {
    const { isBreachedPassword } =
      await import("../src/modules/auth/password-security.js");
    await expect(
      isBreachedPassword("long enough example", async () => ({
        ok: false,
        status: 503,
      })),
    ).rejects.toMatchObject({ status: 503, code: "BREACH_CHECK_UNAVAILABLE" });
  });

  it("requires real email delivery and non-example JWT secrets in production", () => {
    const productionEnv = {
      ...env,
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://db.example.test/invoiceflow?replicaSet=rs0",
      JWT_ACCESS_SECRET: "c".repeat(40),
      JWT_REFRESH_SECRET: "d".repeat(40),
      EMAIL_URL: "",
    };
    const incomplete = safeParseEnv(productionEnv);
    expect(incomplete.success).toBe(false);
    expect(incomplete.error.issues.map((issue) => issue.path[0])).toContain(
      "EMAIL_URL",
    );
    const configured = safeParseEnv({
      ...productionEnv,
      EMAIL_URL: "smtp://mailer:secret@smtp.example.test:587",
      DEFAULT_FROM_EMAIL: "invoices@example.test",
    });
    expect(configured.success).toBe(true);
  });

  it("registers with a hashed one-time token and verifies exactly once", async () => {
    const email = "owner@example.test";
    const password = "Unbreached long password 45!";
    const response = await request(app)
      .post("/api/auth/register")
      .send({ email, name: "Owner", password });
    expect(response.status).toBe(202);
    const user = await User.findOne({ email });
    const token = await AuthToken.findOne({
      userId: user._id,
      type: "verify_email",
    });
    expect(user.passwordHash).toBeUndefined();
    expect(token.tokenHash).not.toBe(response.body.developmentToken);
    expect(token.targetEmail).toBe(email);
    expect(
      (
        await request(app)
          .post("/api/auth/verify-email")
          .send({ token: response.body.developmentToken })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/auth/verify-email")
          .send({ token: response.body.developmentToken })
      ).status,
    ).toBe(400);
  });

  it("rejects unknown, unverified, incorrect, and locked accounts with the same credential error", async () => {
    const account = await createVerifiedAccount("Locked owner");
    const first = await request(app)
      .post("/api/auth/login")
      .send({ email: "missing@example.test", password: account.password });
    expect(first.status).toBe(401);
    expect(first.body.error.code).toBe("INVALID_CREDENTIALS");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request(app)
        .post("/api/auth/login")
        .send({ email: account.email, password: "incorrect password" });
      expect(failed.status).toBe(401);
      expect(failed.body.error.code).toBe("INVALID_CREDENTIALS");
    }
    const locked = await request(app)
      .post("/api/auth/login")
      .send({ email: account.email, password: account.password });
    expect(locked.status).toBe(401);
    expect(
      await User.exists({
        email: account.email,
        lockUntil: { $gt: new Date() },
      }),
    ).toBeTruthy();
  });

  it("increments failed-login counters atomically under parallel attempts", async () => {
    const account = await createVerifiedAccount("Concurrent lock owner");
    await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app)
          .post("/api/auth/login")
          .send({ email: account.email, password: "incorrect password" }),
      ),
    );
    const user = await User.findOne({ email: account.email });
    expect(user.lockUntil).toBeInstanceOf(Date);
    expect(user.lockUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it("rotates refresh tokens and revokes the family when an old token is reused", async () => {
    const account = await createVerifiedAccount("Refresh owner");
    const oldCookie = account.cookie;
    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", oldCookie);
    expect(refreshed.status).toBe(200);
    const nextCookie = refreshed.headers["set-cookie"][0].split(";")[0];
    expect(nextCookie).not.toBe(oldCookie);
    const reuse = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", oldCookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("REFRESH_TOKEN_REUSE_DETECTED");
    const revokedAccess = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`);
    expect(revokedAccess.status).toBe(401);
    expect(
      await RefreshToken.countDocuments({ revokedAt: { $ne: null } }),
    ).toBe(2);
  });

  it("keeps forgot-password responses generic and consumes reset tokens once", async () => {
    const account = await createVerifiedAccount("Reset owner");
    const missing = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "not-found@example.test" });
    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: account.email });
    expect(missing.body.message).toBe(known.body.message);
    expect(known.body.developmentToken).toBeTruthy();
    const reset = await request(app).post("/api/auth/reset-password").send({
      token: known.body.developmentToken,
      password: "A completely new password 92!",
    });
    expect(reset.status).toBe(200);
    expect(
      (
        await request(app).post("/api/auth/reset-password").send({
          token: known.body.developmentToken,
          password: "Another different password 55!",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app).post("/api/auth/login").send({
          email: account.email,
          password: "A completely new password 92!",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${account.accessToken}`)
      ).status,
    ).toBe(401);
  });

  it("supports profile updates, email re-verification, session listing, and sign-out everywhere", async () => {
    const account = await createVerifiedAccount("Profile owner");
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ email: account.email, password: account.password });
    const accessToken = login.body.accessToken;
    expect(
      (
        await agent
          .put("/api/auth/me")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ name: "New name", phone: "123", theme: "dark" })
      ).status,
    ).toBe(200);
    const change = await agent
      .put("/api/auth/me/email")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ email: "new-owner@example.test", password: account.password });
    expect(change.status).toBe(200);
    const verify = await agent
      .post("/api/auth/verify-email")
      .send({ token: change.body.developmentToken });
    expect(verify.status).toBe(200);
    expect(
      await User.exists({
        email: "new-owner@example.test",
        emailVerifiedAt: { $ne: null },
        pendingEmail: null,
      }),
    ).toBeTruthy();
    expect(
      (
        await agent
          .get("/api/auth/sessions")
          .set("Authorization", `Bearer ${accessToken}`)
      ).status,
    ).toBe(401);
    const newLogin = await agent
      .post("/api/auth/login")
      .send({ email: "new-owner@example.test", password: account.password });
    expect(newLogin.status).toBe(200);
    const sessions = await agent
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${newLogin.body.accessToken}`);
    expect(sessions.body.sessions.length).toBeGreaterThan(0);
    expect(sessions.body.sessions.some((session) => session.current)).toBe(
      true,
    );
    expect(
      (
        await agent
          .post("/api/auth/logout-all")
          .set("Authorization", `Bearer ${newLogin.body.accessToken}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${newLogin.body.accessToken}`)
      ).status,
    ).toBe(401);
  });

  it("creates all onboarding records atomically with INR defaults, reference rates, and a 14-day trial", async () => {
    const account = await createVerifiedAccount("Onboard owner");
    const before = new Date();
    const result = await onboard(account.accessToken, {
      tax: { gstRegistered: false },
    });
    expect(result.status).toBe(201);
    expect(result.body.business.currency).toBe("INR");
    expect(result.body.business.currencyVersion).toBe(1);
    expect(result.body.membership.role).toBe("owner");
    expect(result.body.subscription.planKey).toBe("king");
    expect(result.body.subscription.status).toBe("trialing");
    expect(
      Date.parse(result.body.subscription.trialEndsAt) -
        Date.parse(result.body.subscription.trialStartedAt),
    ).toBe(14 * 24 * 60 * 60 * 1000);
    expect(
      Date.parse(result.body.subscription.trialStartedAt),
    ).toBeGreaterThanOrEqual(before.getTime() - 1000);
    const secondBusinessAttempt = await onboard(account.accessToken, {
      tax: { gstRegistered: false },
    });
    expect(secondBusinessAttempt.status).toBe(409);
    expect(
      await Subscription.countDocuments({
        businessId: result.body.business.id,
      }),
    ).toBe(1);
    expect(
      (await User.findOne({ email: account.email })).trialUsedAt,
    ).toBeInstanceOf(Date);
    expect(
      await BusinessSettings.countDocuments({
        businessId: result.body.business.id,
        "reminders.enabled": true,
        "reminders.enabledSince": { $ne: null },
      }),
    ).toBe(1);
    expect(
      await TaxRate.countDocuments({ businessId: result.body.business.id }),
    ).toBe(3);
    expect(
      await TaxRateHead.countDocuments({ businessId: result.body.business.id }),
    ).toBe(3);
    expect(
      await ExpenseCategory.countDocuments({
        businessId: result.body.business.id,
      }),
    ).toBe(4);
    expect(
      await Subscription.countDocuments({
        businessId: result.body.business.id,
      }),
    ).toBe(1);
    expect(result.body.accessToken).toBeTruthy();
    expect(
      (
        await request(app)
          .get("/api/businesses/current")
          .set("Authorization", `Bearer ${result.body.accessToken}`)
      ).status,
    ).toBe(200);
  });

  it("rolls back every onboarding write after a forced failure before commit", async () => {
    const account = await createVerifiedAccount("Rollback owner");
    const failingApp = createApp({
      env,
      auth: { passwordChecker: async () => false },
      onboarding: {
        beforeOnboardingCommit: async () => {
          throw new Error("forced failure");
        },
      },
    });
    const failed = await onboard(account.accessToken, {}, failingApp);
    expect(failed.status).toBe(500);
    expect(await Business.countDocuments({})).toBe(0);
    expect(await BusinessSettings.countDocuments({})).toBe(0);
    expect(await BusinessMembership.countDocuments({})).toBe(0);
    expect(await TaxRate.countDocuments({})).toBe(0);
    expect(await Subscription.countDocuments({})).toBe(0);
    expect(
      (await User.findOne({ email: account.email })).trialUsedAt,
    ).toBeNull();
  });

  it("allows only one winner across parallel onboarding requests and leaves no orphans", async () => {
    const account = await createVerifiedAccount("Racing owner");
    const results = await Promise.all(
      Array.from({ length: 20 }, () => onboard(account.accessToken)),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(
      results
        .filter((result) => result.status === 409)
        .every(
          (result) => result.body.error.code === "USER_ALREADY_HAS_BUSINESS",
        ),
    ).toBe(true);
    const [business] = await Business.find({});
    expect(
      await BusinessMembership.countDocuments({
        userId: (await User.findOne({ email: account.email }))._id,
        status: "active",
      }),
    ).toBe(1);
    expect(
      await BusinessSettings.countDocuments({ businessId: business._id }),
    ).toBe(1);
    expect(
      await Subscription.countDocuments({ businessId: business._id }),
    ).toBe(1);
    expect(await TaxRate.countDocuments({ businessId: business._id })).toBe(3);
  });

  it("supports the approved slot-two schema configuration and frees a disabled slot", async () => {
    const account = await createVerifiedAccount("Slot owner");
    const first = await onboard(account.accessToken);
    const user = await User.findOne({ email: account.email });
    const second = await Business.create({
      name: "Second test workspace",
      type: "individual",
      currency: "INR",
      currencyVersion: 1,
      hasFinalizedRecords: false,
      onboardingCompletedAt: new Date(),
      createdBy: user._id,
    });
    const slotTwo = await BusinessMembership.create({
      userId: user._id,
      businessId: second._id,
      role: "owner",
      slot: 2,
    });
    expect(slotTwo.slot).toBe(2);
    await expect(
      BusinessMembership.create({
        userId: user._id,
        businessId: first.body.business.id,
        role: "owner",
        slot: 2,
      }),
    ).rejects.toMatchObject({ code: 11000 });
    slotTwo.status = "disabled";
    await slotTwo.save();
    const third = await Business.create({
      name: "Third test workspace",
      type: "individual",
      currency: "INR",
      currencyVersion: 1,
      hasFinalizedRecords: false,
      onboardingCompletedAt: new Date(),
      createdBy: user._id,
    });
    const freed = await BusinessMembership.create({
      userId: user._id,
      businessId: third._id,
      role: "owner",
      slot: 2,
    });
    expect(freed.slot).toBe(2);
  });

  it("enforces currency review, updates amount-free drafts, and locks after finalized records", async () => {
    const account = await createVerifiedAccount("Currency owner");
    const created = await onboard(account.accessToken);
    const token = created.body.accessToken;
    const businessId = created.body.business.id;
    const user = await User.findOne({ email: account.email });
    const priced = await Invoice.create({
      businessId,
      customerId: new mongoose.Types.ObjectId(),
      status: "draft",
      issueDate: new Date("2026-11-09T00:00:00.000Z"),
      currency: "INR",
      currencyVersion: 1,
      createdBy: user._id,
      archivedAt: new Date(),
      items: [
        {
          description: "Test amount",
          quantityMilli: 1000,
          unitPriceMinor: 1,
          taxability: "non_gst",
        },
      ],
      charges: [],
    });
    const blocked = await request(app)
      .patch("/api/businesses/current/currency")
      .set("Authorization", `Bearer ${token}`)
      .send({ currency: "USD" });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("DRAFTS_REQUIRE_REVIEW");
    expect(blocked.body.error.details.draftIds).toContain(
      priced._id.toString(),
    );
    expect((await Business.findById(businessId)).currency).toBe("INR");
    await Invoice.deleteOne({ _id: priced._id });
    const amountFree = await Invoice.create({
      businessId,
      customerId: new mongoose.Types.ObjectId(),
      status: "draft",
      issueDate: new Date("2026-11-09T00:00:00.000Z"),
      currency: "INR",
      currencyVersion: 1,
      createdBy: user._id,
      items: [],
      charges: [],
    });
    const changed = await request(app)
      .patch("/api/businesses/current/currency")
      .set("Authorization", `Bearer ${token}`)
      .send({ currency: "JPY" });
    expect(changed.status).toBe(200);
    expect(changed.body.business.currency).toBe("JPY");
    expect(changed.body.business.currencyVersion).toBe(2);
    expect((await Invoice.findById(amountFree._id)).currency).toBe("JPY");
    expect(
      await ActivityLog.countDocuments({
        businessId,
        action: "business.currency_changed",
      }),
    ).toBe(1);
    await Business.updateOne(
      { _id: businessId },
      { $set: { hasFinalizedRecords: true, currencyLockedAt: new Date() } },
    );
    const locked = await request(app)
      .patch("/api/businesses/current/currency")
      .set("Authorization", `Bearer ${token}`)
      .send({ currency: "INR" });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("CURRENCY_LOCKED");
  });

  it("binds current-business context to the signed membership and rejects body tenant selection", async () => {
    const ownerA = await createVerifiedAccount("Tenant A");
    const ownerB = await createVerifiedAccount("Tenant B");
    const businessA = await onboard(ownerA.accessToken, { name: "Business A" });
    const businessB = await onboard(ownerB.accessToken, { name: "Business B" });
    const currentA = await request(app)
      .get("/api/businesses/current")
      .set("Authorization", `Bearer ${businessA.body.accessToken}`);
    const currentB = await request(app)
      .get("/api/businesses/current")
      .set("Authorization", `Bearer ${businessB.body.accessToken}`);
    expect(currentA.body.business.name).toBe("Business A");
    expect(currentB.body.business.name).toBe("Business B");
    const memberB = await BusinessMembership.findOne({
      businessId: businessB.body.business.id,
    });
    const userA = await User.findOne({ email: ownerA.email });
    const sessionA = await RefreshToken.findOne({
      userId: userA._id,
      revokedAt: null,
    });
    const forgedToken = createAccessToken(userA, memberB, sessionA._id, env);
    const forged = await request(app)
      .get("/api/businesses/current")
      .set("Authorization", `Bearer ${forgedToken}`);
    expect(forged.status).toBe(404);
    const injected = await request(app)
      .patch("/api/businesses/current/currency")
      .set("Authorization", `Bearer ${businessA.body.accessToken}`)
      .send({ currency: "USD", businessId: businessB.body.business.id });
    expect(injected.status).toBe(400);
    expect((await Business.findById(businessA.body.business.id)).currency).toBe(
      "INR",
    );
  });

  it("enforces the documented owner-first permission matrix", () => {
    const permissions = permissionMatrix();
    expect(permissions.currency).toEqual(["owner"]);
    expect(permissions.payment_write).toEqual(["owner", "admin", "accountant"]);
    expect(permissions.reports).toEqual(["owner", "admin", "accountant"]);
    expect(permissions.invoice_finalize).toEqual(["owner", "admin"]);
  });
});
