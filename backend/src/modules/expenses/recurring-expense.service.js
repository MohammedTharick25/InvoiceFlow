import mongoose from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { dateAtUtcMidnight } from "../../utils/clock.js";
import { ActivityLog } from "../activity-logs/activity-log.model.js";
import { Business } from "../businesses/business.model.js";
import { ExpenseCategory } from "./expense-category.model.js";
import { Expense } from "./expense.model.js";
import { RecurringExpense } from "./recurring-expense.model.js";
import { Subscription } from "../billing/subscription.model.js";
import { evaluateEntitlements } from "../billing/entitlements.service.js";

const notFound = () =>
  new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
const serialize = (row) => ({
  id: row._id.toString(),
  categoryId: row.categoryId.toString(),
  vendor: row.vendor,
  description: row.description,
  amountMinor: row.amountMinor,
  currency: row.currency,
  method: row.method,
  frequency: row.frequency,
  nextRunAt: row.nextRunAt.toISOString().slice(0, 10),
  endAt: row.endAt?.toISOString().slice(0, 10) ?? null,
  paused: Boolean(row.pausedAt),
  archivedAt: row.archivedAt,
});

export function nextOccurrence(date, frequency) {
  const next = new Date(`${date}T00:00:00.000Z`);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next;
}

export function createRecurringExpenseService({ now = () => new Date() } = {}) {
  async function list({ businessId }) {
    const rows = await RecurringExpense.find({ businessId, archivedAt: null })
      .sort({ nextRunAt: 1, _id: 1 })
      .lean();
    return { recurringExpenses: rows.map(serialize) };
  }

  async function create({ businessId, userId, input, ip }) {
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const business = await Business.findById(businessId).session(session);
        const category = await ExpenseCategory.findOne({
          _id: input.categoryId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!business) throw notFound();
        if (!category)
          throw new ApiError(
            422,
            "EXPENSE_CATEGORY_INVALID",
            "Choose an active category for this expense.",
          );
        const [rule] = await RecurringExpense.create(
          [
            {
              ...input,
              businessId,
              currency: business.currency,
              nextRunAt: dateAtUtcMidnight(input.nextRunAt),
              endAt: input.endAt ? dateAtUtcMidnight(input.endAt) : null,
              pausedAt: null,
              archivedAt: null,
              createdBy: userId,
            },
          ],
          { session },
        );
        await ActivityLog.create(
          [
            {
              businessId,
              actorId: userId,
              action: "recurring_expense.created",
              entityType: "recurring_expense",
              entityId: rule._id,
              after: serialize(rule),
              ip: (ip ?? "").slice(0, 100),
              at: now(),
            },
          ],
          { session },
        );
        result = serialize(rule);
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function setPaused({ businessId, userId, ruleId, paused, ip }) {
    if (!mongoose.isValidObjectId(ruleId)) throw notFound();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const rule = await RecurringExpense.findOne({
          _id: ruleId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!rule) throw notFound();
        const before = serialize(rule);
        rule.pausedAt = paused ? (rule.pausedAt ?? now()) : null;
        await rule.save({ session });
        result = serialize(rule);
        await ActivityLog.create(
          [
            {
              businessId,
              actorId: userId,
              action: paused
                ? "recurring_expense.paused"
                : "recurring_expense.resumed",
              entityType: "recurring_expense",
              entityId: rule._id,
              before,
              after: result,
              ip: (ip ?? "").slice(0, 100),
              at: now(),
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function update({ businessId, userId, ruleId, input, ip }) {
    if (!mongoose.isValidObjectId(ruleId)) throw notFound();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const rule = await RecurringExpense.findOne({
          _id: ruleId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!rule) throw notFound();
        if (input.categoryId) {
          const category = await ExpenseCategory.findOne({
            _id: input.categoryId,
            businessId,
            archivedAt: null,
          }).session(session);
          if (!category)
            throw new ApiError(
              422,
              "EXPENSE_CATEGORY_INVALID",
              "Choose an active category for this expense.",
            );
        }
        const before = serialize(rule);
        Object.assign(rule, input);
        if (input.nextRunAt)
          rule.nextRunAt = dateAtUtcMidnight(input.nextRunAt);
        if (input.endAt !== undefined)
          rule.endAt = input.endAt ? dateAtUtcMidnight(input.endAt) : null;
        if (rule.endAt && rule.endAt < rule.nextRunAt)
          throw new ApiError(
            422,
            "RECURRING_EXPENSE_END_DATE_INVALID",
            "End date must be on or after the next occurrence.",
          );
        await rule.save({ session });
        result = serialize(rule);
        await ActivityLog.create(
          [
            {
              businessId,
              actorId: userId,
              action: "recurring_expense.updated",
              entityType: "recurring_expense",
              entityId: rule._id,
              before,
              after: result,
              ip: (ip ?? "").slice(0, 100),
              at: now(),
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function archive({ businessId, userId, ruleId, ip }) {
    if (!mongoose.isValidObjectId(ruleId)) throw notFound();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const rule = await RecurringExpense.findOne({
          _id: ruleId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!rule) throw notFound();
        const before = serialize(rule);
        rule.archivedAt = now();
        rule.pausedAt = rule.pausedAt ?? now();
        await rule.save({ session });
        result = serialize(rule);
        await ActivityLog.create(
          [
            {
              businessId,
              actorId: userId,
              action: "recurring_expense.archived",
              entityType: "recurring_expense",
              entityId: rule._id,
              before,
              after: result,
              ip: (ip ?? "").slice(0, 100),
              at: now(),
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function runDue({ limit = 50 } = {}) {
    const rules = await RecurringExpense.find({
      archivedAt: null,
      pausedAt: null,
      nextRunAt: { $lte: now() },
    })
      .sort({ nextRunAt: 1 })
      .limit(limit)
      .select("_id businessId")
      .lean();
    let generated = 0;
    for (const candidate of rules) {
      const session = await mongoose.startSession();
      let didGenerate = false;
      try {
        await session.withTransaction(async () => {
          didGenerate = false;
          const rule = await RecurringExpense.findOne({
            _id: candidate._id,
            archivedAt: null,
            pausedAt: null,
            nextRunAt: { $lte: now() },
          }).session(session);
          if (!rule) return;
          const date = rule.nextRunAt.toISOString().slice(0, 10);
          if (rule.endAt && rule.nextRunAt > rule.endAt) {
            const before = serialize(rule);
            rule.pausedAt = now();
            await rule.save({ session });
            await ActivityLog.create(
              [
                {
                  businessId: rule.businessId,
                  actorId: rule.createdBy,
                  action: "recurring_expense.completed",
                  entityType: "recurring_expense",
                  entityId: rule._id,
                  before,
                  after: serialize(rule),
                  ip: "",
                  at: now(),
                },
              ],
              { session },
            );
            return;
          }
          const business = await Business.findById(rule.businessId).session(
            session,
          );
          if (!business) {
            const before = serialize(rule);
            rule.pausedAt = now();
            await rule.save({ session });
            await ActivityLog.create(
              [
                {
                  businessId: rule.businessId,
                  actorId: rule.createdBy,
                  action: "recurring_expense.paused_unavailable",
                  entityType: "recurring_expense",
                  entityId: rule._id,
                  before,
                  after: {
                    ...serialize(rule),
                    pauseReason: "business_missing",
                  },
                  ip: "",
                  at: now(),
                },
              ],
              { session },
            );
            return;
          }
          const subscription = await Subscription.findOne({
            businessId: rule.businessId,
          }).session(session);
          const entitlements = evaluateEntitlements({
            subscription,
            business,
            now: now(),
          });
          if (entitlements.readOnly || !entitlements.features.expenses) return;
          const category = await ExpenseCategory.findOne({
            _id: rule.categoryId,
            businessId: rule.businessId,
            archivedAt: null,
          }).session(session);
          if (!category || business.currency !== rule.currency) {
            const before = serialize(rule);
            rule.pausedAt = now();
            await rule.save({ session });
            await ActivityLog.create(
              [
                {
                  businessId: rule.businessId,
                  actorId: rule.createdBy,
                  action: "recurring_expense.paused_unavailable",
                  entityType: "recurring_expense",
                  entityId: rule._id,
                  before,
                  after: {
                    ...serialize(rule),
                    pauseReason: category
                      ? "currency_changed"
                      : "category_unavailable",
                  },
                  ip: "",
                  at: now(),
                },
              ],
              { session },
            );
            return;
          }
          await Expense.create(
            [
              {
                businessId: rule.businessId,
                categoryId: rule.categoryId,
                vendor: rule.vendor,
                description: rule.description,
                amountMinor: rule.amountMinor,
                currency: rule.currency,
                date: dateAtUtcMidnight(date),
                method: rule.method,
                reference: "Recurring expense",
                notes: "Automatically recorded from a recurring expense rule.",
                archivedAt: null,
                createdBy: rule.createdBy,
                recurringExpenseId: rule._id,
                recurringOccurrenceDate: dateAtUtcMidnight(date),
              },
            ],
            { session },
          );
          const next = nextOccurrence(date, rule.frequency);
          rule.nextRunAt = next;
          const completed = Boolean(rule.endAt && next > rule.endAt);
          if (completed) rule.pausedAt = now();
          await rule.save({ session });
          const locked = await Business.updateOne(
            { _id: business._id, currencyVersion: business.currencyVersion },
            {
              $set: {
                hasFinalizedRecords: true,
                currencyLockedAt: business.currencyLockedAt ?? now(),
              },
            },
            { session },
          );
          if (!locked.matchedCount)
            throw new ApiError(
              409,
              "CURRENCY_MISMATCH",
              "Business currency changed while generating a recurring expense.",
            );
          await ActivityLog.create(
            [
              {
                businessId: rule.businessId,
                actorId: rule.createdBy,
                action: "recurring_expense.occurrence_recorded",
                entityType: "recurring_expense",
                entityId: rule._id,
                after: {
                  date,
                  amountMinor: rule.amountMinor,
                  currency: rule.currency,
                  nextRunAt: rule.nextRunAt,
                  completed,
                },
                ip: "",
                at: now(),
              },
            ],
            { session },
          );
          didGenerate = true;
        });
        if (didGenerate) generated += 1;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      } finally {
        await session.endSession();
      }
    }
    return { generated };
  }

  return { list, create, update, setPaused, archive, runDue };
}
