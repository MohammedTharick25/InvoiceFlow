import mongoose from "mongoose";

const usageCounterSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    periodKey: { type: String, required: true },
    finalizedInvoices: { type: Number, required: true, min: 0, default: 0 },
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false },
);
usageCounterSchema.index({ businessId: 1, periodKey: 1 }, { unique: true });

export const UsageCounter = mongoose.model("UsageCounter", usageCounterSchema);
