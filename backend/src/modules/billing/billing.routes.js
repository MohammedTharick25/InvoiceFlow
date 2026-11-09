import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { ApiError } from "../../utils/ApiError.js";
import { createBillingService } from "./billing.service.js";
import {
  cancelSubscriptionSchema,
  checkoutVerificationSchema,
  planChangeSchema,
} from "./billing.validation.js";

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "The request contains invalid fields.",
      result.error.flatten(),
    );
  return result.data;
}

export function createBillingRouter({ env, now, razorpay } = {}) {
  const router = Router();
  const billing = createBillingService({ env, now, razorpay });

  router.post(
    "/webhooks/razorpay",
    asyncHandler(async (req, res) => {
      const result = await billing.processWebhook({
        eventId: req.get("x-razorpay-event-id"),
        signature: req.get("x-razorpay-signature"),
        rawBody: req.rawBody,
      });
      res.json(result);
    }),
  );

  router.use(authenticate({ env, now }), tenantContext, authorize("billing"));
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json(await billing.summary(req.businessId));
    }),
  );
  router.post(
    "/checkout",
    asyncHandler(async (req, res) => {
      const input = parse(planChangeSchema, req.body);
      res
        .status(201)
        .json(await billing.checkout({ businessId: req.businessId, ...input }));
    }),
  );
  router.post(
    "/checkout/verify",
    asyncHandler(async (req, res) => {
      const input = parse(checkoutVerificationSchema, req.body);
      res.json(
        await billing.verifyCheckout({
          businessId: req.businessId,
          paymentId: input.razorpay_payment_id,
          subscriptionId: input.razorpay_subscription_id,
          signature: input.razorpay_signature,
        }),
      );
    }),
  );
  router.post(
    "/change-plan",
    asyncHandler(async (req, res) => {
      const input = parse(planChangeSchema, req.body);
      res.json(
        await billing.changePlan({ businessId: req.businessId, ...input }),
      );
    }),
  );
  router.post(
    "/cancel",
    asyncHandler(async (req, res) => {
      parse(cancelSubscriptionSchema, req.body);
      res.json(await billing.cancel({ businessId: req.businessId }));
    }),
  );
  router.get(
    "/invoices",
    asyncHandler(async (req, res) => {
      res.json(await billing.invoices({ businessId: req.businessId }));
    }),
  );
  return router;
}
