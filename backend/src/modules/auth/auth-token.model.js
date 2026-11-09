import mongoose from "mongoose";

const authTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["verify_email", "reset_password"],
      required: true,
    },
    targetEmail: { type: String, lowercase: true, trim: true, default: null },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authTokenSchema.index({ userId: 1, type: 1, usedAt: 1 });

export const AuthToken = mongoose.model("AuthToken", authTokenSchema);
