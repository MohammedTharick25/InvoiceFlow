import mongoose from "mongoose";

const counterSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    key: { type: String, required: true },
    seq: { type: Number, required: true, min: 0 },
    prefix: { type: String, required: true },
    width: { type: Number, required: true, min: 6 },
    maxSeq: { type: Number, required: true },
    financialYear: {
      startYear: { type: Number, required: true },
      label: { type: String, required: true },
    },
  },
  { timestamps: true },
);
counterSchema.index({ businessId: 1, key: 1 }, { unique: true });

export const Counter = mongoose.model("Counter", counterSchema);
