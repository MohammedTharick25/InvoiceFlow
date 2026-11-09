import { z } from "zod";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Use a valid YYYY-MM-DD date.");

export const reportQuerySchema = z
  .object({ from: calendarDate.optional(), to: calendarDate.optional() })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "The start date must be on or before the end date.",
  })
  .refine(
    (query) => {
      if (!query.from || !query.to) return true;
      return (
        (Date.parse(`${query.to}T00:00:00.000Z`) -
          Date.parse(`${query.from}T00:00:00.000Z`)) /
          86_400_000 <=
        366
      );
    },
    { message: "A report date range cannot exceed 367 calendar days." },
  );

export const reportTypes = [
  "sales",
  "payments",
  "outstanding",
  "overdue",
  "customer-balances",
];
