import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "accountant", "staff"],
      required: true,
    },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    slot: { type: Number, required: true, min: 1 },
  },
  { timestamps: true },
);

membershipSchema.index({ businessId: 1, userId: 1 }, { unique: true });
membershipSchema.index(
  { userId: 1, slot: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);

export const BusinessMembership = mongoose.model(
  "BusinessMembership",
  membershipSchema,
);
