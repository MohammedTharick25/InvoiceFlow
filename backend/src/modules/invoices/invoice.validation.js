import { z } from "zod";
import {
  CURRENCY_DECIMALS,
  MAX_CHARGES,
  MAX_LINE_ITEMS,
  MAX_MONEY_MINOR,
  MAX_QUANTITY_MILLI,
} from "../../utils/money.js";
import { TAXABILITIES } from "../../utils/gst.js";

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
const id = z.string().regex(/^[a-f\d]{24}$/i);
const amount = z.number().int().safe().min(0).max(Number(MAX_MONEY_MINOR));
const quantity = z.number().int().safe().min(0).max(Number(MAX_QUANTITY_MILLI));
const discount = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }).strict(),
  z
    .object({
      type: z.literal("percent"),
      rateBp: z.number().int().min(0).max(10000),
    })
    .strict(),
  z.object({ type: z.literal("fixed"), amountMinor: amount }).strict(),
]);
const taxability = z.enum(TAXABILITIES);
const hsnSac = z
  .string()
  .max(8)
  .regex(/^(?:|\d{4}|\d{6}|\d{8})$/);

const itemSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    hsnSac: hsnSac.optional().default(""),
    unit: z.string().trim().min(1).max(30).optional().default("unit"),
    quantityMilli: quantity,
    unitPriceMinor: amount,
    discount: discount.optional().default({ type: "none" }),
    taxability,
    taxCode: z.string().trim().max(30).optional().default(""),
    taxabilityNote: z.string().trim().max(500).optional().default(""),
  })
  .strict();

const chargeSchema = z
  .object({
    type: z.enum(["shipping", "packing", "insurance", "other"]),
    description: z.string().trim().min(1).max(250),
    amountMinor: amount,
    hsnSac: hsnSac.optional().default(""),
    taxability,
    taxCode: z.string().trim().max(30).optional().default(""),
    taxabilityNote: z.string().trim().max(500).optional().default(""),
  })
  .strict();

const placeOfSupply = z
  .object({
    stateCode: z.string().regex(/^\d{2}$/),
    basis: z.enum([
      "customer_billing",
      "customer_registered",
      "ship_to",
      "business_location",
      "manual",
    ]),
    overridden: z.boolean().optional().default(false),
    note: z.string().trim().max(500).optional().default(""),
  })
  .strict();

const shipTo = z
  .object({
    address: z
      .object({
        line1: z.string().trim().max(160).optional().default(""),
        line2: z.string().trim().max(160).optional().default(""),
        city: z.string().trim().max(100).optional().default(""),
        state: z.string().trim().max(100).optional().default(""),
        stateCode: z
          .string()
          .regex(/^(|\d{2})$/)
          .optional()
          .default(""),
        postalCode: z.string().trim().max(20).optional().default(""),
        country: z.string().trim().max(80).optional().default("India"),
      })
      .strict(),
    stateCode: z.string().regex(/^\d{2}$/),
  })
  .strict();

export const createInvoiceSchema = z
  .object({
    customerId: id,
    issueDate: date.optional(),
    dueDate: date.optional().nullable(),
    taxPointDate: date.optional().nullable(),
    invoiceDiscountMinor: amount.optional().default(0),
    items: z.array(itemSchema).min(1).max(MAX_LINE_ITEMS),
    charges: z.array(chargeSchema).max(MAX_CHARGES).optional().default([]),
    placeOfSupply: placeOfSupply.optional().nullable(),
    shipTo: shipTo.optional().nullable(),
    otherSupply: z.boolean().optional().default(false),
    supplyNote: z.string().trim().max(500).optional().default(""),
    recipientContext: z.enum(["b2b", "b2c"]).optional(),
    recipientContextOverride: z
      .object({
        overridden: z.boolean(),
        reason: z.string().trim().max(500).optional().default(""),
      })
      .strict()
      .optional(),
    notes: z.string().trim().max(4000).optional().default(""),
    terms: z.string().trim().max(4000).optional().default(""),
  })
  .strict();

export const updateInvoiceSchema = createInvoiceSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const finalizeInvoiceSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(128),
    reverseCharge: z.enum(["not_applicable", "applies", "unsure"]).optional(),
    confirmPlaceOfSupply: z.boolean().optional(),
  })
  .strict();

export const markSentSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(128),
    via: z.enum(["handed_over", "own_email", "whatsapp", "post", "other"]),
    declaredAt: z.string().datetime({ offset: true }),
    note: z.string().trim().max(1000).optional().default(""),
  })
  .strict();

export const unmarkSentSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(128),
    note: z.string().trim().min(1).max(1000),
  })
  .strict();

export const clearAmountsSchema = z
  .object({
    confirmation: z.literal("CLEAR_AMOUNTS"),
  })
  .strict();

export const listInvoicesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum([
        "draft",
        "issued",
        "sent",
        "partially_paid",
        "paid",
        "cancelled",
        "overdue",
      ])
      .optional(),
    customerId: id.optional(),
    from: date.optional(),
    to: date.optional(),
    sort: z
      .enum(["issueDate", "dueDate", "createdAt", "totalMinor"])
      .default("issueDate"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().trim().max(100).optional().default(""),
  })
  .strict();

export const listDraftsQuerySchema = listInvoicesQuerySchema;

export function currencyDecimalPlaces(currency) {
  return CURRENCY_DECIMALS[currency];
}
