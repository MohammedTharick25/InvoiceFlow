import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["invoice_due", "reminder_health"],
      required: true,
    },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, required: true, maxlength: 500 },
    link: { type: String, default: "/invoices", maxlength: 200 },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    dedupeKey: { type: String, required: true, maxlength: 200 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index(
  { businessId: 1, userId: 1, dedupeKey: 1 },
  { unique: true },
);
notificationSchema.index({
  businessId: 1,
  userId: 1,
  readAt: 1,
  createdAt: -1,
});

export const Notification = mongoose.model("Notification", notificationSchema);
