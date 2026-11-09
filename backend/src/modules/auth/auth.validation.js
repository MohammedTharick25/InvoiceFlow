import { z } from "zod";

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const password = z.string().min(12).max(72);

export const registerSchema = z
  .object({
    email,
    password,
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(30).optional().default(""),
  })
  .strict();

export const loginSchema = z
  .object({ email, password: z.string().min(1).max(72) })
  .strict();
export const emailSchema = z.object({ email }).strict();
export const tokenSchema = z
  .object({ token: z.string().min(32).max(200) })
  .strict();
export const resetPasswordSchema = tokenSchema.extend({ password }).strict();
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(72), password })
  .strict();
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(30),
    theme: z.enum(["light", "dark", "system"]),
  })
  .strict();
export const emailChangeSchema = z
  .object({ email, password: z.string().min(1).max(72) })
  .strict();

export const onboardingSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    type: z.enum(["individual", "company", "partnership", "other"]),
    email: z.string().trim().email().max(254).optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional().default(""),
    address: z
      .object({
        line1: z.string().trim().max(160).optional().default(""),
        line2: z.string().trim().max(160).optional().default(""),
        city: z.string().trim().max(100).optional().default(""),
        state: z.string().trim().max(100).optional().default(""),
        stateCode: z
          .string()
          .trim()
          .regex(/^(|\d{2})$/)
          .optional()
          .default(""),
        postalCode: z.string().trim().max(20).optional().default(""),
        country: z.string().trim().max(80).optional().default("India"),
      })
      .strict()
      .optional()
      .default({}),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .default("Asia/Kolkata"),
    currency: z
      .enum(["INR", "USD", "EUR", "JPY", "KWD"])
      .optional()
      .default("INR"),
    tax: z
      .object({
        gstRegistered: z.boolean().optional().default(false),
        gstin: z.string().trim().max(15).optional().default(""),
        stateCode: z
          .string()
          .trim()
          .regex(/^(|\d{2})$/)
          .optional()
          .default(""),
        declaredTurnoverBand: z
          .enum([
            "unspecified",
            "declared_band_1",
            "declared_band_2",
            "declared_band_3",
          ])
          .optional()
          .default("unspecified"),
      })
      .strict()
      .optional()
      .default({}),
  })
  .strict();

export const currencySchema = z
  .object({ currency: z.enum(["INR", "USD", "EUR", "JPY", "KWD"]) })
  .strict();
