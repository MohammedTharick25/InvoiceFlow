import mongoose from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { now as systemNow } from "../../utils/clock.js";
import { ActivityLog } from "../activity-logs/activity-log.model.js";
import { BusinessSettings } from "../businesses/business-settings.model.js";
import { Invoice } from "../invoices/invoice.model.js";
import { ReminderLog } from "./reminder-log.model.js";
import { createReminderService } from "./reminder.service.js";

const liveStatuses = ["pending", "processing", "partial"];

export function createReminderSettingsService({ now = systemNow } = {}) {
  const reminders = createReminderService({ now });

  async function get({ businessId }) {
    const settings = await BusinessSettings.findOne({ businessId })
      .select("reminders")
      .lean();
    if (!settings)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    return settings.reminders;
  }

  async function update({ businessId, userId, input, ip }) {
    const at = now();
    const session = await mongoose.startSession();
    let updated;
    try {
      await session.withTransaction(async () => {
        const settings = await BusinessSettings.findOne({ businessId }).session(
          session,
        );
        if (!settings)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        const before = settings.reminders.toObject();
        const disabling = input.enabled === false && before.enabled;
        if (disabling) {
          const pendingCount = await ReminderLog.countDocuments({
            businessId,
            status: { $in: liveStatuses },
          }).session(session);
          if (
            input.confirmCancelPending === undefined ||
            input.confirmCancelPending !== pendingCount
          )
            throw new ApiError(
              422,
              "REMINDERS_DISABLE_CONFIRMATION_REQUIRED",
              "Confirm the number of scheduled reminders to cancel.",
              { pendingCount },
            );
          await ReminderLog.updateMany(
            { businessId, status: { $in: liveStatuses } },
            {
              $set: {
                status: "cancelled",
                skipReason: "business_reminders_disabled",
                completedAt: at,
                "channels.inApp.state": "skipped",
                "channels.email.state": "skipped",
                "channels.email.reasonCode": "business_reminders_disabled",
              },
              $unset: {
                "lease.token": 1,
                "lease.ownerId": 1,
                "lease.expiresAt": 1,
              },
            },
            { session },
          );
          settings.reminders.disabledAt = at;
        }
        if (input.enabled === true && !before.enabled) {
          settings.reminders.enabledSince = at;
          settings.reminders.disabledAt = null;
        }
        if (input.enabled !== undefined)
          settings.reminders.enabled = input.enabled;
        if (input.sendTimeLocal !== undefined)
          settings.reminders.sendTimeLocal = input.sendTimeLocal;
        if (input.schedule !== undefined)
          settings.reminders.schedule = input.schedule;
        await settings.save({ session });
        updated = settings.reminders.toObject();
        await ActivityLog.create(
          [
            {
              businessId,
              actorId: userId,
              action: "business.reminder_settings_updated",
              entityType: "business_settings",
              entityId: settings._id,
              before,
              after: updated,
              ip: (ip ?? "").slice(0, 100),
              at,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    if (updated.enabled) {
      const invoiceIds = await Invoice.find({
        businessId,
        issuedAt: { $gte: updated.enabledSince },
        dueDate: { $ne: null },
      }).distinct("_id");
      for (const invoiceId of invoiceIds)
        await reminders.syncInvoice({ businessId, invoiceId, at });
    }
    return updated;
  }

  return { get, update };
}
