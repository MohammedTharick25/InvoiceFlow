import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { now as systemNow } from "../../utils/clock.js";
import { Invoice } from "../invoices/invoice.model.js";
import { BusinessSettings } from "../businesses/business-settings.model.js";
import { Business } from "../businesses/business.model.js";
import { BusinessMembership } from "../businesses/business-membership.model.js";
import { ReminderLog } from "./reminder-log.model.js";
import { Notification } from "../notifications/notification.model.js";
import { JobLease } from "../scheduler/job-lease.model.js";
import { JobRun } from "../scheduler/job-run.model.js";

const terminalStatuses = ["completed", "failed", "skipped", "cancelled"];
const activeStatuses = ["pending", "processing", "partial"];
const JOB_NAME = "invoice-reminders";
const LEASE_MS = 5 * 60 * 1000;

function idString(value) {
  return value == null ? null : value.toString();
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function zonedInstant(date, time, timeZone) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = wanted;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .map(({ type, value }) => [type, value]),
    );
    const observed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const difference = wanted - observed;
    if (!difference) break;
    candidate += difference;
  }
  return new Date(candidate);
}

function scheduledDate(rule, dueDate) {
  const days =
    rule.when === "before_due"
      ? -rule.offsetDays
      : rule.when === "after_due"
        ? rule.offsetDays
        : 0;
  return addDays(dueDate, days);
}

function serializedNotification(notification) {
  return {
    id: idString(notification._id),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    entityId: idString(notification.entityId),
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

export function createReminderService({ now = systemNow } = {}) {
  async function syncInvoice({ businessId, invoiceId, at = now() }) {
    const [invoice, settings, business] = await Promise.all([
      Invoice.findOne({ _id: invoiceId, businessId }),
      BusinessSettings.findOne({ businessId }),
      Business.findById(businessId).select("timezone").lean(),
    ]);
    if (!invoice || !settings) return { created: 0, cancelled: 0 };
    const reminderSettings = settings.reminders;
    const isEligible =
      reminderSettings.enabled &&
      invoice.issuedAt &&
      invoice.issuedAt >= reminderSettings.enabledSince &&
      invoice.dueDate &&
      !invoice.archivedAt &&
      ["issued", "sent", "partially_paid"].includes(invoice.status) &&
      invoice.balanceMinor > 0;
    if (!isEligible) {
      const reason = !reminderSettings.enabled
        ? "business_reminders_disabled"
        : invoice.archivedAt
          ? "invoice_archived"
          : invoice.status === "cancelled"
            ? "invoice_cancelled"
            : invoice.balanceMinor <= 0 || invoice.status === "paid"
              ? "invoice_paid"
              : "stale";
      const cancelled = await ReminderLog.updateMany(
        { businessId, invoiceId, status: { $in: activeStatuses } },
        {
          $set: {
            status:
              reason === "business_reminders_disabled"
                ? "cancelled"
                : "skipped",
            skipReason: reason,
            completedAt: at,
            "channels.inApp.state": "skipped",
            "channels.email.state": "skipped",
            "channels.email.reasonCode": reason,
          },
          $unset: {
            "lease.token": 1,
            "lease.ownerId": 1,
            "lease.expiresAt": 1,
          },
        },
      );
      return { created: 0, cancelled: cancelled.modifiedCount };
    }

    const dueDate = invoice.dueDate.toISOString().slice(0, 10);
    const staleBefore =
      at.getTime() - reminderSettings.maxLatenessHours * 60 * 60 * 1000;
    const plannedRules = (reminderSettings.schedule ?? []).map((rule) => ({
      rule,
      runAt: zonedInstant(
        scheduledDate(rule, dueDate),
        reminderSettings.sendTimeLocal,
        business?.timezone ?? "UTC",
      ),
    }));
    const latestOverdueRunAt = plannedRules
      .filter(
        ({ runAt }) =>
          runAt.getTime() <= at.getTime() && runAt.getTime() >= staleBefore,
      )
      .reduce(
        (latest, item) => Math.max(latest, item.runAt.getTime()),
        -Infinity,
      );
    let created = 0;
    for (const { rule, runAt } of plannedRules) {
      if (!rule.key) continue;
      const existing = await ReminderLog.findOne({
        businessId,
        invoiceId,
        ruleKey: rule.key,
      });
      if (existing) {
        if (terminalStatuses.includes(existing.status)) continue;
        existing.dueAt = invoice.dueDate;
        existing.runAt = runAt;
        if (
          runAt.getTime() < staleBefore ||
          (runAt.getTime() <= at.getTime() &&
            runAt.getTime() < latestOverdueRunAt)
        ) {
          existing.status = "skipped";
          existing.skipReason = "stale";
          existing.completedAt = at;
          existing.channels.inApp.state = "skipped";
        }
        await existing.save();
        continue;
      }
      const stale =
        runAt.getTime() < staleBefore ||
        (runAt.getTime() <= at.getTime() &&
          runAt.getTime() < latestOverdueRunAt);
      const status = stale ? "skipped" : "pending";
      try {
        await ReminderLog.create({
          businessId,
          invoiceId,
          ruleKey: rule.key,
          dueAt: invoice.dueDate,
          runAt,
          status,
          skipReason: status === "skipped" ? "stale" : "",
          completedAt: status === "skipped" ? at : null,
          channels: {
            inApp: { state: status === "skipped" ? "skipped" : "pending" },
            email: { state: "not_applicable", reasonCode: "email_disabled" },
          },
        });
        created += 1;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    const activeRuleKeys = (reminderSettings.schedule ?? []).map(
      (rule) => rule.key,
    );
    await ReminderLog.updateMany(
      {
        businessId,
        invoiceId,
        ruleKey: { $nin: activeRuleKeys },
        status: { $in: activeStatuses },
      },
      {
        $set: {
          status: "cancelled",
          skipReason: "rule_removed",
          completedAt: at,
          "channels.inApp.state": "skipped",
          "channels.email.state": "skipped",
          "channels.email.reasonCode": "rule_removed",
        },
      },
    );
    return { created, cancelled: 0 };
  }

  async function reconcile({ at = now() } = {}) {
    const settingsRows = await BusinessSettings.find({
      "reminders.enabled": true,
    })
      .select("businessId reminders")
      .lean();
    let created = 0;
    for (const settings of settingsRows) {
      const invoiceIds = await Invoice.find({
        businessId: settings.businessId,
        issuedAt: { $gte: settings.reminders.enabledSince },
        dueDate: { $ne: null },
        archivedAt: null,
        status: { $in: ["issued", "sent", "partially_paid"] },
        balanceMinor: { $gt: 0 },
      }).distinct("_id");
      for (const invoiceId of invoiceIds) {
        const result = await syncInvoice({
          businessId: settings.businessId,
          invoiceId,
          at,
        });
        created += result.created;
      }
    }
    return created;
  }

  async function recoverExpired({ at = now() } = {}) {
    const result = await ReminderLog.updateMany(
      { status: "processing", "lease.expiresAt": { $lte: at } },
      {
        $set: { status: "pending", "channels.inApp.state": "pending" },
        $unset: { "lease.token": 1, "lease.ownerId": 1, "lease.expiresAt": 1 },
      },
    );
    return result.modifiedCount;
  }

  async function notifyBusinessMembers(log, invoice, businessId, at, session) {
    const members = await BusinessMembership.find({
      businessId,
      status: "active",
    })
      .select("userId")
      .session(session)
      .lean();
    const number = invoice.number || "your invoice";
    const body = `A reminder is due for ${number}. Outstanding balance: ${invoice.currency} ${(invoice.balanceMinor / 100).toFixed(2)}.`;
    for (const member of members) {
      await Notification.updateOne(
        {
          businessId,
          userId: member.userId,
          dedupeKey: `${idString(log._id)}:in_app`,
        },
        {
          $setOnInsert: {
            businessId,
            userId: member.userId,
            type: "invoice_due",
            title: "Invoice reminder",
            body,
            link: "/invoices",
            entityId: invoice._id,
            dedupeKey: `${idString(log._id)}:in_app`,
            createdAt: at,
          },
        },
        { upsert: true, session },
      );
    }
  }

  async function processOne({ ownerId, at = now() }) {
    const token = randomUUID();
    const log = await ReminderLog.findOneAndUpdate(
      { status: "pending", $expr: { $lte: ["$runAt", "$$NOW"] } },
      [
        {
          $set: {
            status: "processing",
            attempts: { $add: [{ $ifNull: ["$attempts", 0] }, 1] },
            "lease.token": token,
            "lease.ownerId": ownerId,
            "lease.expiresAt": {
              $dateAdd: {
                startDate: "$$NOW",
                unit: "millisecond",
                amount: LEASE_MS,
              },
            },
          },
        },
      ],
      {
        sort: { runAt: 1, _id: 1 },
        returnDocument: "after",
        updatePipeline: true,
      },
    );
    if (!log) return false;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne({
          _id: log.invoiceId,
          businessId: log.businessId,
        }).session(session);
        const settings = await BusinessSettings.findOne({
          businessId: log.businessId,
        }).session(session);
        const finish = (values) =>
          ReminderLog.updateOne(
            { _id: log._id, status: "processing", "lease.token": token },
            {
              $set: { ...values, completedAt: now() },
              $unset: {
                "lease.token": 1,
                "lease.ownerId": 1,
                "lease.expiresAt": 1,
              },
            },
            { session },
          );
        if (
          !invoice ||
          !settings ||
          !settings.reminders.enabled ||
          invoice.archivedAt ||
          !["issued", "sent", "partially_paid"].includes(invoice.status) ||
          invoice.balanceMinor <= 0
        ) {
          const reason = !settings?.reminders.enabled
            ? "business_reminders_disabled"
            : invoice?.archivedAt
              ? "invoice_archived"
              : invoice?.status === "cancelled"
                ? "invoice_cancelled"
                : !invoice ||
                    invoice.balanceMinor <= 0 ||
                    invoice.status === "paid"
                  ? "invoice_paid"
                  : "stale";
          await finish({
            status:
              reason === "business_reminders_disabled"
                ? "cancelled"
                : "skipped",
            skipReason: reason,
            "channels.inApp.state": "skipped",
            "channels.email.state": "skipped",
            "channels.email.reasonCode": reason,
          });
          return;
        }
        const ageHours = (at.getTime() - log.runAt.getTime()) / 3600000;
        if (ageHours > settings.reminders.maxLatenessHours) {
          await finish({
            status: "skipped",
            skipReason: "stale",
            "channels.inApp.state": "skipped",
          });
          return;
        }
        const settingsFence = await BusinessSettings.updateOne(
          {
            businessId: log.businessId,
            "reminders.enabled": true,
            "reminders.enabledSince": settings.reminders.enabledSince,
          },
          { $inc: { "reminders.workerFence": 1 } },
          { session },
        );
        const invoiceFence = await Invoice.updateOne(
          {
            _id: invoice._id,
            businessId: log.businessId,
            archivedAt: null,
            status: { $in: ["issued", "sent", "partially_paid"] },
            balanceMinor: { $gt: 0 },
          },
          { $inc: { reminderVersion: 1 } },
          { session },
        );
        if (!settingsFence.matchedCount || !invoiceFence.matchedCount) {
          await finish({
            status: "skipped",
            skipReason: "stale",
            "channels.inApp.state": "skipped",
          });
          return;
        }
        await notifyBusinessMembers(log, invoice, log.businessId, at, session);
        await finish({
          status: "completed",
          skipReason: "",
          "channels.inApp.state": "done",
        });
      });
      return true;
    } catch (error) {
      await ReminderLog.updateOne(
        { _id: log._id, status: "processing", "lease.token": token },
        {
          $set: {
            status: "failed",
            skipReason: "processing_error",
            "channels.inApp.state": "failed",
            completedAt: now(),
          },
          $unset: {
            "lease.token": 1,
            "lease.ownerId": 1,
            "lease.expiresAt": 1,
          },
        },
      );
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async function acquireSweepLease(ownerId, at) {
    try {
      try {
        await JobLease.updateOne(
          { _id: JOB_NAME },
          {
            $setOnInsert: {
              ownerId: "",
              epoch: 0,
              leaseUntil: new Date(0),
              heartbeatAt: new Date(0),
            },
          },
          { upsert: true },
        );
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
      return await JobLease.findOneAndUpdate(
        { _id: JOB_NAME, leaseUntil: { $lte: at } },
        {
          $set: {
            ownerId,
            heartbeatAt: at,
            leaseUntil: new Date(at.getTime() + LEASE_MS),
          },
          $inc: { epoch: 1 },
        },
        { returnDocument: "after" },
      );
    } catch (error) {
      if (error?.code === 11000) return null;
      throw error;
    }
  }

  async function runSweep({ ownerId = randomUUID(), at = now() } = {}) {
    const lease = await acquireSweepLease(ownerId, at);
    if (!lease) return { acquired: false, processed: 0 };
    const run = await JobRun.create({
      jobName: JOB_NAME,
      ownerId,
      epoch: lease.epoch,
      startedAt: at,
      status: "running",
    });
    let processed = 0;
    try {
      await recoverExpired({ at });
      await reconcile({ at });
      while (await processOne({ ownerId, at })) processed += 1;
      const completedAt = now();
      await JobRun.updateOne(
        { _id: run._id, ownerId, epoch: lease.epoch },
        { $set: { status: "completed", finishedAt: completedAt, processed } },
      );
      await JobLease.updateOne(
        { _id: JOB_NAME, ownerId, epoch: lease.epoch },
        {
          $set: {
            heartbeatAt: completedAt,
            leaseUntil: completedAt,
            lastSuccessAt: completedAt,
          },
        },
      );
      return { acquired: true, processed, epoch: lease.epoch };
    } catch (error) {
      await JobRun.updateOne(
        { _id: run._id, ownerId, epoch: lease.epoch },
        {
          $set: {
            status: "failed",
            finishedAt: now(),
            processed,
            errorCode: error.code ?? "SCHEDULER_ERROR",
          },
        },
      );
      await JobLease.updateOne(
        { _id: JOB_NAME, ownerId, epoch: lease.epoch },
        { $set: { leaseUntil: now() } },
      );
      throw error;
    }
  }

  async function status({ businessId, at = now() }) {
    const [lastRun, due, held, uncertain, failed, cancelled] =
      await Promise.all([
        JobRun.findOne({ jobName: JOB_NAME, status: "completed" })
          .sort({ finishedAt: -1 })
          .lean(),
        ReminderLog.countDocuments({
          businessId,
          status: "pending",
          runAt: { $lte: at },
        }),
        ReminderLog.countDocuments({
          businessId,
          "channels.email.state": "held",
          status: { $nin: terminalStatuses },
        }),
        ReminderLog.countDocuments({
          businessId,
          "channels.email.state": "uncertain",
        }),
        ReminderLog.countDocuments({ businessId, status: "failed" }),
        ReminderLog.countDocuments({ businessId, status: "cancelled" }),
      ]);
    return {
      lastSuccessfulRunAt: lastRun?.finishedAt ?? null,
      dueUnprocessed: due,
      held,
      uncertain,
      failed,
      cancelled,
      healthy: Boolean(lastRun) && failed === 0 && due === 0,
    };
  }

  async function listNotifications({
    businessId,
    userId,
    page = 1,
    limit = 20,
  }) {
    const filter = { businessId, userId };
    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, readAt: null }),
    ]);
    return {
      notifications: notifications.map(serializedNotification),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      unread,
    };
  }

  async function markNotificationRead({
    businessId,
    userId,
    notificationId,
    at = now(),
  }) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, businessId, userId },
      { $set: { readAt: at } },
      { returnDocument: "after" },
    );
    return notification ? serializedNotification(notification) : null;
  }

  async function markAllNotificationsRead({ businessId, userId, at = now() }) {
    const result = await Notification.updateMany(
      { businessId, userId, readAt: null },
      { $set: { readAt: at } },
    );
    return { modified: result.modifiedCount };
  }

  return {
    syncInvoice,
    reconcile,
    recoverExpired,
    runSweep,
    status,
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  };
}
