import cron from "node-cron";
import { createReminderService } from "../reminders/reminder.service.js";
import { logger as defaultLogger } from "../../utils/logger.js";

export function startReminderScheduler({ logger = defaultLogger, now } = {}) {
  const reminders = createReminderService({ now });
  const run = (trigger) =>
    reminders
      .runSweep({ ownerId: `scheduler-${process.pid}` })
      .catch((error) =>
        logger.error({ err: error, trigger }, "Reminder scheduler run failed"),
      );
  void run("startup");
  const task = cron.schedule("* * * * *", () => void run("minute_tick"), {
    timezone: "UTC",
  });
  return Object.freeze({ stop: () => task.stop() });
}
