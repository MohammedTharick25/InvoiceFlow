import mongoose from "mongoose";

const storedFileSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      immutable: true,
    },
    purpose: {
      type: String,
      enum: ["logo", "receipt", "scan", "invoice_pdf"],
      required: true,
      immutable: true,
    },
    provider: {
      type: String,
      enum: ["local", "cloudinary"],
      required: true,
      immutable: true,
    },
    publicId: { type: String, required: true, immutable: true },
    deliveryType: {
      type: String,
      enum: ["authenticated", "private"],
      default: "private",
      immutable: true,
    },
    filename: { type: String, required: true, maxlength: 200, immutable: true },
    mime: { type: String, required: true, maxlength: 100, immutable: true },
    size: { type: Number, required: true, min: 1, immutable: true },
    sha256: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
      immutable: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  { timestamps: true },
);
storedFileSchema.index({ businessId: 1, purpose: 1, createdAt: -1 });

export const StoredFile = mongoose.model("StoredFile", storedFileSchema);
