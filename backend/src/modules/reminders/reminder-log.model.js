import mongoose from "mongoose";

const reminderLogSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
    },
    ruleKey: { type: String, required: true },
    dueAt: { type: Date, required: true },
    runAt: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "partial",
        "failed",
        "skipped",
        "cancelled",
      ],
      default: "pending",
      required: true,
    },
    skipReason: { type: String, default: "" },
    attempts: { type: Number, min: 0, default: 0 },
    lease: {
      token: { type: String, default: null },
      ownerId: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },
    channels: {
      inApp: {
        state: {
          type: String,
          enum: [
            "not_applicable",
            "pending",
            "held",
            "done",
            "skipped",
            "failed",
            "uncertain",
          ],
          default: "pending",
        },
      },
      email: {
        state: {
          type: String,
          enum: [
            "not_applicable",
            "pending",
            "held",
            "done",
            "skipped",
            "failed",
            "uncertain",
          ],
          default: "not_applicable",
        },
        reasonCode: { type: String, default: "email_disabled" },
        attempts: { type: Number, default: 0 },
        lastDeliveryId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
    },
    completedAt: { type: Date, default: null },
    jobRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobRun",
      default: null,
    },
  },
  { timestamps: true },
);

reminderLogSchema.index(
  { businessId: 1, invoiceId: 1, ruleKey: 1 },
  { unique: true },
);
reminderLogSchema.index({ status: 1, runAt: 1 });
reminderLogSchema.index({ status: 1, "lease.expiresAt": 1 });
reminderLogSchema.index({ businessId: 1, invoiceId: 1 });

export const ReminderLog = mongoose.model("ReminderLog", reminderLogSchema);
