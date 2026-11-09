import mongoose from "mongoose";

const idempotencyKeySchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    key: { type: String, required: true },
    operation: { type: String, required: true },
    requestHash: { type: String, required: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    response: { type: mongoose.Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
idempotencyKeySchema.index({ businessId: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyKey = mongoose.model(
  "IdempotencyKey",
  idempotencyKeySchema,
);
