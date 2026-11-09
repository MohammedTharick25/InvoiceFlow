import { z } from "zod";

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

export const appendTaxRateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{1,30}$/),
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["rate", "end"]),
    rateBp: z.number().int().min(1).max(10000).nullable().optional(),
    effectiveFrom: date.nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.kind === "rate" && input.rateBp == null)
      context.addIssue({
        code: "custom",
        path: ["rateBp"],
        message: "A rate version requires a basis-point rate.",
      });
    if (input.kind === "end" && input.rateBp != null)
      context.addIssue({
        code: "custom",
        path: ["rateBp"],
        message: "An end version cannot include a rate.",
      });
  });

export const listTaxRatesQuerySchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{1,30}$/)
      .optional(),
  })
  .strict();
