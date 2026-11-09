import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { ReminderLog } from "./reminder-log.model.js";
import { createReminderService } from "./reminder.service.js";
import { notificationsQuerySchema } from "./reminder-settings.validation.js";
import { ApiError } from "../../utils/ApiError.js";

export function createReminderRouter({ env, now, logger = console } = {}) {
  const router = Router();
  const service = createReminderService({ now });
  let lastRequestSweep = 0;
  router.use(authenticate({ env, now }), tenantContext);
  router.use((req, _res, next) => {
    if (req.path === "/run-now") return next();
    if (env?.NODE_ENV === "test") return next();
    const timestamp = Date.now();
    if (timestamp - lastRequestSweep > 60_000) {
      lastRequestSweep = timestamp;
      service
        .runSweep({ ownerId: `request-${process.pid}` })
        .catch((error) =>
          logger.warn({ err: error }, "Reminder request sweep failed"),
        );
    }
    next();
  });

  router.get(
    "/status",
    asyncHandler(async (req, res) => {
      res.json({
        status: await service.status({ businessId: req.businessId }),
      });
    }),
  );

  router.post(
    "/run-now",
    authorize("reminders"),
    asyncHandler(async (_req, res) => {
      res.json(await service.runSweep());
    }),
  );

  router.get(
    "/",
    authorize("invoice_read"),
    asyncHandler(async (req, res) => {
      const parsed = notificationsQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new ApiError(
          422,
          "VALIDATION_FAILED",
          "The request contains invalid fields.",
          parsed.error.flatten(),
        );
      const { page, limit } = parsed.data;
      const filter = { businessId: req.businessId };
      const [logs, total] = await Promise.all([
        ReminderLog.find(filter)
          .sort({ runAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ReminderLog.countDocuments(filter),
      ]);
      res.json({
        reminders: logs.map((log) => ({
          id: log._id.toString(),
          invoiceId: log.invoiceId.toString(),
          ruleKey: log.ruleKey,
          dueAt: log.dueAt,
          runAt: log.runAt,
          status: log.status,
          skipReason: log.skipReason,
          channels: log.channels,
        })),
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    }),
  );

  return router;
}
