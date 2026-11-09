import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { ApiError } from "../../utils/ApiError.js";
import { BusinessSettings } from "../businesses/business-settings.model.js";
import { ActivityLog } from "../activity-logs/activity-log.model.js";
import { createTaxRateService } from "./tax-rate.service.js";
import {
  appendTaxRateSchema,
  listTaxRatesQuerySchema,
} from "./tax-rate.validation.js";
import { updateInvoiceSettingsSchema } from "./invoice-settings.validation.js";
import { validateInvoiceSeries } from "../../utils/invoiceNumber.js";
import { now as systemNow } from "../../utils/clock.js";
import mongoose from "mongoose";
import hsnRules from "../../config/gst-hsn-rules.json" with { type: "json" };
import { Business } from "../businesses/business.model.js";
import { updateHsnPolicySchema } from "./hsn-policy.validation.js";
import { updateReminderSettingsSchema } from "../reminders/reminder-settings.validation.js";
import { createReminderSettingsService } from "../reminders/reminder-settings.service.js";
import { requireWritable } from "../../middlewares/billing.js";

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

export function createSettingsRouter({ env, now } = {}) {
  const router = Router();
  const clock = now ?? systemNow;
  const taxRates = createTaxRateService({ now });
  const reminders = createReminderSettingsService({ now });
  router.use(authenticate({ env }), tenantContext);
  const writable = requireWritable({ now });
  router.use((req, res, next) =>
    req.method === "GET" ? next() : writable(req, res, next),
  );

  router.get(
    "/invoice",
    authorize("invoice_read"),
    asyncHandler(async (req, res) => {
      const settings = await BusinessSettings.findOne({
        businessId: req.businessId,
      })
        .select("invoice payment")
        .lean();
      if (!settings)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found.",
        );
      res.json({ invoice: settings.invoice, payment: settings.payment });
    }),
  );

  router.patch(
    "/invoice",
    authorize("business_settings"),
    asyncHandler(async (req, res) => {
      const input = parse(updateInvoiceSettingsSchema, req.body);
      const session = await mongoose.startSession();
      let invoiceSettings;
      try {
        await session.withTransaction(async () => {
          const settings = await BusinessSettings.findOne({
            businessId: req.businessId,
          }).session(session);
          if (!settings)
            throw new ApiError(
              404,
              "NOT_FOUND",
              "The requested resource was not found.",
            );
          const before = settings.invoice.toObject();
          const merged = { ...before, ...input };
          validateInvoiceSeries({
            prefix: merged.prefix,
            sequenceWidth: merged.sequenceWidth,
          });
          if (
            input.financialYearStartMonth !== undefined &&
            input.financialYearStartMonth !== before.financialYearStartMonth &&
            before.startMonthLockedAt
          )
            throw new ApiError(
              409,
              "FINANCIAL_YEAR_START_MONTH_LOCKED",
              "Financial-year start month is locked after the first invoice number is allocated.",
            );
          Object.assign(settings.invoice, input);
          await settings.save({ session });
          invoiceSettings = settings.invoice.toObject();
          await ActivityLog.create(
            [
              {
                businessId: req.businessId,
                actorId: req.auth.userId,
                action: "business.invoice_settings_updated",
                entityType: "business_settings",
                entityId: settings._id,
                before,
                after: invoiceSettings,
                ip: req.ip ?? "",
                at: clock(),
              },
            ],
            { session },
          );
        });
      } finally {
        await session.endSession();
      }
      res.json({ invoice: invoiceSettings });
    }),
  );

  router.get(
    "/tax-rates",
    authorize("invoice_read"),
    asyncHandler(async (req, res) => {
      const query = parse(listTaxRatesQuerySchema, req.query);
      res.json(await taxRates.list({ businessId: req.businessId, ...query }));
    }),
  );

  router.post(
    "/tax-rates",
    authorize("business_settings"),
    asyncHandler(async (req, res) => {
      const input = parse(appendTaxRateSchema, req.body);
      res.status(201).json({
        taxRate: await taxRates.appendVersion({
          businessId: req.businessId,
          actorId: req.auth.userId,
          input,
        }),
      });
    }),
  );

  router.patch(
    "/hsn-policy",
    authorize("business_settings"),
    asyncHandler(async (req, res) => {
      const input = parse(updateHsnPolicySchema, req.body);
      const current = clock();
      const session = await mongoose.startSession();
      let policy;
      try {
        await session.withTransaction(async () => {
          const business = await Business.findById(req.businessId).session(
            session,
          );
          if (!business)
            throw new ApiError(
              404,
              "NOT_FOUND",
              "The requested resource was not found.",
            );
          const before = business.tax.hsnPolicy.toObject();
          business.tax.hsnPolicy = {
            declaredTurnoverBand: input.declaredTurnoverBand,
            source: "user_declared",
            confirmedBy: req.auth.userId,
            confirmedAt: current,
          };
          await business.save({ session });
          policy = business.tax.hsnPolicy.toObject();
          await ActivityLog.create(
            [
              {
                businessId: req.businessId,
                actorId: req.auth.userId,
                action: "business.hsn_policy_updated",
                entityType: "business",
                entityId: business._id,
                before,
                after: policy,
                ip: req.ip ?? "",
                at: current,
              },
            ],
            { session },
          );
        });
      } finally {
        await session.endSession();
      }
      res.json({
        hsnPolicy: policy,
        rules: hsnRules.turnoverBands,
        authority: hsnRules.authority,
      });
    }),
  );

  router.get(
    "/reminders",
    authorize("reminders"),
    asyncHandler(async (req, res) => {
      res.json({
        reminders: await reminders.get({ businessId: req.businessId }),
      });
    }),
  );

  router.patch(
    "/reminders",
    authorize("reminders"),
    asyncHandler(async (req, res) => {
      const input = parse(updateReminderSettingsSchema, req.body);
      res.json({
        reminders: await reminders.update({
          businessId: req.businessId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      });
    }),
  );

  return router;
}
