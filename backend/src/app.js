import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { corsOptions } from "./config/cors.js";
import { requestId } from "./middlewares/requestId.js";
import {
  createAuthRateLimiter,
  createGlobalRateLimiter,
} from "./middlewares/rateLimiter.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createBusinessRouter } from "./modules/businesses/business.routes.js";
import { createCustomerRouter } from "./modules/customers/customer.routes.js";
import { createSettingsRouter } from "./modules/settings/settings.routes.js";
import { createInvoiceRouter } from "./modules/invoices/invoice.routes.js";
import { createPaymentRouter } from "./modules/payments/payment.routes.js";
import {
  createExpenseCategoryRouter,
  createExpenseRouter,
  createRecurringExpenseRouter,
} from "./modules/expenses/expense.routes.js";
import { createReminderRouter } from "./modules/reminders/reminder.routes.js";
import { createNotificationRouter } from "./modules/notifications/notification.routes.js";
import { createReportRouter } from "./modules/reports/report.routes.js";
import { createBillingRouter } from "./modules/billing/billing.routes.js";
import { createRecordExportRouter } from "./modules/reports/record-export.routes.js";

export function createApp({
  env = { NODE_ENV: "development", FRONTEND_ORIGIN: "http://localhost:5173" },
  auth = {},
  onboarding = {},
  customers = {},
  invoices = {},
  expenses = {},
  billing = {},
} = {}) {
  const app = express();
  const authRateLimiter = createAuthRateLimiter({
    limit: env.NODE_ENV === "test" ? 1000 : 30,
  });
  const globalRateLimiter = createGlobalRateLimiter({
    limit: env.NODE_ENV === "test" ? 10000 : 120,
  });
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(
    cors(
      corsOptions(env.FRONTEND_ORIGIN, {
        allowLoopbackAliases: env.NODE_ENV !== "production",
      }),
    ),
  );
  app.use(requestId);
  app.use(
    express.json({
      limit: "1mb",
      strict: true,
      verify: (req, _res, buffer) => {
        req.rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(cookieParser());
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.once("finish", () =>
      req.log.info(
        {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        },
        "HTTP request",
      ),
    );
    next();
  });
  app.use(globalRateLimiter);

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.get("/api/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.use("/api/auth", authRateLimiter, createAuthRouter({ env, ...auth }));
  app.use("/api/businesses", createBusinessRouter({ env, ...onboarding }));
  app.use("/api/customers", createCustomerRouter({ env, ...customers }));
  app.use("/api/settings", createSettingsRouter({ env }));
  app.use("/api/invoices", createInvoiceRouter({ env, ...invoices }));
  app.use("/api/invoices", createPaymentRouter({ env }));
  app.use(
    "/api/expense-categories",
    createExpenseCategoryRouter({ env, ...expenses }),
  );
  app.use("/api/expenses", createExpenseRouter({ env, ...expenses }));
  app.use(
    "/api/recurring-expenses",
    createRecurringExpenseRouter({ env, ...expenses }),
  );
  app.use("/api/reminders", createReminderRouter({ env }));
  app.use("/api/notifications", createNotificationRouter({ env }));
  app.use("/api/reports", createReportRouter({ env }));
  app.use("/api/billing", createBillingRouter({ env, ...billing }));
  app.use("/api/export", createRecordExportRouter({ env }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp;
