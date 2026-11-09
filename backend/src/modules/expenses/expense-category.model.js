import mongoose from "mongoose";

const expenseCategorySchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    archivedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

expenseCategorySchema.index({ businessId: 1, name: 1 }, { unique: true });

export const ExpenseCategory = mongoose.model(
  "ExpenseCategory",
  expenseCategorySchema,
);
