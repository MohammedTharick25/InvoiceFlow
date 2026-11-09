import mongoose from "mongoose";

const taxRateSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      immutable: true,
    },
    code: { type: String, required: true, immutable: true },
    name: { type: String, required: true, immutable: true },
    kind: {
      type: String,
      enum: ["rate", "end"],
      required: true,
      immutable: true,
    },
    rateBp: { type: Number, default: null, immutable: true },
    effectiveFrom: { type: Date, default: null, immutable: true },
    previousVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    contentHash: { type: String, required: true, immutable: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

taxRateSchema.index(
  { businessId: 1, code: 1, effectiveFrom: 1 },
  { unique: true },
);

for (const method of [
  "updateOne",
  "findOneAndUpdate",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
]) {
  taxRateSchema.pre(method, function rejectMutation() {
    throw new Error("TaxRate versions are append-only.");
  });
}

taxRateSchema.pre("save", function rejectSavedMutation() {
  if (!this.isNew && this.isModified()) {
    throw new Error("TaxRate versions are append-only.");
  }
});

export const TaxRate = mongoose.model("TaxRate", taxRateSchema);
