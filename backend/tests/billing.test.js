import { createHmac } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Business } from "../src/modules/businesses/business.model.js";
import { BusinessMembership } from "../src/modules/businesses/business-membership.model.js";
import { BillingEvent } from "../src/modules/billing/billing-event.model.js";
import { Subscription } from "../src/modules/billing/subscription.model.js";
import { UsageCounter } from "../src/modules/billing/usage-counter.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import { User } from "../src/modules/users/user.model.js";
import { Customer } from "../src/modules/customers/customer.model.js";
import {
  createBillingService,
  verifyRazorpaySignature,
} from "../src/modules/billing/billing.service.js";
import { evaluateEntitlements } from "../src/modules/billing/entitlements.service.js";
import planRegistry from "../src/config/plans.json" with { type: "json" };

const env = {
  RAZORPAY_KEY_ID: "rzp_test_example",
  RAZORPAY_KEY_SECRET: "k".repeat(32),
  RAZORPAY_WEBHOOK_SECRET: "w".repeat(32),
};
const models = [
  Business,
  BusinessMembership,
  BillingEvent,
  Subscription,
  UsageCounter,
  Notification,
  User,
  Customer,
];
const instant = new Date("2026-11-09T12:00:00.000Z");
let replica;
let user;
let business;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("invoiceflow_billing"));
  await Promise.all(models.map((model) => model.init()));
});
beforeEach(async () => {
  await Promise.all(models.map((model) => model.collection.deleteMany({})));
  user = await User.create({
    email: "billing-owner@example.test",
    passwordHash: "hash",
    name: "Billing Owner",
  });
  business = await Business.create({
    name: "Billing Studio",
    type: "individual",
    createdBy: user._id,
    onboardingCompletedAt: instant,
    billing: { entitlementPlanKey: "king", entitlementState: "trialing" },
  });
});
afterAll(async () => {
  await mongoose.disconnect();
  await replica?.stop();
});

function webhook(event, eventId, createdAt, subscriptionId = "sub_test_123") {
  const rawBody = Buffer.from(
    JSON.stringify({
      event,
      created_at: createdAt,
      payload: {
        subscription: {
          entity: {
            id: subscriptionId,
            status: event === "subscription.activated" ? "active" : "pending",
            current_start: createdAt,
            current_end: createdAt + 30 * 86400,
          },
        },
      },
    }),
  );
  const signature = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return { eventId, rawBody, signature };
}

describe("Phase 9A billing and entitlement policies", () => {
  it("maps each plan's active features and limits from the plan registry", () => {
    for (const [planKey, plan] of Object.entries(planRegistry.plans)) {
      const entitlements = evaluateEntitlements({
        subscription: { status: "active", planKey },
        business,
        now: instant,
      });
      expect(entitlements.limits).toMatchObject({
        finalizedInvoicesPerMonth: plan.finalizedInvoicesPerMonth,
        activeCustomers: plan.activeCustomers,
        teamMembers: plan.teamMembers,
      });
      for (const [feature, enabled] of Object.entries(plan.features)) {
        expect(entitlements.features[feature]).toBe(enabled);
      }
    }
  });

  it("applies grace and cancellation boundaries without dropping retained plan data", async () => {
    const end = new Date(instant.getTime() + 86400000);
    const pastDue = {
      status: "past_due",
      planKey: "anointed",
      graceEndsAt: end,
    };
    expect(
      evaluateEntitlements({
        subscription: pastDue,
        business,
        now: instant,
      }).readOnly,
    ).toBe(false);
    expect(
      evaluateEntitlements({
        subscription: pastDue,
        business,
        now: end,
      }),
    ).toMatchObject({ state: "halted", readOnly: true });

    const cancelled = {
      status: "cancelled",
      planKey: "basic",
      currentPeriodEnd: end,
    };
    expect(
      evaluateEntitlements({
        subscription: cancelled,
        business,
        now: instant,
      }).readOnly,
    ).toBe(false);
    expect(
      evaluateEntitlements({
        subscription: cancelled,
        business,
        now: end,
      }),
    ).toMatchObject({ state: "expired", readOnly: true });

    // Downgrading leaves records over the new Basic limit intact.
    await Customer.insertMany(
      Array.from({ length: 51 }, (_, index) => ({
        businessId: business._id,
        name: `Customer ${index + 1}`,
        billingAddress: {
          line1: "1 Main Street",
          city: "Pune",
          stateCode: "27",
          postalCode: "411001",
        },
      })),
    );
    await Subscription.create({
      businessId: business._id,
      planKey: "king",
      status: "active",
      trialStartedAt: instant,
      trialEndsAt: instant,
    });
    await Subscription.updateOne(
      { businessId: business._id },
      { $set: { planKey: "basic" } },
    );
    expect(await Customer.countDocuments({ businessId: business._id })).toBe(
      51,
    );
    expect(
      await Subscription.countDocuments({ businessId: business._id }),
    ).toBe(1);
  });

  it("evaluates King trial access through day 13 and changes to read-only at day 14", () => {
    const started = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date(started.getTime() + 14 * 86400000);
    const trial = {
      status: "trialing",
      planKey: "king",
      trialStartedAt: started,
      trialEndsAt: end,
    };
    const dayZero = evaluateEntitlements({
      subscription: trial,
      business,
      now: started,
    });
    expect(dayZero).toMatchObject({
      state: "trialing",
      readOnly: false,
      trialDaysLeft: 14,
    });
    expect(dayZero.features).toMatchObject({
      reports: true,
      expenses: true,
      cashflow: true,
    });
    expect(
      evaluateEntitlements({
        subscription: trial,
        business,
        now: new Date(end.getTime() - 1),
      }).readOnly,
    ).toBe(false);
    const expired = evaluateEntitlements({
      subscription: trial,
      business,
      now: end,
    });
    expect(expired).toMatchObject({
      state: "expired",
      readOnly: true,
      trialDaysLeft: 0,
    });
    expect(expired.features.reports).toBe(false);
  });

  it("verifies webhook HMAC, applies only ordered events, and acknowledges duplicates", async () => {
    const trialEnd = new Date(instant.getTime() + 14 * 86400000);
    await Subscription.create({
      businessId: business._id,
      planKey: "king",
      status: "trialing",
      trialStartedAt: instant,
      trialEndsAt: trialEnd,
      razorpaySubscriptionId: "sub_test_123",
      pendingPlanKey: "basic",
    });
    const service = createBillingService({ env, now: () => instant });
    const activated = webhook(
      "subscription.activated",
      "evt-activate",
      Math.floor(instant.getTime() / 1000),
    );
    expect(
      verifyRazorpaySignature(
        activated.rawBody,
        activated.signature,
        env.RAZORPAY_WEBHOOK_SECRET,
      ),
    ).toBe(true);
    expect(await service.processWebhook(activated)).toEqual({
      received: true,
      duplicate: false,
    });
    const saved = await Subscription.findOne({ businessId: business._id });
    expect(saved).toMatchObject({
      status: "active",
      planKey: "basic",
      pendingPlanKey: null,
    });
    expect(await service.processWebhook(activated)).toEqual({
      received: true,
      duplicate: true,
    });

    const stale = webhook(
      "subscription.pending",
      "evt-stale",
      Math.floor(instant.getTime() / 1000) - 60,
    );
    await service.processWebhook(stale);
    expect(
      (await Subscription.findOne({ businessId: business._id })).status,
    ).toBe("active");
    await expect(
      service.processWebhook({
        ...activated,
        signature: "0".repeat(64),
        eventId: "evt-invalid",
      }),
    ).rejects.toMatchObject({ code: "BILLING_WEBHOOK_SIGNATURE_INVALID" });
  });

  it("sends deduplicated trial day 7, 12, and 14 notices and expires the subscription", async () => {
    const start = new Date(instant.getTime() - 13 * 86400000);
    await BusinessMembership.create({
      businessId: business._id,
      userId: user._id,
      role: "owner",
      slot: 1,
    });
    await Subscription.create({
      businessId: business._id,
      planKey: "king",
      status: "trialing",
      trialStartedAt: start,
      trialEndsAt: new Date(start.getTime() + 14 * 86400000),
    });
    const service = createBillingService({ env, now: () => instant });
    await service.sendTrialNotifications();
    await service.sendTrialNotifications();
    expect(
      await Notification.countDocuments({
        businessId: business._id,
        type: "trial_notice",
      }),
    ).toBe(3);
    await Subscription.updateOne(
      { businessId: business._id },
      { $set: { trialEndsAt: new Date(instant.getTime() - 1) } },
    );
    await service.expireTrials();
    expect(
      (await Subscription.findOne({ businessId: business._id })).status,
    ).toBe("expired");
    expect(
      (await Business.findById(business._id)).billing.entitlementState,
    ).toBe("expired");
  });

  it("does not open Razorpay or start paid checkout without a configured plan ID", async () => {
    await Subscription.create({
      businessId: business._id,
      planKey: "king",
      status: "expired",
      trialStartedAt: instant,
      trialEndsAt: instant,
    });
    const service = createBillingService({
      env,
      now: () => instant,
      razorpay: {
        subscriptions: {
          create: () => {
            throw new Error("provider must not be contacted");
          },
        },
      },
    });
    await expect(
      service.checkout({
        businessId: business._id,
        planKey: "basic",
        interval: "month",
      }),
    ).rejects.toMatchObject({ code: "BILLING_NOT_CONFIGURED" });
  });
});
