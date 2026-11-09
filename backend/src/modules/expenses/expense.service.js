import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { basename } from "node:path";
import { ApiError } from "../../utils/ApiError.js";
import { dateAtUtcMidnight } from "../../utils/clock.js";
import { now as systemNow } from "../../utils/clock.js";
import { ActivityLog } from "../activity-logs/activity-log.model.js";
import { Business } from "../businesses/business.model.js";
import { StoredFile } from "../invoices/stored-file.model.js";
import { ExpenseCategory } from "./expense-category.model.js";
import { Expense } from "./expense.model.js";

function notFound() {
  return new ApiError(
    404,
    "NOT_FOUND",
    "The requested resource was not found.",
  );
}

function idString(value) {
  return value == null ? null : value.toString();
}

function serializeCategory(category) {
  return {
    id: idString(category._id),
    name: category.name,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function serializeExpense(expense, category) {
  return {
    id: idString(expense._id),
    categoryId: idString(expense.categoryId),
    category: category ? serializeCategory(category) : null,
    vendor: expense.vendor,
    description: expense.description,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    date: expense.date?.toISOString().slice(0, 10),
    method: expense.method,
    reference: expense.reference,
    receipt: expense.receiptFileId ? { available: true } : null,
    notes: expense.notes,
    archivedAt: expense.archivedAt,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

function audit({
  businessId,
  userId,
  action,
  entityType,
  entityId,
  before,
  after,
  ip,
  at,
  session,
}) {
  return ActivityLog.create(
    [
      {
        businessId,
        actorId: userId,
        action,
        entityType,
        entityId,
        before: before ?? null,
        after: after ?? null,
        ip: (ip ?? "").slice(0, 100),
        at,
      },
    ],
    { session },
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeFilename(value) {
  const name = basename(String(value ?? "receipt"))
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 180);
  return name || "receipt";
}

function detectReceiptMime(buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return "image/jpeg";
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  return null;
}

export function createExpenseService({ now = systemNow, storage } = {}) {
  async function activeCategory({ businessId, categoryId, session }) {
    if (!mongoose.isValidObjectId(categoryId)) throw notFound();
    const category = await ExpenseCategory.findOne({
      _id: categoryId,
      businessId,
      archivedAt: null,
    }).session(session ?? null);
    if (!category)
      throw new ApiError(
        422,
        "EXPENSE_CATEGORY_INVALID",
        "Choose an active category for this expense.",
      );
    return category;
  }

  async function createCategory({ businessId, userId, name, ip }) {
    const at = now();
    const session = await mongoose.startSession();
    let created;
    try {
      await session.withTransaction(async () => {
        const [category] = await ExpenseCategory.create(
          [{ businessId, name, createdBy: userId, archivedAt: null }],
          { session },
        );
        await audit({
          businessId,
          userId,
          action: "expense_category.created",
          entityType: "expense_category",
          entityId: category._id,
          after: serializeCategory(category),
          ip,
          at,
          session,
        });
        created = serializeCategory(category);
      });
    } catch (error) {
      if (error?.code === 11000)
        throw new ApiError(
          409,
          "EXPENSE_CATEGORY_EXISTS",
          "A category with this name already exists.",
        );
      throw error;
    } finally {
      await session.endSession();
    }
    return created;
  }

  async function listCategories({ businessId }) {
    const categories = await ExpenseCategory.find({
      businessId,
      archivedAt: null,
    })
      .sort({ name: 1 })
      .collation({ locale: "en", strength: 2 })
      .lean();
    return { categories: categories.map(serializeCategory) };
  }

  async function updateCategory({ businessId, categoryId, userId, name, ip }) {
    if (!mongoose.isValidObjectId(categoryId)) throw notFound();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const category = await ExpenseCategory.findOne({
          _id: categoryId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!category) throw notFound();
        const before = serializeCategory(category);
        category.name = name;
        await category.save({ session });
        result = serializeCategory(category);
        await audit({
          businessId,
          userId,
          action: "expense_category.updated",
          entityType: "expense_category",
          entityId: category._id,
          before,
          after: result,
          ip,
          at: now(),
          session,
        });
      });
    } catch (error) {
      if (error?.code === 11000)
        throw new ApiError(
          409,
          "EXPENSE_CATEGORY_EXISTS",
          "A category with this name already exists.",
        );
      throw error;
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function archiveCategory({ businessId, categoryId, userId, ip }) {
    if (!mongoose.isValidObjectId(categoryId)) throw notFound();
    const at = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const category = await ExpenseCategory.findOne({
          _id: categoryId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!category) throw notFound();
        const before = serializeCategory(category);
        category.archivedAt = at;
        await category.save({ session });
        result = { id: idString(category._id), archivedAt: at };
        await audit({
          businessId,
          userId,
          action: "expense_category.archived",
          entityType: "expense_category",
          entityId: category._id,
          before,
          after: result,
          ip,
          at,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function create({ businessId, userId, input, ip }) {
    const at = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const business = await Business.findById(businessId).session(session);
        if (!business) throw notFound();
        const category = await activeCategory({
          businessId,
          categoryId: input.categoryId,
          session,
        });
        const [expense] = await Expense.create(
          [
            {
              ...input,
              businessId,
              currency: business.currency,
              date: dateAtUtcMidnight(input.date),
              createdBy: userId,
              archivedAt: null,
            },
          ],
          { session },
        );
        const locked = await Business.updateOne(
          { _id: businessId, currencyVersion: business.currencyVersion },
          {
            $set: {
              hasFinalizedRecords: true,
              currencyLockedAt: business.currencyLockedAt ?? at,
            },
          },
          { session },
        );
        if (!locked.matchedCount)
          throw new ApiError(
            409,
            "CURRENCY_MISMATCH",
            "Business currency changed while recording the expense. Reload and try again.",
          );
        const after = serializeExpense(expense, category);
        await audit({
          businessId,
          userId,
          action: "expense.created",
          entityType: "expense",
          entityId: expense._id,
          after,
          ip,
          at,
          session,
        });
        result = after;
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function list({
    businessId,
    page,
    limit,
    categoryId,
    from,
    to,
    search,
  }) {
    const filter = { businessId, archivedAt: null };
    if (categoryId) filter.categoryId = categoryId;
    if (from || to)
      filter.date = {
        ...(from ? { $gte: dateAtUtcMidnight(from) } : {}),
        ...(to ? { $lte: dateAtUtcMidnight(to) } : {}),
      };
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { vendor: regex },
        { description: regex },
        { reference: regex },
      ];
    }
    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .sort({ date: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Expense.countDocuments(filter),
    ]);
    const categoryIds = [
      ...new Set(expenses.map((expense) => idString(expense.categoryId))),
    ];
    const categories = await ExpenseCategory.find({
      businessId,
      _id: { $in: categoryIds },
    }).lean();
    const byId = new Map(
      categories.map((category) => [idString(category._id), category]),
    );
    return {
      expenses: expenses.map((expense) =>
        serializeExpense(expense, byId.get(idString(expense.categoryId))),
      ),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async function get({ businessId, expenseId }) {
    if (!mongoose.isValidObjectId(expenseId)) throw notFound();
    const expense = await Expense.findOne({
      _id: expenseId,
      businessId,
      archivedAt: null,
    }).lean();
    if (!expense) throw notFound();
    const category = await ExpenseCategory.findOne({
      _id: expense.categoryId,
      businessId,
    }).lean();
    return serializeExpense(expense, category);
  }

  async function update({ businessId, expenseId, userId, input, ip }) {
    if (!mongoose.isValidObjectId(expenseId)) throw notFound();
    const session = await mongoose.startSession();
    const at = now();
    let result;
    try {
      await session.withTransaction(async () => {
        const expense = await Expense.findOne({
          _id: expenseId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!expense) throw notFound();
        const before = serializeExpense(expense);
        if (input.categoryId)
          await activeCategory({
            businessId,
            categoryId: input.categoryId,
            session,
          });
        for (const [key, value] of Object.entries(input)) {
          if (key === "date") expense.date = dateAtUtcMidnight(value);
          else expense[key] = value;
        }
        expense.updatedAt = at;
        await expense.save({ session });
        const category = await ExpenseCategory.findOne({
          _id: expense.categoryId,
          businessId,
        }).session(session);
        result = serializeExpense(expense, category);
        await audit({
          businessId,
          userId,
          action: "expense.updated",
          entityType: "expense",
          entityId: expense._id,
          before,
          after: result,
          ip,
          at,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function archive({ businessId, expenseId, userId, ip }) {
    if (!mongoose.isValidObjectId(expenseId)) throw notFound();
    const at = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const expense = await Expense.findOne({
          _id: expenseId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!expense) throw notFound();
        const category = await ExpenseCategory.findOne({
          _id: expense.categoryId,
          businessId,
        }).session(session);
        const before = serializeExpense(expense, category);
        expense.archivedAt = at;
        await expense.save({ session });
        result = { id: idString(expense._id), archivedAt: at };
        await audit({
          businessId,
          userId,
          action: "expense.archived",
          entityType: "expense",
          entityId: expense._id,
          before,
          after: result,
          ip,
          at,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function uploadReceipt({ businessId, expenseId, userId, file, ip }) {
    if (!mongoose.isValidObjectId(expenseId)) throw notFound();
    if (!file?.buffer?.length)
      throw new ApiError(
        422,
        "RECEIPT_REQUIRED",
        "Choose a receipt file to upload.",
      );
    const detectedMime = detectReceiptMime(file.buffer);
    if (!detectedMime || detectedMime !== file.mimetype)
      throw new ApiError(
        422,
        "RECEIPT_TYPE_INVALID",
        "Use a valid JPEG, PNG, WebP, or PDF receipt.",
      );
    const maxBytes =
      detectedMime === "application/pdf" ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxBytes)
      throw new ApiError(
        413,
        "RECEIPT_TOO_LARGE",
        "The receipt file exceeds the size limit.",
        { maxBytes },
      );
    if (!storage?.stage || !storage?.promote || !storage?.read)
      throw new ApiError(
        503,
        "RECEIPT_STORAGE_UNAVAILABLE",
        "Receipt storage is not available.",
      );
    const filename = safeFilename(file.originalname);
    const staged = await storage.stage({
      buffer: file.buffer,
      filename,
      mimeType: detectedMime,
      businessId: idString(businessId),
      purpose: "receipt",
    });
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const at = now();
    const session = await mongoose.startSession();
    let result;
    let previousFile;
    try {
      // Promote before committing metadata so a successful DB commit never
      // points at a receipt that has not reached its durable storage location.
      await storage.promote(staged);
      await session.withTransaction(async () => {
        const expense = await Expense.findOne({
          _id: expenseId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!expense) throw notFound();
        const before = { receiptFileId: idString(expense.receiptFileId) };
        if (expense.receiptFileId) {
          previousFile = await StoredFile.findOne({
            _id: expense.receiptFileId,
            businessId,
            purpose: "receipt",
          }).session(session);
          if (previousFile)
            await StoredFile.deleteOne(
              { _id: previousFile._id, businessId },
              { session },
            );
        }
        const [storedFile] = await StoredFile.create(
          [
            {
              businessId,
              purpose: "receipt",
              provider: storage.name ?? "local",
              publicId: staged.id,
              deliveryType:
                storage.name === "cloudinary" ? "authenticated" : "private",
              filename,
              mime: detectedMime,
              size: file.size,
              sha256,
              uploadedBy: userId,
            },
          ],
          { session },
        );
        expense.receiptFileId = storedFile._id;
        expense.updatedAt = at;
        await expense.save({ session });
        await audit({
          businessId,
          userId,
          action: "expense.receipt_uploaded",
          entityType: "expense",
          entityId: expense._id,
          before,
          after: {
            receiptFileId: idString(storedFile._id),
            size: file.size,
            mime: detectedMime,
          },
          ip,
          at,
          session,
        });
        result = {
          id: idString(storedFile._id),
          filename,
          mime: detectedMime,
          size: file.size,
        };
      });
    } catch (error) {
      await storage.remove?.(staged).catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
    if (previousFile)
      await storage.remove({ id: previousFile.publicId }).catch(() => {});
    return result;
  }

  async function downloadReceipt({ businessId, expenseId }) {
    if (!mongoose.isValidObjectId(expenseId)) throw notFound();
    const expense = await Expense.findOne({
      _id: expenseId,
      businessId,
      archivedAt: null,
    }).lean();
    if (!expense?.receiptFileId) throw notFound();
    const file = await StoredFile.findOne({
      _id: expense.receiptFileId,
      businessId,
      purpose: "receipt",
    }).lean();
    if (!file) throw notFound();
    if (!storage?.read)
      throw new ApiError(
        503,
        "RECEIPT_STORAGE_UNAVAILABLE",
        "Receipt storage is not available.",
      );
    const buffer = await storage.read(file.publicId);
    if (createHash("sha256").update(buffer).digest("hex") !== file.sha256)
      throw new ApiError(
        500,
        "RECEIPT_INTEGRITY_FAILED",
        "The stored receipt failed its integrity check.",
      );
    return { buffer, filename: file.filename, mime: file.mime };
  }

  async function removeReceipt({ businessId, expenseId, userId, ip }) {
    if (!mongoose.isValidObjectId(expenseId)) throw notFound();
    const session = await mongoose.startSession();
    const at = now();
    let oldFile;
    try {
      await session.withTransaction(async () => {
        const expense = await Expense.findOne({
          _id: expenseId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!expense?.receiptFileId) throw notFound();
        oldFile = await StoredFile.findOne({
          _id: expense.receiptFileId,
          businessId,
          purpose: "receipt",
        }).session(session);
        const before = { receiptFileId: idString(expense.receiptFileId) };
        expense.receiptFileId = null;
        expense.updatedAt = at;
        await expense.save({ session });
        if (oldFile)
          await StoredFile.deleteOne(
            { _id: oldFile._id, businessId },
            { session },
          );
        await audit({
          businessId,
          userId,
          action: "expense.receipt_removed",
          entityType: "expense",
          entityId: expense._id,
          before,
          after: { receiptFileId: null },
          ip,
          at,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    if (oldFile) await storage.remove({ id: oldFile.publicId }).catch(() => {});
    return { removed: true };
  }

  return {
    createCategory,
    listCategories,
    updateCategory,
    archiveCategory,
    create,
    list,
    get,
    update,
    archive,
    uploadReceipt,
    downloadReceipt,
    removeReceipt,
  };
}
