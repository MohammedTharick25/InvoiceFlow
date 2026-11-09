import cron from "node-cron";
import { createRecurringExpenseService } from "../expenses/recurring-expense.service.js";
import { logger as defaultLogger } from "../../utils/logger.js";

export function startRecurringExpenseScheduler({
  logger = defaultLogger,
  now,
} = {}) {
  const service = createRecurringExpenseService({ now });
  const run = (trigger) =>
    service
      .runDue()
      .catch((error) =>
        logger.error(
          { err: error, trigger },
          "Recurring expense scheduler run failed",
        ),
      );
  void run("startup");
  const task = cron.schedule(
    "*/15 * * * *",
    () => void run("quarter_hour_tick"),
    { timezone: "UTC" },
  );
  return Object.freeze({ stop: () => task.stop() });
}
