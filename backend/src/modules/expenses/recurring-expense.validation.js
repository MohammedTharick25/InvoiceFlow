import { z } from "zod";
import { MAX_MONEY_MINOR } from "../../utils/money.js";

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
export const recurringExpenseSchema = z
  .object({
    categoryId: z.string().regex(/^[a-f\d]{24}$/i),
    vendor: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    amountMinor: z.number().int().safe().min(1).max(Number(MAX_MONEY_MINOR)),
    method: z.enum(["cash", "bank_transfer", "upi", "card", "cheque", "other"]),
    frequency: z.enum(["weekly", "monthly"]),
    nextRunAt: date,
    endAt: date.optional().nullable(),
  })
  .strict()
  .refine((value) => !value.endAt || value.endAt >= value.nextRunAt, {
    message: "End date must be on or after the first occurrence.",
    path: ["endAt"],
  });

export const recurringExpenseStateSchema = z
  .object({ paused: z.boolean() })
  .strict();

export const recurringExpenseUpdateSchema = z
  .object({
    categoryId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .optional(),
    vendor: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    amountMinor: z
      .number()
      .int()
      .safe()
      .min(1)
      .max(Number(MAX_MONEY_MINOR))
      .optional(),
    method: z
      .enum(["cash", "bank_transfer", "upi", "card", "cheque", "other"])
      .optional(),
    frequency: z.enum(["weekly", "monthly"]).optional(),
    nextRunAt: date.optional(),
    endAt: date.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
