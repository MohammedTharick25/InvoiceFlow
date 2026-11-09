import { resolve } from "node:path";
import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { ApiError } from "../../utils/ApiError.js";
import { createInvoiceStorageProvider } from "./storage.service.js";
import { createInvoiceService } from "./invoice.service.js";
import { requireWritable } from "../../middlewares/billing.js";
import {
  clearAmountsSchema,
  createInvoiceSchema,
  finalizeInvoiceSchema,
  listInvoicesQuerySchema,
  markSentSchema,
  unmarkSentSchema,
  updateInvoiceSchema,
} from "./invoice.validation.js";

function parse(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "The request contains invalid fields.",
      parsed.error.flatten(),
    );
  return parsed.data;
}

function sendPdf(res, file) {
  const filename = file.filename.replace(/[\r\n"\\]/g, "_");
  res.set("Cache-Control", "private, no-store");
  res.set("Content-Type", "application/pdf");
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(file.buffer);
}

export function createInvoiceRouter({
  env,
  now,
  storage,
  beforeFinalizeCommit,
} = {}) {
  const router = Router();
  const fileStorage =
    storage ??
    createInvoiceStorageProvider({
      env,
      root: resolve(process.cwd(), "uploads", "invoices"),
    });
  const invoices = createInvoiceService({
    now,
    storage: fileStorage,
    beforeFinalizeCommit,
  });
  router.use(authenticate({ env, now }), tenantContext);
  const writable = requireWritable({ now });
  router.param("invoiceId", (req, res, next, invoiceId) => {
    if (!/^[a-f\d]{24}$/i.test(invoiceId))
      return next(
        new ApiError(404, "NOT_FOUND", "The requested resource was not found."),
      );
    next();
  });

  router.get(
    "/",
    authorize("invoice_read"),
    asyncHandler(async (req, res) => {
      const query = parse(listInvoicesQuerySchema, req.query);
      const business = req.business;
      res.json(
        await invoices.list({
          businessId: req.businessId,
          query,
          timeZone: business.timezone,
        }),
      );
    }),
  );

  router.post(
    "/",
    authorize("invoice_write"),
    writable,
    asyncHandler(async (req, res) => {
      const input = parse(createInvoiceSchema, req.body);
      res.status(201).json(
        await invoices.create({
          businessId: req.businessId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      );
    }),
  );

  router.get(
    "/:invoiceId",
    authorize("invoice_read"),
    asyncHandler(async (req, res) => {
      res.json(
        await invoices.get({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
        }),
      );
    }),
  );

  router.patch(
    "/:invoiceId",
    authorize("invoice_write"),
    writable,
    asyncHandler(async (req, res) => {
      const input = parse(updateInvoiceSchema, req.body);
      res.json(
        await invoices.update({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      );
    }),
  );

  router.delete(
    "/:invoiceId",
    authorize("invoice_write"),
    writable,
    asyncHandler(async (req, res) => {
      res.json(
        await invoices.removeDraft({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
          userId: req.auth.userId,
          ip: req.ip,
        }),
      );
    }),
  );

  router.post(
    "/:invoiceId/archive",
    authorize("invoice_write"),
    writable,
    asyncHandler(async (req, res) => {
      res.json({
        invoice: await invoices.archive({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
          userId: req.auth.userId,
          ip: req.ip,
        }),
      });
    }),
  );

  router.post(
    "/:invoiceId/clear-amounts",
    authorize("invoice_write"),
    writable,
    asyncHandler(async (req, res) => {
      parse(clearAmountsSchema, req.body);
      res.json(
        await invoices.clearAmounts({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
          userId: req.auth.userId,
          ip: req.ip,
        }),
      );
    }),
  );

  router.post(
    "/:invoiceId/finalize",
    authorize("invoice_finalize"),
    writable,
    asyncHandler(async (req, res) => {
      const input = parse(finalizeInvoiceSchema, req.body);
      res.json(
        await invoices.finalize({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      );
    }),
  );

  router.get(
    "/:invoiceId/pdf",
    authorize("invoice_read"),
    asyncHandler(async (req, res) => {
      const file = await invoices.downloadPdf({
        businessId: req.businessId,
        invoiceId: req.params.invoiceId,
        userId: req.auth.userId,
      });
      sendPdf(res, file);
    }),
  );

  router.post(
    "/:invoiceId/mark-sent",
    authorize("invoice_finalize"),
    writable,
    asyncHandler(async (req, res) => {
      const input = parse(markSentSchema, req.body);
      res.json(
        await invoices.markSent({
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
    "/:invoiceId/unmark-sent",
    authorize("invoice_finalize"),
    writable,
    asyncHandler(async (req, res) => {
      const input = parse(unmarkSentSchema, req.body);
      res.json(
        await invoices.unmarkSent({
          businessId: req.businessId,
          invoiceId: req.params.invoiceId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      );
    }),
  );

  return router;
}
