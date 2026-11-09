import { z } from "zod";

const rule = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9_-]{1,40}$/),
    offsetDays: z.number().int().min(0).max(365),
    when: z.enum(["before_due", "on_due", "after_due"]),
  })
  .strict()
  .refine(
    (value) =>
      value.when === "on_due" ? value.offsetDays === 0 : value.offsetDays > 0,
    "Use zero days for an on-due rule and a positive offset for before/after rules.",
  );

export const updateReminderSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    confirmCancelPending: z.number().int().min(0).optional(),
    sendTimeLocal: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    schedule: z
      .array(rule)
      .max(10)
      .optional()
      .refine(
        (rules) =>
          !rules ||
          new Set(rules.map((item) => item.key)).size === rules.length,
        "Rule keys must be unique.",
      ),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "confirmCancelPending"),
    "Provide a reminder setting to update.",
  );

export const notificationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
