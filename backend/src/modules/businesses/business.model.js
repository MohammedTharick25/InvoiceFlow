import mongoose from "mongoose";

const businessSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    type: {
      type: String,
      required: true,
      enum: ["individual", "company", "partnership", "other"],
    },
    email: { type: String, lowercase: true, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    address: {
      line1: { type: String, trim: true, default: "" },
      line2: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      stateCode: { type: String, trim: true, default: "" },
      postalCode: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "India" },
    },
    timezone: { type: String, required: true, default: "Asia/Kolkata" },
    currency: {
      type: String,
      required: true,
      enum: ["INR", "USD", "EUR", "JPY", "KWD"],
      default: "INR",
    },
    currencyVersion: { type: Number, required: true, default: 1 },
    hasFinalizedRecords: { type: Boolean, required: true, default: false },
    sampleDataLoadedAt: { type: Date, default: null },
    currencyLockedAt: { type: Date, default: null },
    tax: {
      gstRegistered: { type: Boolean, default: false },
      gstin: { type: String, uppercase: true, trim: true, default: "" },
      stateCode: { type: String, trim: true, default: "" },
      hsnPolicy: {
        declaredTurnoverBand: { type: String, default: "unspecified" },
        source: {
          type: String,
          enum: ["seeded", "user_declared"],
          default: "seeded",
        },
        confirmedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        confirmedAt: { type: Date, default: null },
      },
    },
    plan: {
      type: String,
      enum: ["basic", "anointed", "king"],
      default: "king",
    },
    billing: {
      subscriptionId: { type: mongoose.Schema.Types.ObjectId, default: null },
      entitlementPlanKey: { type: String, default: "king" },
      entitlementState: { type: String, default: "trialing" },
    },
    onboardingStep: { type: String, default: "complete" },
    onboardingCompletedAt: { type: Date, required: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

export const Business = mongoose.model("Business", businessSchema);
