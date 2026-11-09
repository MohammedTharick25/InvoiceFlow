import { parseEnv } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";
import {
  cleanupExpenseReceiptStorage,
  cleanupInvoiceStorage,
} from "./modules/invoices/storage.service.js";
import { startReminderScheduler } from "./modules/scheduler/reminder.scheduler.js";
import { startBillingScheduler } from "./modules/scheduler/billing.scheduler.js";
import { startRecurringExpenseScheduler } from "./modules/scheduler/recurring-expense.scheduler.js";

const env = parseEnv();
await connectDatabase(env.MONGODB_URI);
try {
  await cleanupInvoiceStorage();
  await cleanupExpenseReceiptStorage();
} catch (error) {
  logger.warn({ err: error }, "Invoice PDF staging cleanup failed");
}
const server = createApp({ env }).listen(env.PORT, () =>
  logger.info({ port: env.PORT }, "InvoiceFlow API listening"),
);
const reminderScheduler = startReminderScheduler({ logger });
const billingScheduler = startBillingScheduler({ env, logger });
const recurringExpenseScheduler = startRecurringExpenseScheduler({ logger });

async function stop(signal) {
  logger.info({ signal }, "Shutting down");
  reminderScheduler.stop();
  billingScheduler.stop();
  recurringExpenseScheduler.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
