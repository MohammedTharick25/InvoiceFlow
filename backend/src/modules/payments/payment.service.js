import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { now as systemNow } from "../../utils/clock.js";
import { ActivityLog } from "../activity-logs/activity-log.model.js";
import { Business } from "../businesses/business.model.js";
import { IdempotencyKey } from "../invoices/idempotency-key.model.js";
import { Invoice } from "../invoices/invoice.model.js";
import { Payment } from "./payment.model.js";
import { createReminderService } from "../reminders/reminder.service.js";

function idString(value) {
  return value == null ? null : value.toString();
}

function serializePayment(payment) {
  return {
    id: idString(payment._id),
    invoiceId: idString(payment.invoiceId),
    customerId: idString(payment.customerId),
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    paidAt: payment.paidAt?.toISOString() ?? null,
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
    status: payment.status,
    reversedAt: payment.reversedAt?.toISOString() ?? null,
    reversedBy: idString(payment.reversedBy),
    reversalReason: payment.reversalReason,
    idempotencyKey: payment.idempotencyKey,
    recordedBy: idString(payment.recordedBy),
    createdAt: payment.createdAt?.toISOString() ?? null,
  };
}

function invoicePaymentState(invoice) {
  return {
    id: idString(invoice._id),
    number: invoice.number,
    status: invoice.status,
    currency: invoice.currency,
    totalMinor: invoice.totals?.totalMinor ?? 0,
    amountPaidMinor: invoice.amountPaidMinor,
    balanceMinor: invoice.balanceMinor,
    sentAt: invoice.sentAt?.toISOString() ?? null,
  };
}

function conflict(code, message, details) {
  return new ApiError(409, code, message, details);
}

function requestHash(operation, resourceId, input) {
  return createHash("sha256")
    .update(
      JSON.stringify({ operation, resourceId: idString(resourceId), input }),
    )
    .digest("hex");
}

function samePaymentRequest(payment, { businessId, invoiceId, input }) {
  return (
    idString(payment.businessId) === idString(businessId) &&
    idString(payment.invoiceId) === idString(invoiceId) &&
    payment.amountMinor === input.amountMinor &&
    payment.paidAt.toISOString() === new Date(input.paidAt).toISOString() &&
    payment.method === input.method &&
    payment.reference === input.reference &&
    payment.notes === input.notes
  );
}

export function createPaymentService({ now = systemNow } = {}) {
  const reminders = createReminderService({ now });
  async function lockCurrency({ businessId, invoice, session, at }) {
    const business = await Business.findById(businessId).session(session);
    if (!business)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    if (
      business.currency !== invoice.currency ||
      business.currencyVersion !== invoice.currencyVersion
    )
      throw conflict(
        "CURRENCY_MISMATCH",
        "The business currency changed. Reload the invoice before recording a payment.",
      );
    const locked = await Business.updateOne(
      { _id: businessId, currencyVersion: invoice.currencyVersion },
      {
        $set: {
          hasFinalizedRecords: true,
          currencyLockedAt: business.currencyLockedAt ?? at,
        },
      },
      { session },
    );
    if (!locked.matchedCount)
      throw conflict(
        "CURRENCY_MISMATCH",
        "The business currency changed. Reload the invoice before recording a payment.",
      );
  }

  async function writeAudit({
    businessId,
    userId,
    action,
    paymentId,
    before,
    after,
    ip,
    at,
    session,
  }) {
    await ActivityLog.create(
      [
        {
          businessId,
          actorId: userId,
          action,
          entityType: "payment",
          entityId: paymentId,
          before: before ?? null,
          after: after ?? null,
          ip: (ip ?? "").slice(0, 100),
          at,
        },
      ],
      { session },
    );
  }

  async function record({ businessId, invoiceId, userId, input, ip }) {
    if (!mongoose.isValidObjectId(invoiceId))
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );

    const previous = await Payment.findOne({
      businessId,
      idempotencyKey: input.idempotencyKey,
    }).lean();
    if (previous) {
      if (!samePaymentRequest(previous, { businessId, invoiceId, input }))
        throw conflict(
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency key was already used for a different payment.",
        );
      const invoice = await Invoice.findOne({ _id: invoiceId, businessId });
      if (!invoice)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found.",
        );
      return {
        payment: serializePayment(previous),
        invoice: invoicePaymentState(invoice),
        replayed: true,
      };
    }

    const at = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const existing = await Payment.findOne({
          businessId,
          idempotencyKey: input.idempotencyKey,
        }).session(session);
        if (existing) {
          if (!samePaymentRequest(existing, { businessId, invoiceId, input }))
            throw conflict(
              "IDEMPOTENCY_KEY_REUSED",
              "This idempotency key was already used for a different payment.",
            );
          const existingInvoice = await Invoice.findOne({
            _id: invoiceId,
            businessId,
          }).session(session);
          if (!existingInvoice)
            throw new ApiError(
              404,
              "NOT_FOUND",
              "The requested resource was not found.",
            );
          result = {
            payment: serializePayment(existing),
            invoice: invoicePaymentState(existingInvoice),
            replayed: true,
          };
          return;
        }
        const invoice = await Invoice.findOne({
          _id: invoiceId,
          businessId,
        }).session(session);
        if (!invoice)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        if (!["issued", "sent", "partially_paid"].includes(invoice.status))
          throw conflict(
            "INVOICE_NOT_PAYABLE",
            "Payments can be recorded only on issued invoices with an outstanding balance.",
          );
        if (input.amountMinor > invoice.balanceMinor)
          throw conflict(
            "PAYMENT_EXCEEDS_BALANCE",
            "The payment is greater than the invoice balance.",
            { balanceMinor: invoice.balanceMinor },
          );
        await lockCurrency({ businessId, invoice, session, at });

        const before = invoicePaymentState(invoice);
        const nextPaid = invoice.amountPaidMinor + input.amountMinor;
        invoice.amountPaidMinor = nextPaid;
        invoice.balanceMinor = invoice.totals.totalMinor - nextPaid;
        invoice.status = invoice.balanceMinor === 0 ? "paid" : "partially_paid";
        invoice.updatedAt = at;
        await invoice.save({ session });

        const [payment] = await Payment.create(
          [
            {
              businessId,
              invoiceId,
              customerId: invoice.customerId,
              amountMinor: input.amountMinor,
              currency: invoice.currency,
              paidAt: new Date(input.paidAt),
              method: input.method,
              reference: input.reference,
              notes: input.notes,
              status: "recorded",
              idempotencyKey: input.idempotencyKey,
              recordedBy: userId,
            },
          ],
          { session },
        );
        await writeAudit({
          businessId,
          userId,
          action: "payment.recorded",
          paymentId: payment._id,
          before,
          after: {
            payment: serializePayment(payment),
            invoice: invoicePaymentState(invoice),
          },
          ip,
          at,
          session,
        });
        result = {
          payment: serializePayment(payment),
          invoice: invoicePaymentState(invoice),
          replayed: false,
        };
      });
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await Payment.findOne({
          businessId,
          idempotencyKey: input.idempotencyKey,
        }).lean();
        if (
          duplicate &&
          samePaymentRequest(duplicate, { businessId, invoiceId, input })
        ) {
          const invoice = await Invoice.findOne({ _id: invoiceId, businessId });
          if (invoice)
            return {
              payment: serializePayment(duplicate),
              invoice: invoicePaymentState(invoice),
              replayed: true,
            };
        }
        if (duplicate)
          throw conflict(
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key was already used for a different payment.",
          );
      }
      throw error;
    } finally {
      await session.endSession();
    }
    if (result.invoice.status === "paid")
      await reminders.syncInvoice({ businessId, invoiceId, at });
    return result;
  }

  async function reverse({
    businessId,
    invoiceId,
    paymentId,
    userId,
    input,
    ip,
  }) {
    if (
      !mongoose.isValidObjectId(invoiceId) ||
      !mongoose.isValidObjectId(paymentId)
    )
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    const operation = "payment.reverse";
    const hash = requestHash(operation, paymentId, input);
    const replay = await IdempotencyKey.findOne({
      businessId,
      key: input.idempotencyKey,
    }).lean();
    if (replay) {
      if (replay.operation !== operation || replay.requestHash !== hash)
        throw conflict(
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency key was already used for a different request.",
        );
      return replay.response;
    }

    const at = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const previous = await IdempotencyKey.findOne({
          businessId,
          key: input.idempotencyKey,
        }).session(session);
        if (previous) {
          if (previous.operation !== operation || previous.requestHash !== hash)
            throw conflict(
              "IDEMPOTENCY_KEY_REUSED",
              "This idempotency key was already used for a different request.",
            );
          result = previous.response;
          return;
        }
        const invoice = await Invoice.findOne({
          _id: invoiceId,
          businessId,
        }).session(session);
        const payment = await Payment.findOne({
          _id: paymentId,
          invoiceId,
          businessId,
        }).session(session);
        if (!invoice || !payment)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        if (payment.status !== "recorded")
          throw conflict(
            "PAYMENT_ALREADY_REVERSED",
            "This payment has already been reversed.",
          );
        if (payment.amountMinor > invoice.amountPaidMinor)
          throw conflict(
            "PAYMENT_BALANCE_INCONSISTENT",
            "The invoice payment balance needs review before reversal.",
          );

        const before = {
          payment: serializePayment(payment),
          invoice: invoicePaymentState(invoice),
        };
        payment.status = "reversed";
        payment.reversedAt = at;
        payment.reversedBy = userId;
        payment.reversalReason = input.reason;
        await payment.save({ session });

        invoice.amountPaidMinor -= payment.amountMinor;
        invoice.balanceMinor =
          invoice.totals.totalMinor - invoice.amountPaidMinor;
        invoice.status =
          invoice.amountPaidMinor === 0
            ? invoice.sentAt
              ? "sent"
              : "issued"
            : invoice.balanceMinor === 0
              ? "paid"
              : "partially_paid";
        invoice.updatedAt = at;
        await invoice.save({ session });
        await writeAudit({
          businessId,
          userId,
          action: "payment.reversed",
          paymentId: payment._id,
          before,
          after: {
            payment: serializePayment(payment),
            invoice: invoicePaymentState(invoice),
          },
          ip,
          at,
          session,
        });
        result = {
          payment: serializePayment(payment),
          invoice: invoicePaymentState(invoice),
        };
        await IdempotencyKey.create(
          [
            {
              businessId,
              key: input.idempotencyKey,
              operation,
              requestHash: hash,
              resourceId: payment._id,
              response: result,
              expiresAt: new Date(at.getTime() + 24 * 60 * 60 * 1000),
            },
          ],
          { session },
        );
      });
    } catch (error) {
      if (error?.code === 11000) {
        const saved = await IdempotencyKey.findOne({
          businessId,
          key: input.idempotencyKey,
        }).lean();
        if (saved?.operation === operation && saved.requestHash === hash)
          return saved.response;
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function list({ businessId, invoiceId, page, limit }) {
    if (!mongoose.isValidObjectId(invoiceId))
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    const invoice = await Invoice.findOne({ _id: invoiceId, businessId })
      .select("_id")
      .lean();
    if (!invoice)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    const filter = { businessId, invoiceId };
    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ paidAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Payment.countDocuments(filter),
    ]);
    return {
      payments: payments.map(serializePayment),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  return { record, reverse, list };
}
