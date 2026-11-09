import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true, maxlength: 160 },
    line2: { type: String, trim: true, maxlength: 160, default: "" },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    stateCode: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{2}$/,
    },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      default: "India",
    },
  },
  { _id: false },
);

const customerSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: "",
    },
    phone: { type: String, trim: true, maxlength: 32, default: "" },
    billingAddress: { type: addressSchema, required: true },
    shippingAddress: { type: addressSchema, default: undefined },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 15,
      default: "",
    },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    reminderPrefs: {
      enabled: { type: Boolean, required: true, default: false },
    },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

customerSchema.index({ businessId: 1, archivedAt: 1, name: 1 });
customerSchema.index({ businessId: 1, name: "text", email: "text" });

export const Customer = mongoose.model("Customer", customerSchema);
