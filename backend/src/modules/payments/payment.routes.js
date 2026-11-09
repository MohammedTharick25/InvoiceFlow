import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  listPaymentsQuerySchema,
  recordPaymentSchema,
  reversePaymentSchema,
} from "./payment.validation.js";
import { createPaymentService } from "./payment.service.js";

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "The request contains invalid fields.",
      result.error.flatten(),
    );
  return result.data;
}

function validateId(req, _res, next, value) {
  if (!/^[a-f\d]{24}$/i.test(value))
    return next(
      new ApiError(404, "NOT_FOUND", "The requested resource was not found."),
    );
  next();
}

export function createPaymentRouter({ env, now } = {}) {
  const router = Router();
  const payments = createPaymentService({ now });
  router.use(authenticate({ env, now }), tenantContext);
  router.param("invoiceId", validateId);
  router.param("paymentId", validateId);

  router.get(
    "/:invoiceId/payments",
    authorize("invoice_read"),
    asyncHandler(async (req, res) => {
      const query = parse(listPaymentsQuerySchema, req.query);
      res.json(
        await payments.list({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
          ...query,
        }),
      );
    }),
  );

  router.post(
    "/:invoiceId/payments",
    authorize("payment_write"),
    asyncHandler(async (req, res) => {
      const input = parse(recordPaymentSchema, req.body);
      res.status(201).json(
        await payments.record({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      );
    }),
  );

  router.post(
    "/:invoiceId/payments/:paymentId/reverse",
    authorize("payment_write"),
    asyncHandler(async (req, res) => {
      const input = parse(reversePaymentSchema, req.body);
      res.json(
        await payments.reverse({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
          paymentId: req.params.paymentId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      );
    }),
  );

  return router;
}
