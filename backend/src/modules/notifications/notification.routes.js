import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { ApiError } from "../../utils/ApiError.js";
import { createReminderService } from "../reminders/reminder.service.js";
import { notificationsQuerySchema } from "../reminders/reminder-settings.validation.js";

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

export function createNotificationRouter({ env, now } = {}) {
  const router = Router();
  const notifications = createReminderService({ now });
  router.use(authenticate({ env, now }), tenantContext);
  router.param("notificationId", (req, _res, next, id) => {
    if (!/^[a-f\d]{24}$/i.test(id))
      return next(
        new ApiError(404, "NOT_FOUND", "The requested resource was not found."),
      );
    next();
  });
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = parse(notificationsQuerySchema, req.query);
      res.json(
        await notifications.listNotifications({
          businessId: req.businessId,
          userId: req.auth.userId,
          ...query,
        }),
      );
    }),
  );
  router.patch(
    "/:notificationId/read",
    asyncHandler(async (req, res) => {
      const notification = await notifications.markNotificationRead({
        businessId: req.businessId,
        userId: req.auth.userId,
        notificationId: req.params.notificationId,
      });
      if (!notification)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found.",
        );
      res.json({ notification });
    }),
  );
  router.post(
    "/read-all",
    asyncHandler(async (req, res) => {
      res.json(
        await notifications.markAllNotificationsRead({
          businessId: req.businessId,
          userId: req.auth.userId,
        }),
      );
    }),
  );
  return router;
}
