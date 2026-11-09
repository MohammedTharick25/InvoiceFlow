import mongoose from "mongoose";

const billingEventSchema = new mongoose.Schema(
  {
    razorpayEventId: { type: String, required: true, immutable: true },
    type: { type: String, required: true, immutable: true },
    subscriptionId: { type: String, default: null, immutable: true },
    payloadHash: { type: String, required: true, immutable: true },
    receivedAt: { type: Date, required: true, immutable: true },
    processedAt: { type: Date, default: null },
    outcome: { type: String, default: "received" },
  },
  { versionKey: false },
);
billingEventSchema.index({ razorpayEventId: 1 }, { unique: true });
billingEventSchema.index(
  { receivedAt: 1 },
  { expireAfterSeconds: 400 * 24 * 60 * 60 },
);

export const BillingEvent = mongoose.model("BillingEvent", billingEventSchema);
