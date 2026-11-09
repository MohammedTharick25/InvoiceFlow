import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import plans from "../../config/plans.json" with { type: "json" };
import { ApiError } from "../../utils/ApiError.js";
import { businessDate } from "../../utils/clock.js";
import { Business } from "../businesses/business.model.js";
import { BusinessMembership } from "../businesses/business-membership.model.js";
import { Notification } from "../notifications/notification.model.js";
import { UsageCounter } from "./usage-counter.model.js";
import { Subscription } from "./subscription.model.js";
import { BillingEvent } from "./billing-event.model.js";
import { evaluateEntitlements } from "./entitlements.service.js";
import { createRazorpayClient } from "./razorpay.client.js";

const DAY_MS = 86_400_000;

function asDate(seconds) {
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : null;
}

function safePayloadHash(rawBody) {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function verifyRazorpaySignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !secret)
    return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return (
    received.length === expected.length && timingSafeEqual(expected, received)
  );
}

export function createBillingService({
  env,
  now = () => new Date(),
  razorpay,
} = {}) {
  function getRazorpay() {
    return razorpay ?? createRazorpayClient(env);
  }

  function requireWebhookConfiguration() {
    if (!env?.RAZORPAY_WEBHOOK_SECRET) {
      throw new ApiError(
        503,
        "BILLING_NOT_CONFIGURED",
        "Billing webhooks are not configured, so provider changes cannot be safely applied.",
      );
    }
  }

  async function summary(businessId) {
    const [business, subscription] = await Promise.all([
      Business.findById(businessId).lean(),
      Subscription.findOne({ businessId }).lean(),
    ]);
    const current = now();
    const entitlements = evaluateEntitlements({
      subscription,
      business,
      now: current,
    });
    const period = businessDate(current, business?.timezone ?? "UTC").slice(
      0,
      7,
    );
    const usage = await UsageCounter.findOne({
      businessId,
      periodKey: period,
    }).lean();
    return {
      planKey: entitlements.planKey,
      planName: entitlements.planName,
      interval: subscription?.interval ?? "month",
      pendingPlanKey: subscription?.pendingPlanKey ?? null,
      pendingInterval: subscription?.pendingInterval ?? null,
      status: entitlements.state,
      trialStartedAt: subscription?.trialStartedAt ?? null,
      trialEndsAt: entitlements.trialEndsAt,
      trialDaysLeft: entitlements.trialDaysLeft,
      currentPeriodStart: subscription?.currentPeriodStart ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      usage: { period, finalizedInvoices: usage?.finalizedInvoices ?? 0 },
      limits: entitlements.limits,
      entitlements: entitlements.features,
      readOnly: entitlements.readOnly,
      configured: Boolean(
        env?.RAZORPAY_KEY_ID &&
        env?.RAZORPAY_KEY_SECRET &&
        env?.RAZORPAY_WEBHOOK_SECRET,
      ),
      plans: Object.fromEntries(
        Object.entries(plans.plans).map(([key, value]) => [
          key,
          {
            name: value.name,
            monthlyMinor: value.monthlyMinor,
            annualMinor: value.annualMinor,
            finalizedInvoicesPerMonth: value.finalizedInvoicesPerMonth,
            activeCustomers: value.activeCustomers,
            teamMembers: value.teamMembers,
          },
        ]),
      ),
    };
  }

  async function checkout({ businessId, planKey, interval }) {
    requireWebhookConfiguration();
    if (!plans.razorpayPlanIds?.[planKey]?.[interval]) {
      throw new ApiError(
        503,
        "BILLING_NOT_CONFIGURED",
        "The Razorpay plan ID has not been configured by the owner.",
      );
    }
    const current = await Subscription.findOne({ businessId });
    if (!current)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    if (current.status === "trialing" && current.trialEndsAt > now()) {
      throw new ApiError(
        409,
        "TRIAL_ACTIVE",
        "Your no-card trial is still active. Billing checkout is available after the trial ends.",
      );
    }
    if (current.status === "active" && current.currentPeriodEnd > now()) {
      throw new ApiError(
        409,
        "SUBSCRIPTION_ALREADY_ACTIVE",
        "Use change plan to update an active subscription.",
      );
    }
    const result = await getRazorpay().subscriptions.create({
      plan_id: plans.razorpayPlanIds[planKey][interval],
      total_count: interval === "year" ? 10 : 120,
      customer_notify: 0,
      notes: { businessId: businessId.toString(), planKey, interval },
    });
    current.pendingPlanKey = planKey;
    current.pendingInterval = interval;
    current.razorpaySubscriptionId = result.id;
    await current.save();
    return {
      subscriptionId: result.id,
      shortUrl: result.short_url ?? null,
      keyId: env.RAZORPAY_KEY_ID,
    };
  }

  async function changePlan({ businessId, planKey, interval }) {
    requireWebhookConfiguration();
    const current = await Subscription.findOne({ businessId });
    if (
      !current?.razorpaySubscriptionId ||
      !["active", "past_due"].includes(current.status)
    ) {
      throw new ApiError(
        409,
        "SUBSCRIPTION_CHANGE_UNAVAILABLE",
        "An active provider subscription is required to change plans.",
      );
    }
    const planId = plans.razorpayPlanIds?.[planKey]?.[interval];
    if (!planId)
      throw new ApiError(
        503,
        "BILLING_NOT_CONFIGURED",
        "The Razorpay plan ID has not been configured by the owner.",
      );
    const selectedPrice =
      interval === "year"
        ? plans.plans[planKey].annualMinor
        : plans.plans[planKey].monthlyMinor;
    const currentPrice =
      current.interval === "year"
        ? plans.plans[current.planKey].annualMinor
        : plans.plans[current.planKey].monthlyMinor;
    const upgrade = selectedPrice > currentPrice;
    const update = await getRazorpay().subscriptions.update(
      current.razorpaySubscriptionId,
      {
        plan_id: planId,
        schedule_change_at: upgrade ? "now" : "cycle_end",
      },
    );
    current.pendingPlanKey = planKey;
    current.pendingInterval = interval;
    await current.save();
    return {
      requestedPlanKey: planKey,
      pending: !upgrade,
      providerStatus: update.status ?? null,
    };
  }

  async function cancel({ businessId }) {
    const current = await Subscription.findOne({ businessId });
    if (!current)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    if (
      current.razorpaySubscriptionId &&
      ["active", "past_due"].includes(current.status)
    ) {
      requireWebhookConfiguration();
      await getRazorpay().subscriptions.cancel(
        current.razorpaySubscriptionId,
        true,
      );
    }
    current.cancelAtPeriodEnd = true;
    await current.save();
    return {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: current.currentPeriodEnd,
    };
  }

  async function invoices({ businessId }) {
    const subscription = await Subscription.findOne({ businessId })
      .select("razorpaySubscriptionId")
      .lean();
    if (!subscription?.razorpaySubscriptionId) return { invoices: [] };
    const response = await getRazorpay().invoices.all({
      subscription_id: subscription.razorpaySubscriptionId,
      count: 100,
    });
    return {
      invoices: (response.items ?? []).map((invoice) => ({
        id: invoice.id,
        status: invoice.status,
        amountMinor: invoice.amount,
        currency: invoice.currency,
        issuedAt: asDate(invoice.issued_at),
        shortUrl: invoice.short_url ?? null,
      })),
    };
  }

  async function verifyCheckout({
    businessId,
    paymentId,
    subscriptionId,
    signature,
  }) {
    requireWebhookConfiguration();
    if (!env?.RAZORPAY_KEY_SECRET)
      throw new ApiError(
        503,
        "BILLING_NOT_CONFIGURED",
        "Billing checkout is not configured.",
      );
    const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${paymentId}|${subscriptionId}`)
      .digest();
    const received = Buffer.from(signature, "hex");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new ApiError(
        400,
        "BILLING_WEBHOOK_SIGNATURE_INVALID",
        "The checkout signature is invalid.",
      );
    }
    const subscription = await Subscription.findOne({
      businessId,
      razorpaySubscriptionId: subscriptionId,
    });
    if (!subscription)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    const entity = await getRazorpay().subscriptions.fetch(subscriptionId);
    if (!["authenticated", "active", "pending"].includes(entity.status)) {
      throw new ApiError(
        409,
        "CHECKOUT_NOT_AUTHENTICATED",
        "The payment provider has not authenticated this subscription.",
      );
    }
    // Authentication confirms the subscription binding only. Entitlements still change from webhooks.
    return { verified: true, status: subscription.status };
  }

  async function processWebhook({ eventId, rawBody, signature }) {
    if (
      !verifyRazorpaySignature(rawBody, signature, env?.RAZORPAY_WEBHOOK_SECRET)
    ) {
      throw new ApiError(
        400,
        "BILLING_WEBHOOK_SIGNATURE_INVALID",
        "The webhook signature is invalid.",
      );
    }
    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new ApiError(
        400,
        "BILLING_WEBHOOK_INVALID",
        "The webhook body is invalid.",
      );
    }
    const supportedEvents = new Set([
      "subscription.authenticated",
      "subscription.activated",
      "subscription.charged",
      "subscription.pending",
      "subscription.halted",
      "subscription.cancelled",
      "subscription.completed",
      "payment.failed",
    ]);
    if (!eventId || !supportedEvents.has(payload.event))
      throw new ApiError(
        400,
        "BILLING_WEBHOOK_INVALID",
        "The webhook event is invalid.",
      );
    const entity = payload.payload?.subscription?.entity;
    const subscriptionId =
      entity?.id ?? payload.payload?.payment?.entity?.subscription_id ?? null;
    const createdAt = asDate(payload.created_at) ?? now();
    const session = await mongoose.startSession();
    let duplicate = false;
    try {
      await session.withTransaction(async () => {
        await BillingEvent.create(
          [
            {
              razorpayEventId: eventId,
              type: payload.event,
              subscriptionId,
              payloadHash: safePayloadHash(rawBody),
              receivedAt: now(),
            },
          ],
          { session },
        );
        if (!subscriptionId) {
          await BillingEvent.updateOne(
            { razorpayEventId: eventId },
            {
              $set: { processedAt: now(), outcome: "ignored_no_subscription" },
            },
            { session },
          );
          return;
        }
        const subscription = await Subscription.findOne({
          razorpaySubscriptionId: subscriptionId,
        }).session(session);
        if (!subscription) {
          await BillingEvent.updateOne(
            { razorpayEventId: eventId },
            { $set: { processedAt: now(), outcome: "orphaned_subscription" } },
            { session },
          );
          return;
        }
        if (
          subscription.lastWebhookAt &&
          createdAt < subscription.lastWebhookAt
        ) {
          await BillingEvent.updateOne(
            { razorpayEventId: eventId },
            { $set: { processedAt: now(), outcome: "stale_event_ignored" } },
            { session },
          );
          return;
        }
        const update = { lastWebhookAt: createdAt };
        const event = payload.event;
        if (
          [
            "subscription.authenticated",
            "subscription.activated",
            "subscription.charged",
          ].includes(event)
        ) {
          if (event !== "subscription.authenticated") {
            update.status = "active";
            update.planKey =
              subscription.pendingPlanKey ?? subscription.planKey;
            update.pendingPlanKey = null;
            update.interval =
              subscription.pendingInterval ?? subscription.interval;
            update.pendingInterval = null;
            update.currentPeriodStart =
              asDate(entity?.current_start) ?? subscription.currentPeriodStart;
            update.currentPeriodEnd =
              asDate(entity?.current_end) ?? subscription.currentPeriodEnd;
            update.graceEndsAt = null;
          }
          if (event === "subscription.charged")
            update.lastPaymentAt = createdAt;
        } else if (
          event === "subscription.pending" ||
          event === "payment.failed"
        ) {
          update.status = "past_due";
          update.graceEndsAt = new Date(createdAt.getTime() + 7 * DAY_MS);
        } else if (event === "subscription.halted") update.status = "halted";
        else if (event === "subscription.cancelled") {
          update.status = "cancelled";
          update.currentPeriodEnd =
            asDate(entity?.current_end) ?? subscription.currentPeriodEnd;
          update.cancelAtPeriodEnd = true;
        } else if (event === "subscription.completed")
          update.status = "expired";
        await Subscription.updateOne(
          {
            _id: subscription._id,
            $or: [
              { lastWebhookAt: null },
              { lastWebhookAt: { $lte: createdAt } },
            ],
          },
          { $set: update },
          { session },
        );
        if (update.status) {
          await Business.updateOne(
            { _id: subscription.businessId },
            {
              $set: {
                "billing.entitlementState": update.status,
                ...(update.planKey
                  ? { "billing.entitlementPlanKey": update.planKey }
                  : {}),
              },
            },
            { session },
          );
        }
        await BillingEvent.updateOne(
          { razorpayEventId: eventId },
          { $set: { processedAt: now(), outcome: "processed" } },
          { session },
        );
      });
    } catch (error) {
      if (error?.code === 11000) duplicate = true;
      else throw error;
    } finally {
      await session.endSession();
    }
    return { received: true, duplicate };
  }

  async function expireTrials() {
    const current = now();
    const result = await Subscription.updateMany(
      { status: "trialing", trialEndsAt: { $lte: current } },
      { $set: { status: "expired" } },
    );
    const expiredBusinessIds = await Subscription.find({
      status: "expired",
    }).distinct("businessId");
    await Business.updateMany(
      { _id: { $in: expiredBusinessIds } },
      { $set: { "billing.entitlementState": "expired" } },
    );
    return result.modifiedCount;
  }

  async function sendTrialNotifications() {
    const current = now();
    const candidates = await Subscription.find({
      status: "trialing",
      trialEndsAt: { $gt: current },
    })
      .select("businessId trialStartedAt trialEndsAt")
      .lean();
    for (const sub of candidates) {
      const elapsedDays = Math.floor(
        (current.getTime() - new Date(sub.trialStartedAt).getTime()) / DAY_MS,
      );
      const dueNotices = [7, 12, 14].filter((day) => elapsedDays >= day - 1);
      if (!dueNotices.length) continue;
      const owner = await BusinessMembership.findOne({
        businessId: sub.businessId,
        role: "owner",
        status: "active",
      })
        .select("userId")
        .lean();
      if (!owner) continue;
      await Promise.all(
        dueNotices.map((day) =>
          Notification.updateOne(
            {
              businessId: sub.businessId,
              userId: owner.userId,
              dedupeKey: `trial-day-${day}`,
            },
            {
              $setOnInsert: {
                businessId: sub.businessId,
                userId: owner.userId,
                type: "trial_notice",
                title: `Trial day ${day}`,
                body: `Your 14-day trial ends ${new Date(sub.trialEndsAt).toISOString().slice(0, 10)}.`,
                link: "/settings/billing",
                entityId: sub._id,
                dedupeKey: `trial-day-${day}`,
              },
            },
            { upsert: true },
          ),
        ),
      );
    }
  }

  return {
    summary,
    checkout,
    changePlan,
    cancel,
    invoices,
    verifyCheckout,
    processWebhook,
    expireTrials,
    sendTrialNotifications,
  };
}
