import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { Business } from "./business.model.js";
import { BusinessMembership } from "./business-membership.model.js";
import { BusinessSettings } from "./business-settings.model.js";
import { ExpenseCategory } from "../expenses/expense-category.model.js";
import { TaxRate } from "../settings/tax-rate.model.js";
import { TaxRateHead } from "../settings/tax-rate-head.model.js";
import { Subscription } from "../billing/subscription.model.js";
import { ActivityLog } from "../activity-logs/activity-log.model.js";
import { User } from "../users/user.model.js";
import { createAccessToken } from "../auth/auth.service.js";
import { isValidGstin } from "../../utils/gst.js";
import { ApiError } from "../../utils/ApiError.js";
import plans from "../../config/plans.json" with { type: "json" };
import stateData from "../../config/gst-state-codes.json" with { type: "json" };

const DEFAULT_EXPENSE_CATEGORIES = [
  "General",
  "Office supplies",
  "Travel",
  "Utilities",
];
const SEEDED_RATES = [
  { code: "GST5", name: "GST 5%", kind: "rate", rateBp: 500 },
  { code: "GST18", name: "GST 18%", kind: "rate", rateBp: 1800 },
  { code: "GST40", name: "GST 40%", kind: "rate", rateBp: 4000 },
];

function taxRateHash({ code, kind, rateBp, effectiveFrom }) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        code,
        kind,
        rateBp,
        effectiveFrom: effectiveFrom ?? null,
      }),
    )
    .digest("hex");
}

function assertTaxInput(tax) {
  if (tax.gstRegistered) {
    const exists = stateData.states.some(
      (state) => state.code === tax.stateCode,
    );
    if (!exists || !isValidGstin(tax.gstin, tax.stateCode)) {
      throw new ApiError(
        422,
        "GST_DETAILS_INVALID",
        "Enter a valid GSTIN and matching state code, or continue as not registered.",
      );
    }
  } else if (tax.gstin) {
    throw new ApiError(
      422,
      "GST_DETAILS_INVALID",
      "GSTIN can only be saved when GST registration is confirmed.",
    );
  }
  if (
    tax.stateCode &&
    !stateData.states.some((state) => state.code === tax.stateCode)
  ) {
    throw new ApiError(
      422,
      "STATE_CODE_INVALID",
      "Choose a state code from the configured reference list.",
    );
  }
}

export function createOnboardingService({
  env,
  now = () => new Date(),
  beforeCommit = async () => {},
  maxBusinessesPerUser = Number(env?.MAX_BUSINESSES_PER_USER ?? 1),
} = {}) {
  if (!env) throw new TypeError("env is required");

  async function complete(userId, input, context = {}) {
    input = {
      ...input,
      email: input.email ?? "",
      phone: input.phone ?? "",
      timezone: input.timezone ?? "Asia/Kolkata",
      currency: input.currency ?? "INR",
      address: {
        line1: "",
        line2: "",
        city: "",
        state: "",
        stateCode: "",
        postalCode: "",
        country: "India",
        ...input.address,
      },
      tax: {
        gstRegistered: false,
        gstin: "",
        stateCode: "",
        declaredTurnoverBand: "unspecified",
        ...input.tax,
      },
    };
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    } catch {
      throw new ApiError(
        422,
        "TIMEZONE_INVALID",
        "Choose a supported IANA time zone.",
      );
    }
    input.tax.gstin = input.tax.gstin.toUpperCase();
    assertTaxInput(input.tax);
    const current = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const user = await User.findOneAndUpdate(
          {
            _id: userId,
            status: "active",
            emailVerifiedAt: { $ne: null },
            trialUsedAt: null,
          },
          { $set: { trialUsedAt: current } },
          { returnDocument: "after", session },
        );
        if (!user) {
          const existing = await BusinessMembership.findOne({
            userId,
            status: "active",
          }).session(session);
          if (existing)
            throw new ApiError(
              409,
              "USER_ALREADY_HAS_BUSINESS",
              "This account already has an active business.",
            );
          throw new ApiError(
            409,
            "TRIAL_ALREADY_USED",
            "This account has already used its trial.",
          );
        }
        const activeMemberships = await BusinessMembership.find({
          userId,
          status: "active",
        })
          .session(session)
          .sort({ slot: 1 });
        const occupiedSlots = new Set(
          activeMemberships.map((membership) => membership.slot),
        );
        let slot = 1;
        while (occupiedSlots.has(slot) && slot <= maxBusinessesPerUser)
          slot += 1;
        if (slot > maxBusinessesPerUser) {
          throw new ApiError(
            409,
            "USER_ALREADY_HAS_BUSINESS",
            "This account has reached its business limit.",
          );
        }

        const [business] = await Business.create(
          [
            {
              name: input.name,
              type: input.type,
              email: input.email || user.email,
              phone: input.phone || "",
              address: input.address,
              timezone: input.timezone,
              currency: input.currency,
              currencyVersion: 1,
              hasFinalizedRecords: false,
              tax: {
                gstRegistered: input.tax.gstRegistered,
                gstin: input.tax.gstin.toUpperCase(),
                stateCode: input.tax.stateCode,
                hsnPolicy: {
                  declaredTurnoverBand: input.tax.declaredTurnoverBand,
                  confirmedBy:
                    input.tax.declaredTurnoverBand === "unspecified"
                      ? null
                      : user._id,
                  confirmedAt:
                    input.tax.declaredTurnoverBand === "unspecified"
                      ? null
                      : current,
                },
              },
              plan: "king",
              billing: {
                entitlementPlanKey: "king",
                entitlementState: "trialing",
              },
              onboardingStep: "complete",
              onboardingCompletedAt: current,
              createdBy: user._id,
            },
          ],
          { session },
        );

        await BusinessSettings.create(
          [
            {
              businessId: business._id,
              reminders: {
                enabled: true,
                enabledSince: current,
                sendTimeLocal: "09:00",
                schedule: [
                  { key: "before_due_3", offsetDays: 3, when: "before_due" },
                  { key: "on_due", offsetDays: 0, when: "on_due" },
                  { key: "after_due_3", offsetDays: 3, when: "after_due" },
                ],
              },
            },
          ],
          { session },
        );
        await ExpenseCategory.insertMany(
          DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
            businessId: business._id,
            name,
            createdBy: user._id,
          })),
          { session },
        );

        for (const rate of SEEDED_RATES) {
          const [taxRate] = await TaxRate.create(
            [
              {
                businessId: business._id,
                ...rate,
                effectiveFrom: null,
                previousVersionId: null,
                contentHash: taxRateHash({ ...rate, effectiveFrom: null }),
                createdBy: user._id,
              },
            ],
            { session },
          );
          await TaxRateHead.create(
            [
              {
                businessId: business._id,
                code: rate.code,
                latestEffectiveFrom: null,
                latestVersionId: taxRate._id,
                versionCount: 1,
                seq: 1,
              },
            ],
            { session },
          );
        }

        const trialDays = plans.trialDays;
        const trialEndsAt = new Date(
          current.getTime() + trialDays * 24 * 60 * 60 * 1000,
        );
        const [subscription] = await Subscription.create(
          [
            {
              businessId: business._id,
              planKey: "king",
              interval: "month",
              status: "trialing",
              trialStartedAt: current,
              trialEndsAt,
            },
          ],
          { session },
        );
        await Business.updateOne(
          { _id: business._id },
          { $set: { "billing.subscriptionId": subscription._id } },
          { session },
        );
        const [membership] = await BusinessMembership.create(
          [
            {
              userId: user._id,
              businessId: business._id,
              role: "owner",
              permissions: [],
              status: "active",
              slot,
            },
          ],
          { session },
        );
        await beforeCommit({ business, membership, subscription, session });
        result = { business, membership, subscription };
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.code === 11000) {
        const existing = await BusinessMembership.findOne({
          userId,
          status: "active",
        });
        if (existing)
          throw new ApiError(
            409,
            "USER_ALREADY_HAS_BUSINESS",
            "This account already has an active business.",
          );
        throw new ApiError(
          409,
          "TRIAL_ALREADY_USED",
          "This account has already used its trial.",
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
    if (!result)
      throw new Error("Onboarding transaction completed without a result.");
    return {
      business: serializeBusiness(result.business),
      membership: {
        id: result.membership._id.toString(),
        role: result.membership.role,
        slot: result.membership.slot,
      },
      subscription: {
        planKey: result.subscription.planKey,
        status: result.subscription.status,
        trialStartedAt: result.subscription.trialStartedAt,
        trialEndsAt: result.subscription.trialEndsAt,
      },
      accessToken: createAccessToken(
        await User.findById(userId),
        result.membership,
        context.sessionId,
        env,
      ),
      tokenType: "Bearer",
      expiresIn: 900,
    };
  }

  async function changeCurrency({ businessId, userId, currency, ip = "" }) {
    const session = await mongoose.startSession();
    let updated;
    try {
      await session.withTransaction(async () => {
        const business = await Business.findOne({ _id: businessId }).session(
          session,
        );
        if (!business)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        if (business.hasFinalizedRecords)
          throw new ApiError(
            409,
            "CURRENCY_LOCKED",
            "Currency is locked after a finalized invoice, payment, or expense.",
          );
        if (business.currency === currency) {
          updated = business;
          return;
        }
        const Invoice = mongoose.models.Invoice;
        let drafts = [];
        if (Invoice) {
          drafts = await Invoice.find({ businessId, status: "draft" })
            .select(
              "_id currency invoiceDiscountMinor items.unitPriceMinor items.discount charges.amountMinor",
            )
            .session(session);
        }
        const holdsAmount = (draft) =>
          (draft.items ?? []).some(
            (item) =>
              item.unitPriceMinor > 0 ||
              (item.discount?.type === "fixed" &&
                item.discount.amountMinor > 0),
          ) ||
          (draft.invoiceDiscountMinor ?? 0) > 0 ||
          (draft.charges ?? []).some((charge) => charge.amountMinor > 0);
        const blocking = drafts.filter(holdsAmount);
        if (blocking.length) {
          throw new ApiError(
            422,
            "DRAFTS_REQUIRE_REVIEW",
            "Review amount-holding drafts before changing currency.",
            {
              count: blocking.length,
              draftIds: blocking.map((draft) => draft._id.toString()),
            },
          );
        }
        const before = {
          currency: business.currency,
          currencyVersion: business.currencyVersion,
        };
        const nextVersion = business.currencyVersion + 1;
        const write = await Business.updateOne(
          {
            _id: businessId,
            hasFinalizedRecords: false,
            currencyVersion: business.currencyVersion,
          },
          { $set: { currency, currencyVersion: nextVersion } },
          { session },
        );
        if (write.modifiedCount !== 1) {
          throw new ApiError(
            409,
            "CURRENCY_LOCKED",
            "Currency changed concurrently. Reload the business and try again.",
          );
        }
        if (Invoice && drafts.length) {
          await Invoice.updateMany(
            {
              _id: { $in: drafts.map((draft) => draft._id) },
              businessId,
              status: "draft",
            },
            { $set: { currency } },
            { session },
          );
        }
        await ActivityLog.create(
          [
            {
              businessId,
              actorId: userId,
              action: "business.currency_changed",
              entityType: "Business",
              entityId: businessId,
              before,
              after: { currency, currencyVersion: nextVersion },
              ip: ip.slice(0, 100),
              at: now(),
            },
          ],
          { session },
        );
        updated = await Business.findById(businessId).session(session);
      });
    } finally {
      await session.endSession();
    }
    return serializeBusiness(updated);
  }

  return { complete, changeCurrency };
}

export function serializeBusiness(business) {
  return {
    id: business._id.toString(),
    name: business.name,
    type: business.type,
    email: business.email,
    phone: business.phone,
    address: business.address,
    timezone: business.timezone,
    currency: business.currency,
    currencyVersion: business.currencyVersion,
    currencyLockedAt: business.currencyLockedAt,
    hasFinalizedRecords: business.hasFinalizedRecords,
    tax: business.tax,
    plan: business.plan,
    onboardingCompletedAt: business.onboardingCompletedAt,
  };
}

export const onboardingSeeds = Object.freeze({
  categories: DEFAULT_EXPENSE_CATEGORIES,
  rates: SEEDED_RATES,
  plans,
});
