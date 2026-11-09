import mongoose from "mongoose";

const invoiceDeliverySchema = new mongoose.Schema(
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
    method: {
      type: String,
      enum: ["pdf_download", "mark_sent", "unmark_sent", "email"],
      required: true,
      immutable: true,
    },
    via: { type: String, default: null, immutable: true },
    status: {
      type: String,
      enum: [
        "recorded",
        "started",
        "accepted",
        "failed_retryable",
        "failed_permanent",
        "uncertain",
      ],
      required: true,
    },
    declaredAt: { type: Date, default: null, immutable: true },
    recordedAt: { type: Date, required: true, immutable: true },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    reverses: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
      immutable: true,
    },
    note: { type: String, default: "", maxlength: 1000, immutable: true },
    recipient: { type: String, default: "", maxlength: 254, immutable: true },
    messageId: { type: String, default: null, immutable: true },
    attempt: { type: Number, min: 1, default: null, immutable: true },
    manual: { type: Boolean, default: false, immutable: true },
    error: {
      code: { type: String, default: null },
      message: { type: String, default: null },
    },
    idempotencyKey: { type: String, default: null, immutable: true },
    leaseToken: { type: String, default: null },
  },
  { versionKey: false },
);

invoiceDeliverySchema.index({ businessId: 1, invoiceId: 1, recordedAt: 1 });
invoiceDeliverySchema.index(
  { recordedAt: 1 },
  {
    expireAfterSeconds: 400 * 24 * 60 * 60,
    partialFilterExpression: { method: "pdf_download" },
  },
);
invoiceDeliverySchema.index(
  { businessId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);
invoiceDeliverySchema.index(
  { businessId: 1, invoiceId: 1, method: 1, attempt: 1 },
  { unique: true, partialFilterExpression: { method: "email" } },
);

invoiceDeliverySchema.pre("validate", function validateEmailAttempt() {
  if (
    this.method === "email" &&
    (!Number.isInteger(this.attempt) || this.attempt < 1)
  ) {
    this.invalidate(
      "attempt",
      "Email deliveries require an attempt number of at least 1.",
    );
  }
  if (this.method !== "email" && this.attempt != null) {
    this.invalidate("attempt", "Only email deliveries have an attempt number.");
  }
});

invoiceDeliverySchema.pre("save", async function enforceAppendOnlyStatus() {
  if (this.isNew) return;
  const previous = await this.constructor
    .findById(this._id)
    .select("status method")
    .lean();
  const allowed = new Set([
    "started:accepted",
    "started:failed_retryable",
    "started:failed_permanent",
    "started:uncertain",
    "failed_retryable:started",
    "uncertain:started",
  ]);
  const changedPaths = this.modifiedPaths().filter(
    (path) => path !== "updatedAt",
  );
  if (
    previous?.method !== "email" ||
    !this.isModified("status") ||
    !allowed.has(`${previous.status}:${this.status}`) ||
    changedPaths.some(
      (path) => !["status", "error", "leaseToken"].includes(path),
    )
  ) {
    throw new Error(
      "InvoiceDelivery is append-only except for forward email status transitions.",
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
  invoiceDeliverySchema.pre(method, function rejectQueryMutation() {
    throw new Error(
      "InvoiceDelivery is append-only; update an email status through its service.",
    );
  });
}

export const InvoiceDelivery = mongoose.model(
  "InvoiceDelivery",
  invoiceDeliverySchema,
);
