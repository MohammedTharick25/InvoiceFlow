import mongoose from "mongoose";

const recurringExpenseSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      immutable: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: true,
    },
    vendor: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: {
      type: String,
      enum: ["INR", "USD", "EUR", "JPY", "KWD"],
      required: true,
      immutable: true,
    },
    method: {
      type: String,
      enum: ["cash", "bank_transfer", "upi", "card", "cheque", "other"],
      required: true,
    },
    frequency: { type: String, enum: ["weekly", "monthly"], required: true },
    nextRunAt: { type: Date, required: true },
    endAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  { timestamps: true },
);

recurringExpenseSchema.index({
  businessId: 1,
  archivedAt: 1,
  pausedAt: 1,
  nextRunAt: 1,
});
recurringExpenseSchema.index(
  { archivedAt: 1, pausedAt: 1, nextRunAt: 1 },
  { name: "recurring_expense_due_scheduler" },
);

export const RecurringExpense = mongoose.model(
  "RecurringExpense",
  recurringExpenseSchema,
);
