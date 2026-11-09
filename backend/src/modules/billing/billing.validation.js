import { z } from "zod";

export const planChangeSchema = z
  .object({
    planKey: z.enum(["basic", "anointed", "king"]),
    interval: z.enum(["month", "year"]),
  })
  .strict();

export const cancelSubscriptionSchema = z
  .object({
    confirm: z.literal(true),
  })
  .strict();

export const checkoutVerificationSchema = z
  .object({
    razorpay_payment_id: z.string().min(1).max(128),
    razorpay_subscription_id: z.string().min(1).max(128),
    razorpay_signature: z.string().regex(/^[a-f\d]{64}$/i),
  })
  .strict();
