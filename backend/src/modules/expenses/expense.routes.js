import multer from "multer";
import { resolve } from "node:path";
import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { requireFeature, requireWritable } from "../../middlewares/billing.js";
import { ApiError } from "../../utils/ApiError.js";
import { createExpenseReceiptStorageProvider } from "../invoices/storage.service.js";
import { createExpenseService } from "./expense.service.js";
import { createRecurringExpenseService } from "./recurring-expense.service.js";
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
} from "./expense.validation.js";
import {
  recurringExpenseSchema,
  recurringExpenseStateSchema,
  recurringExpenseUpdateSchema,
} from "./recurring-expense.validation.js";

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "The request contains invalid fields.",
      result.error.flatten(),
    );
  return result.data;
}

function validateId(req, _res, next, id) {
  if (!/^[a-f\d]{24}$/i.test(id))
    return next(
      new ApiError(404, "NOT_FOUND", "The requested resource was not found."),
    );
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
});

function parseReceiptUpload(req, res, next) {
  upload.single("receipt")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE")
      return next(
        new ApiError(
          413,
          "RECEIPT_TOO_LARGE",
          "The receipt file exceeds the size limit.",
        ),
      );
    next(
      new ApiError(
        422,
        "RECEIPT_UPLOAD_INVALID",
        "Choose one valid receipt file.",
      ),
    );
  });
}

function sendReceipt(res, file) {
  const filename = file.filename.replace(/[\r\n"\\]/g, "_");
  res.set("Cache-Control", "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Type", file.mime);
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(file.buffer);
}

export function createExpenseRouter({ env, now, storage } = {}) {
  const router = Router();
  const receiptStorage =
    storage ??
    createExpenseReceiptStorageProvider({
      env,
      root: resolve(process.cwd(), "uploads", "receipts"),
    });
  const expenses = createExpenseService({ now, storage: receiptStorage });
  router.use(authenticate({ env, now }), tenantContext);
  router.use(requireFeature("expenses", { now }));
  const receiptsEnabled = requireFeature("receipts", { now });
  const writable = requireWritable({ now });
  router.use((req, res, next) =>
    req.method === "GET" ? next() : writable(req, res, next),
  );
  router.param("expenseId", validateId);

  router.get(
    "/",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      const query = parse(listExpensesQuerySchema, req.query);
      res.json(await expenses.list({ businessId: req.businessId, ...query }));
    }),
  );

  router.post(
    "/",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      const input = parse(createExpenseSchema, req.body);
      res.status(201).json({
        expense: await expenses.create({
          businessId: req.businessId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      });
    }),
  );

  router.get(
    "/:expenseId/receipt",
    authorize("expense_write"),
    receiptsEnabled,
    asyncHandler(async (req, res) => {
      sendReceipt(
        res,
        await expenses.downloadReceipt({
          businessId: req.businessId,
          expenseId: req.params.expenseId,
        }),
      );
    }),
  );

  router.post(
    "/:expenseId/receipt",
    authorize("expense_write"),
    receiptsEnabled,
    parseReceiptUpload,
    asyncHandler(async (req, res) => {
      res.status(201).json({
        receipt: await expenses.uploadReceipt({
          businessId: req.businessId,
          expenseId: req.params.expenseId,
          userId: req.auth.userId,
          file: req.file,
          ip: req.ip,
        }),
      });
    }),
  );

  router.delete(
    "/:expenseId/receipt",
    authorize("expense_write"),
    receiptsEnabled,
    asyncHandler(async (req, res) => {
      res.json(
        await expenses.removeReceipt({
          businessId: req.businessId,
          expenseId: req.params.expenseId,
          userId: req.auth.userId,
          ip: req.ip,
        }),
      );
    }),
  );

  router.get(
    "/:expenseId",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      res.json({
        expense: await expenses.get({
          businessId: req.businessId,
          expenseId: req.params.expenseId,
        }),
      });
    }),
  );

  router.patch(
    "/:expenseId",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      const input = parse(updateExpenseSchema, req.body);
      res.json({
        expense: await expenses.update({
          businessId: req.businessId,
          expenseId: req.params.expenseId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      });
    }),
  );

  router.delete(
    "/:expenseId",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      res.json({
        expense: await expenses.archive({
          businessId: req.businessId,
          expenseId: req.params.expenseId,
          userId: req.auth.userId,
          ip: req.ip,
        }),
      });
    }),
  );

  return router;
}

export function createExpenseCategoryRouter({ env, now } = {}) {
  const router = Router();
  const expenses = createExpenseService({ now });
  router.use(authenticate({ env, now }), tenantContext);
  router.use(requireFeature("expenses", { now }));
  const writable = requireWritable({ now });
  router.use((req, res, next) =>
    req.method === "GET" ? next() : writable(req, res, next),
  );

  router.get(
    "/",
    authorize("expense_write"),
    asyncHandler(async (req, res) =>
      res.json(await expenses.listCategories({ businessId: req.businessId })),
    ),
  );

  router.post(
    "/",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      const { name } = parse(createExpenseCategorySchema, req.body);
      res.status(201).json({
        category: await expenses.createCategory({
          businessId: req.businessId,
          userId: req.auth.userId,
          name,
          ip: req.ip,
        }),
      });
    }),
  );

  router.patch(
    "/:categoryId",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      if (!/^[a-f\d]{24}$/i.test(req.params.categoryId))
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found.",
        );
      const { name } = parse(updateExpenseCategorySchema, req.body);
      res.json({
        category: await expenses.updateCategory({
          businessId: req.businessId,
          categoryId: req.params.categoryId,
          userId: req.auth.userId,
          name,
          ip: req.ip,
        }),
      });
    }),
  );

  router.delete(
    "/:categoryId",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      if (!/^[a-f\d]{24}$/i.test(req.params.categoryId))
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found.",
        );
      res.json({
        category: await expenses.archiveCategory({
          businessId: req.businessId,
          categoryId: req.params.categoryId,
          userId: req.auth.userId,
          ip: req.ip,
        }),
      });
    }),
  );
  return router;
}

export function createRecurringExpenseRouter({ env, now } = {}) {
  const router = Router();
  const service = createRecurringExpenseService({ now });
  router.use(
    authenticate({ env, now }),
    tenantContext,
    requireFeature("expenses", { now }),
  );
  const writable = requireWritable({ now });
  router.use((req, res, next) =>
    req.method === "GET" ? next() : writable(req, res, next),
  );
  router.get(
    "/",
    authorize("expense_write"),
    asyncHandler(async (req, res) =>
      res.json(await service.list({ businessId: req.businessId })),
    ),
  );
  router.post(
    "/",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      const input = parse(recurringExpenseSchema, req.body);
      res.status(201).json({
        recurringExpense: await service.create({
          businessId: req.businessId,
          userId: req.auth.userId,
          input,
          ip: req.ip,
        }),
      });
    }),
  );
  router.patch(
    "/:ruleId",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      const { paused } = parse(recurringExpenseStateSchema, req.body);
      res.json({
        recurringExpense: await service.setPaused({
          businessId: req.businessId,
          userId: req.auth.userId,
          ruleId: req.params.ruleId,
          paused,
          ip: req.ip,
        }),
      });
    }),
  );
  router.put(
    "/:ruleId",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      const input = parse(recurringExpenseUpdateSchema, req.body);
      res.json({
        recurringExpense: await service.update({
          businessId: req.businessId,
          userId: req.auth.userId,
          ruleId: req.params.ruleId,
          input,
          ip: req.ip,
        }),
      });
    }),
  );
  router.delete(
    "/:ruleId",
    authorize("expense_write"),
    asyncHandler(async (req, res) => {
      res.json({
        recurringExpense: await service.archive({
          businessId: req.businessId,
          userId: req.auth.userId,
          ruleId: req.params.ruleId,
          ip: req.ip,
        }),
      });
    }),
  );
  return router;
}
