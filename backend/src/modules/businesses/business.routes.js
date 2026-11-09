import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { authorize } from "../../middlewares/authorize.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  createOnboardingService,
  serializeBusiness,
} from "./onboarding.service.js";
import { onboardingSchema, currencySchema } from "../auth/auth.validation.js";
import { Subscription } from "../billing/subscription.model.js";
import { evaluateEntitlements } from "../billing/entitlements.service.js";
import { requireWritable } from "../../middlewares/billing.js";
import { BusinessSettings } from "./business-settings.model.js";

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "The request contains invalid fields.",
      result.error.flatten(),
    );
  }
  return result.data;
}

export function createBusinessRouter({
  env,
  now,
  beforeOnboardingCommit,
} = {}) {
  const router = Router();
  const requireUser = authenticate({ env, now });
  const onboarding = createOnboardingService({
    env,
    now,
    beforeCommit: beforeOnboardingCommit,
  });
  router.post(
    "/",
    requireUser,
    asyncHandler(async (req, res) => {
      const input = parse(onboardingSchema, req.body);
      const result = await onboarding.complete(req.auth.userId, input, {
        sessionId: req.auth.sessionId,
      });
      res.status(201).json(result);
    }),
  );
  router.get(
    "/current",
    requireUser,
    tenantContext,
    asyncHandler(async (req, res) => {
      const [subscription, settings] = await Promise.all([
        Subscription.findOne({ businessId: req.businessId }),
        BusinessSettings.findOne({ businessId: req.businessId }),
      ]);
      const entitlements = evaluateEntitlements({
        subscription,
        business: req.business,
      });
      res.json({
        business: serializeBusiness(req.business),
        entitlements,
        readOnly: entitlements.readOnly,
        membership: {
          id: req.membership._id.toString(),
          role: req.membership.role,
          slot: req.membership.slot,
        },
        subscription: subscription
          ? {
              planKey: entitlements.planKey,
              status: entitlements.state,
              trialStartedAt: subscription.trialStartedAt,
              trialEndsAt: subscription.trialEndsAt,
            }
          : null,
        settings: settings
          ? { reminders: settings.reminders, invoice: settings.invoice }
          : null,
      });
    }),
  );
  router.patch(
    "/current/currency",
    requireUser,
    tenantContext,
    authorize("currency"),
    requireWritable({ now }),
    asyncHandler(async (req, res) => {
      const { currency } = parse(currencySchema, req.body);
      res.json({
        business: await onboarding.changeCurrency({
          businessId: req.businessId,
          userId: req.auth.userId,
          currency,
          ip: req.ip ?? "",
        }),
      });
    }),
  );
  return router;
}
