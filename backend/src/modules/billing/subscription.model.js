import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      unique: true,
    },
    planKey: {
      type: String,
      enum: ["basic", "anointed", "king"],
      required: true,
    },
    interval: { type: String, enum: ["month", "year"], default: "month" },
    status: {
      type: String,
      enum: [
        "trialing",
        "active",
        "past_due",
        "halted",
        "cancelled",
        "expired",
      ],
      required: true,
    },
    trialStartedAt: { type: Date, required: true },
    trialEndsAt: { type: Date, required: true },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    pendingPlanKey: { type: String, default: null },
    pendingInterval: {
      type: String,
      enum: ["month", "year", null],
      default: null,
    },
    razorpayCustomerId: { type: String, default: null },
    razorpaySubscriptionId: { type: String, default: null },
    lastPaymentAt: { type: Date, default: null },
    graceEndsAt: { type: Date, default: null },
    lastWebhookAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Subscription = mongoose.model("Subscription", subscriptionSchema);
