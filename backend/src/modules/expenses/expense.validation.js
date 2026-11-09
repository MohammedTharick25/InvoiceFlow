import { z } from "zod";
import { MAX_MONEY_MINOR } from "../../utils/money.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid calendar date.");
const method = z.enum([
  "cash",
  "bank_transfer",
  "upi",
  "card",
  "cheque",
  "other",
]);

const fields = {
  categoryId: objectId,
  vendor: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  amountMinor: z.number().int().safe().min(1).max(Number(MAX_MONEY_MINOR)),
  date,
  method,
  reference: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
};

export const createExpenseSchema = z.object(fields).strict();
export const updateExpenseSchema = z
  .object({
    categoryId: fields.categoryId.optional(),
    vendor: fields.vendor.optional(),
    description: fields.description.optional(),
    amountMinor: fields.amountMinor.optional(),
    date: fields.date.optional(),
    method: fields.method.optional(),
    reference: fields.reference.optional(),
    notes: fields.notes.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const listExpensesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    categoryId: objectId.optional(),
    from: date.optional(),
    to: date.optional(),
    search: z.string().trim().max(100).optional().default(""),
  })
  .strict();

export const createExpenseCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const updateExpenseCategorySchema = createExpenseCategorySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide a category name.",
  });
