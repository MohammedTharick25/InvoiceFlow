import { z } from "zod";
import { MAX_MONEY_MINOR } from "../../utils/money.js";

const idempotencyKey = z.string().trim().min(8).max(128);

export const recordPaymentSchema = z
  .object({
    idempotencyKey,
    amountMinor: z.number().int().safe().min(1).max(Number(MAX_MONEY_MINOR)),
    paidAt: z.string().datetime({ offset: true }),
    method: z.enum(["cash", "bank_transfer", "upi", "card", "cheque", "other"]),
    reference: z.string().trim().max(120).optional().default(""),
    notes: z.string().trim().max(1000).optional().default(""),
  })
  .strict();

export const reversePaymentSchema = z
  .object({
    idempotencyKey,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const listPaymentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
