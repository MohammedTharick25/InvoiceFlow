import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      immutable: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      immutable: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      immutable: true,
    },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: {
      type: String,
      enum: ["INR", "USD", "EUR", "JPY", "KWD"],
      required: true,
      immutable: true,
    },
    paidAt: { type: Date, required: true, immutable: true },
    method: {
      type: String,
      enum: ["cash", "bank_transfer", "upi", "card", "cheque", "other"],
      required: true,
      immutable: true,
    },
    reference: { type: String, default: "", maxlength: 120, immutable: true },
    notes: { type: String, default: "", maxlength: 1000, immutable: true },
    status: {
      type: String,
      enum: ["recorded", "reversed"],
      default: "recorded",
      required: true,
    },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    reversalReason: { type: String, default: "", maxlength: 1000 },
    idempotencyKey: { type: String, required: true, immutable: true },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

paymentSchema.index(
  { businessId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);
paymentSchema.index({ businessId: 1, invoiceId: 1, paidAt: -1 });

paymentSchema.pre("save", async function enforceAppendOnly() {
  if (this.isNew) return;
  const previous = await this.constructor
    .findById(this._id)
    .select("status")
    .lean();
  const changed = this.modifiedPaths().filter((path) => path !== "updatedAt");
  if (
    previous?.status !== "recorded" ||
    this.status !== "reversed" ||
    changed.some(
      (path) =>
        !["status", "reversedAt", "reversedBy", "reversalReason"].includes(
          path,
        ),
    )
  ) {
    throw new Error(
      "Payment records are append-only; only a single reversal is allowed.",
    );
  }
});

for (const method of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
]) {
  paymentSchema.pre(method, function rejectQueryMutation() {
    throw new Error(
      "Payment records are append-only; use the reversal service.",
    );
  });
}

export const Payment = mongoose.model("Payment", paymentSchema);
