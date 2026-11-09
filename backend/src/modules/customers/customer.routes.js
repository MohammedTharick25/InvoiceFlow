import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import {
  requireCustomerCapacity,
  requireWritable,
} from "../../middlewares/billing.js";
import { ApiError } from "../../utils/ApiError.js";
import { createCustomerService } from "./customer.service.js";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "./customer.validation.js";

function parse(schema, value) {
  const result = schema.safeParse(value);
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

export function createCustomerRouter({ env, now } = {}) {
  const router = Router();
  const customers = createCustomerService({ now });
  router.use(authenticate({ env, now }), tenantContext);
  const writable = requireWritable({ now });
  router.use((req, res, next) =>
    req.method === "GET" ? next() : writable(req, res, next),
  );

  router.get(
    "/",
    authorize("customer_read"),
    asyncHandler(async (req, res) => {
      const query = parse(listCustomersQuerySchema, req.query);
      res.json(await customers.list({ businessId: req.businessId, ...query }));
    }),
  );

  router.post(
    "/sample-data",
    authorize("customer_write"),
    asyncHandler(async (req, res) => {
      if (req.membership.role !== "owner")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only the workspace owner can add sample data.",
        );
      res.status(201).json(
        await customers.seedSampleData({
          businessId: req.businessId,
          userId: req.auth.userId,
          ip: req.ip,
        }),
      );
    }),
  );

  router.post(
    "/check-duplicates",
    authorize("customer_write"),
    asyncHandler(async (req, res) => {
      const input = parse(createCustomerSchema, req.body);
      res.json({
        duplicates: await customers.findDuplicates({
          businessId: req.businessId,
          input,
        }),
      });
    }),
  );

  router.post(
    "/",
    authorize("customer_write"),
    requireCustomerCapacity(),
    asyncHandler(async (req, res) => {
      const input = parse(createCustomerSchema, req.body);
      res.status(201).json({
        customer: await customers.create({ businessId: req.businessId, input }),
      });
    }),
  );

  router.get(
    "/:customerId",
    authorize("customer_read"),
    asyncHandler(async (req, res) => {
      res.json({
        customer: await customers.get({
          businessId: req.businessId,
          customerId: req.params.customerId,
        }),
      });
    }),
  );

  router.patch(
    "/:customerId",
    authorize("customer_write"),
    asyncHandler(async (req, res) => {
      const input = parse(updateCustomerSchema, req.body);
      res.json({
        customer: await customers.update({
          businessId: req.businessId,
          customerId: req.params.customerId,
          input,
        }),
      });
    }),
  );

  router.delete(
    "/:customerId",
    authorize("customer_write"),
    asyncHandler(async (req, res) => {
      res.json({
        customer: await customers.archive({
          businessId: req.businessId,
          customerId: req.params.customerId,
        }),
      });
    }),
  );

  return router;
}
