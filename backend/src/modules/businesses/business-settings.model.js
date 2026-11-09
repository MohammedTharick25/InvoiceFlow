import mongoose from "mongoose";

const defaultReminderSchedule = [
  { key: "before_due_3", offsetDays: 3, when: "before_due" },
  { key: "on_due", offsetDays: 0, when: "on_due" },
  { key: "after_due_3", offsetDays: 3, when: "after_due" },
];

const businessSettingsSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      unique: true,
    },
    invoice: {
      prefix: { type: String, default: "INV" },
      sequenceWidth: { type: Number, min: 6, default: 6 },
      financialYearStartMonth: { type: Number, default: 4 },
      startMonthLockedAt: { type: Date, default: null },
      defaultTermsDays: { type: Number, default: 30 },
      defaultNotes: { type: String, default: "" },
      footer: { type: String, default: "" },
      template: { type: String, default: "classic" },
      signatoryName: { type: String, default: "" },
      declarations: { type: [String], default: [] },
    },
    payment: {
      bankDetails: { type: String, default: "" },
      upiId: { type: String, default: "" },
      instructions: { type: String, default: "" },
    },
    reminders: {
      enabled: { type: Boolean, default: true },
      enabledSince: { type: Date, required: true },
      disabledAt: { type: Date, default: null },
      sendTimeLocal: { type: String, default: "09:00" },
      schedule: {
        type: [
          {
            key: { type: String, required: true },
            offsetDays: { type: Number, required: true },
            when: {
              type: String,
              enum: ["before_due", "on_due", "after_due"],
              required: true,
            },
          },
        ],
        default: defaultReminderSchedule,
      },
      maxLatenessHours: { type: Number, default: 48 },
      emailEnabled: { type: Boolean, default: false },
      retry: {
        maxAttempts: { type: Number, default: 3 },
        backoffMinutes: { type: [Number], default: [5, 30, 120] },
      },
      autoRetryUncertain: { type: Boolean, default: false },
      autoRetryUncertainAcknowledgedAt: { type: Date, default: null },
      autoRetryUncertainAcknowledgedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      workerFence: { type: Number, min: 0, default: 0 },
    },
    notificationPrefs: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const BusinessSettings = mongoose.model(
  "BusinessSettings",
  businessSettingsSchema,
);
