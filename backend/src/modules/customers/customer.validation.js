import { z } from "zod";
import stateData from "../../config/gst-state-codes.json" with { type: "json" };
import { isValidGstin } from "../../utils/gst.js";

const knownStateCodes = new Set(stateData.states.map(({ code }) => code));

const stateCode = z
  .string()
  .trim()
  .regex(/^\d{2}$/)
  .refine(
    (code) => knownStateCodes.has(code),
    "Choose a configured state code.",
  );

const customerAddressSchema = z
  .object({
    line1: z.string().trim().min(1).max(160),
    line2: z.string().trim().max(160).optional().default(""),
    city: z.string().trim().min(1).max(100),
    stateCode,
    postalCode: z.string().trim().min(1).max(20),
    country: z.string().trim().min(1).max(80).optional().default("India"),
  })
  .strict();

const email = z
  .string()
  .trim()
  .max(254)
  .email()
  .or(z.literal(""))
  .transform((value) => value.toLowerCase());

const gstin = z
  .string()
  .trim()
  .max(15)
  .transform((value) => value.toUpperCase());

const customerFields = {
  name: z.string().trim().min(1).max(160),
  email: email.optional().default(""),
  phone: z.string().trim().max(32).optional().default(""),
  billingAddress: customerAddressSchema,
  shippingAddress: customerAddressSchema.optional(),
  gstin: gstin.optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  reminderPrefs: z
    .object({ enabled: z.boolean().optional().default(false) })
    .strict()
    .optional()
    .default({ enabled: false }),
};

function validateGstinForSuppliedState(customer, context) {
  if (!customer.gstin || !customer.billingAddress?.stateCode) return;
  if (!isValidGstin(customer.gstin, customer.billingAddress.stateCode)) {
    context.addIssue({
      code: "custom",
      path: ["gstin"],
      message: "Enter a valid GSTIN that starts with the billing state code.",
    });
  }
}

export const createCustomerSchema = z
  .object(customerFields)
  .strict()
  .superRefine(validateGstinForSuppliedState);

export const updateCustomerSchema = z
  .object({
    name: customerFields.name.optional(),
    email: email.optional(),
    phone: z.string().trim().max(32).optional(),
    billingAddress: customerAddressSchema.optional(),
    shippingAddress: customerAddressSchema.nullable().optional(),
    gstin: gstin.optional(),
    notes: z.string().trim().max(2000).optional(),
    reminderPrefs: z.object({ enabled: z.boolean() }).strict().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  })
  .superRefine(validateGstinForSuppliedState);

export const listCustomersQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional().default(""),
    page: z.coerce.number().int().min(1).max(100000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export function isConfiguredStateCode(code) {
  return knownStateCodes.has(code);
}
