import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    pendingEmail: { type: String, lowercase: true, trim: true, default: null },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    emailVerifiedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
    },
    lastLoginAt: { type: Date, default: null },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    trialUsedAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0, min: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model("User", userSchema);
