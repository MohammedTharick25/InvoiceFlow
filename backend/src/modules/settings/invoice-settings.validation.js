import { z } from "zod";

export const updateInvoiceSettingsSchema = z
  .object({
    prefix: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9/-]{1,5}$/)
      .optional(),
    sequenceWidth: z.number().int().min(6).max(10).optional(),
    financialYearStartMonth: z.number().int().min(1).max(12).optional(),
    defaultTermsDays: z.number().int().min(0).max(365).optional(),
    defaultNotes: z.string().trim().max(4000).optional(),
    footer: z.string().trim().max(1000).optional(),
    template: z.enum(["classic", "compact"]).optional(),
    signatoryName: z.string().trim().max(160).optional(),
    declarations: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one setting to update.",
  });
