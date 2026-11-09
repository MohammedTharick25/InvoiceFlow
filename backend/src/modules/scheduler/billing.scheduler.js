import cron from "node-cron";
import { logger as defaultLogger } from "../../utils/logger.js";
import { createBillingService } from "../billing/billing.service.js";

export function startBillingScheduler({
  env,
  logger = defaultLogger,
  now,
} = {}) {
  const billing = createBillingService({ env, now });
  const run = async () => {
    try {
      await billing.sendTrialNotifications();
      await billing.expireTrials();
    } catch (error) {
      logger.error({ err: error }, "Billing trial scheduler run failed");
    }
  };
  void run();
  const task = cron.schedule("*/5 * * * *", () => void run(), {
    timezone: "UTC",
  });
  return Object.freeze({ stop: () => task.stop() });
}
