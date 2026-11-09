import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
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
    date: { type: Date, required: true },
    method: {
      type: String,
      enum: ["cash", "bank_transfer", "upi", "card", "cheque", "other"],
      required: true,
    },
    reference: { type: String, default: "", maxlength: 120 },
    receiptFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoredFile",
      default: null,
    },
    notes: { type: String, default: "", maxlength: 2000 },
    archivedAt: { type: Date, default: null },
    recurringExpenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecurringExpense",
      default: null,
    },
    recurringOccurrenceDate: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  { timestamps: true },
);

expenseSchema.index({ businessId: 1, archivedAt: 1, date: -1, _id: -1 });
expenseSchema.index({ businessId: 1, categoryId: 1, date: -1 });
expenseSchema.index(
  { recurringExpenseId: 1, recurringOccurrenceDate: 1 },
  {
    unique: true,
    name: "recurring_expense_occurrence_unique",
    partialFilterExpression: { recurringExpenseId: { $type: "objectId" } },
  },
);

export const Expense = mongoose.model("Expense", expenseSchema);
