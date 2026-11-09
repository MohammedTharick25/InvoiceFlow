import mongoose from "mongoose";

const taxRateHeadSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    code: { type: String, required: true },
    latestEffectiveFrom: { type: Date, default: null },
    latestVersionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    versionCount: { type: Number, default: 0 },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

taxRateHeadSchema.index({ businessId: 1, code: 1 }, { unique: true });

export const TaxRateHead = mongoose.model("TaxRateHead", taxRateHeadSchema);
