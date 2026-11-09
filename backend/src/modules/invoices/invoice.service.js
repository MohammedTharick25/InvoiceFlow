import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { ApiError, badRequest } from "../../utils/ApiError.js";
import {
  businessDate,
  dateAtUtcMidnight,
  now as systemNow,
} from "../../utils/clock.js";
import { calculateFinancials } from "../../utils/financialCalculations.js";
import {
  deriveSupplyType,
  evaluateHsnPolicy,
  placeOfSupplyCandidates,
} from "../../utils/gst.js";
import {
  formatInvoiceNumber,
  getFinancialYear,
  validateInvoiceSeries,
} from "../../utils/invoiceNumber.js";
import { Business } from "../businesses/business.model.js";
import { BusinessSettings } from "../businesses/business-settings.model.js";
import { Customer } from "../customers/customer.model.js";
import { ActivityLog } from "../activity-logs/activity-log.model.js";
import { Subscription } from "../billing/subscription.model.js";
import { UsageCounter } from "../billing/usage-counter.model.js";
import { createTaxRateService } from "../settings/tax-rate.service.js";
import { Counter } from "./counter.model.js";
import { IdempotencyKey } from "./idempotency-key.model.js";
import { Invoice } from "./invoice.model.js";
import { InvoiceDelivery } from "./invoice-delivery.model.js";
import { StoredFile } from "./stored-file.model.js";
import { createReminderService } from "../reminders/reminder.service.js";
import { renderInvoicePdf } from "./pdf.service.js";
import plans from "../../config/plans.json" with { type: "json" };
import hsnRules from "../../config/gst-hsn-rules.json" with { type: "json" };
import stateData from "../../config/gst-state-codes.json" with { type: "json" };

const CALC_VERSION = "gst-calc-v1";
const stateByCode = new Map(
  stateData.states.map((state) => [state.code, state]),
);

function idString(value) {
  return value == null ? null : value.toString();
}

function plain(value) {
  return value?.toObject ? value.toObject({ depopulate: true }) : value;
}

function dateString(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function randomHexToken() {
  return randomBytes(32).toString("hex");
}

function maskEmail(value) {
  const [local = "", domain = ""] = String(value).split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

function serializeInvoice(invoice) {
  const value = plain(invoice);
  return {
    id: idString(value._id),
    customerId: idString(value.customerId),
    number: value.number,
    status: value.status,
    issueDate: dateString(value.issueDate),
    dueDate: dateString(value.dueDate),
    taxPointDate: dateString(value.taxPointDate),
    currency: value.currency,
    currencyVersion: value.currencyVersion,
    invoiceDiscountMinor: value.invoiceDiscountMinor,
    templateType: value.templateType,
    financialYear: value.financialYear,
    placeOfSupply: value.placeOfSupply,
    shipTo: value.shipTo,
    supplyType: value.supplyType,
    supplyNote: value.supplyNote,
    stateTaxLabel: value.stateTaxLabel,
    recipientContext: value.recipientContext,
    recipientContextOverride: value.recipientContextOverride,
    hsnRequirement: value.hsnRequirement,
    hsnMinDigits: value.hsnMinDigits,
    customerSnapshot: value.customerSnapshot,
    businessSnapshot: value.businessSnapshot,
    calcVersion: value.calcVersion,
    items: value.items,
    charges: value.charges,
    totals: value.totals,
    byTaxability: value.byTaxability,
    taxSummary: value.taxSummary,
    amountPaidMinor: value.amountPaidMinor,
    balanceMinor: value.balanceMinor,
    notes: value.notes,
    terms: value.terms,
    reverseCharge: value.reverseCharge,
    issuedAt: value.issuedAt,
    sentAt: value.sentAt,
    sentVia: value.sentVia,
    sentBasis: value.sentBasis,
    deliveryFenceSeq: value.deliveryFenceSeq,
    archivedAt: value.archivedAt,
    pdfSha256: value.pdfSha256,
    pdfTemplateVersion: value.pdfTemplateVersion,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function auditRecord({
  businessId,
  actorId,
  action,
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
        actorId,
        action,
        entityType: "invoice",
        entityId,
        before: before ?? null,
        after: after ?? null,
        ip: ip ?? "",
        at,
      },
    ],
    { session },
  );
}

function invoiceRequestHash(operation, invoiceId, input) {
  return createHash("sha256")
    .update(
      JSON.stringify({ operation, invoiceId: idString(invoiceId), input }),
    )
    .digest("hex");
}

async function findIdempotent({
  businessId,
  key,
  operation,
  requestHash,
  session,
}) {
  const record = await IdempotencyKey.findOne({ businessId, key }).session(
    session ?? null,
  );
  if (!record) return null;
  if (record.operation !== operation || record.requestHash !== requestHash)
    throw new ApiError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "This idempotency key was already used for a different request.",
    );
  return record.response;
}

async function saveIdempotency({
  businessId,
  key,
  operation,
  requestHash,
  resourceId,
  response,
  at,
  session,
}) {
  await IdempotencyKey.create(
    [
      {
        businessId,
        key,
        operation,
        requestHash,
        resourceId,
        response,
        expiresAt: new Date(at.getTime() + 24 * 60 * 60 * 1000),
      },
    ],
    { session },
  );
}

function addressSnapshot(address = {}) {
  return {
    line1: address.line1 ?? "",
    line2: address.line2 ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    stateCode: address.stateCode ?? "",
    postalCode: address.postalCode ?? "",
    country: address.country ?? "India",
  };
}

function snapshotCustomer(customer) {
  return {
    id: idString(customer._id),
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    billingAddress: addressSnapshot(customer.billingAddress),
    shippingAddress: customer.shippingAddress
      ? addressSnapshot(customer.shippingAddress)
      : null,
    gstin: customer.gstin,
  };
}

function snapshotBusiness(business, settings) {
  return {
    id: idString(business._id),
    name: business.name,
    email: business.email,
    phone: business.phone,
    address: addressSnapshot(business.address),
    currency: business.currency,
    currencyVersion: business.currencyVersion,
    timezone: business.timezone,
    tax: plain(business.tax),
    settings: {
      invoice: {
        signatoryName: settings.invoice.signatoryName,
        declarations: [...settings.invoice.declarations],
        footer: settings.invoice.footer,
      },
      payment: plain(settings.payment),
    },
  };
}

function normalizeDraftInput(input, existing) {
  const result = existing ? plain(existing) : {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "issueDate" || key === "dueDate" || key === "taxPointDate") {
      result[key] = value ? dateAtUtcMidnight(value) : null;
    } else if (key === "placeOfSupply" || key === "shipTo") {
      result[key] = value ?? undefined;
    } else if (key === "items" || key === "charges") {
      result[key] = value.map((row) => ({ ...row }));
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function createInvoiceService({
  now = systemNow,
  storage,
  beforeFinalizeCommit = async () => {},
} = {}) {
  const rates = createTaxRateService({ now });
  const reminders = createReminderService({ now });

  async function loadWorkspace(businessId, session) {
    const business = await Business.findById(businessId).session(session);
    const settings = await BusinessSettings.findOne({ businessId }).session(
      session,
    );
    if (!business || !settings)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    return { business, settings };
  }

  async function lockCurrency({ businessId, currencyVersion, session }) {
    const result = await Business.updateOne(
      { _id: businessId, currencyVersion },
      { $set: { currencyVersion } },
      { session },
    );
    if (!result.matchedCount)
      throw new ApiError(
        409,
        "CURRENCY_MISMATCH",
        "The business currency changed. Reload the invoice before saving.",
      );
  }

  async function loadCustomer({ businessId, customerId, session }) {
    const customer = await Customer.findOne({
      _id: customerId,
      businessId,
      archivedAt: null,
    }).session(session);
    if (!customer)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    return customer;
  }

  async function resolveLines({
    businessId,
    invoice,
    issueDate,
    session,
    compareExisting = false,
  }) {
    const taxPointDate = invoice.taxPointDate
      ? dateString(invoice.taxPointDate)
      : issueDate;
    const rateMap = {};
    const resolved = [];
    for (const group of ["items", "charges"]) {
      const rows = invoice[group] ?? [];
      const nextRows = [];
      for (const row of rows) {
        const next = { ...plain(row) };
        if (
          next.taxability === "taxable" &&
          next.taxCode &&
          invoice.supplyType !== "none"
        ) {
          const version = await rates.resolve({
            businessId,
            code: next.taxCode,
            at: taxPointDate,
            session,
          });
          if (
            compareExisting &&
            idString(next.taxRateVersionId) &&
            idString(next.taxRateVersionId) !== idString(version._id)
          )
            throw badRequest(
              "TAX_RATE_CHANGED_REVIEW_REQUIRED",
              `The configured rate for ${next.taxCode} changed. Review the draft before finalizing.`,
            );
          next.taxRateVersionId = version._id;
          next.rateBp = version.rateBp;
          rateMap[next.taxCode] = { rateBp: version.rateBp };
        } else {
          next.taxRateVersionId = null;
          next.rateBp = 0;
        }
        nextRows.push(next);
      }
      resolved.push(nextRows);
    }
    return { items: resolved[0], charges: resolved[1], rateMap };
  }

  function calculateDraft(invoice, resolved) {
    const calculation = calculateFinancials({
      items: resolved.items,
      charges: resolved.charges,
      invoiceDiscountMinor: invoice.invoiceDiscountMinor ?? 0,
      supplyType: invoice.supplyType ?? "none",
      rates: resolved.rateMap,
      stateTaxLabel: invoice.stateTaxLabel ?? "SGST",
    });
    return {
      items: calculation.items.map((line, index) => ({
        ...line,
        taxRateVersionId: resolved.items[index].taxRateVersionId,
      })),
      charges: calculation.charges.map((line, index) => ({
        ...line,
        taxRateVersionId: resolved.charges[index].taxRateVersionId,
      })),
      totals: calculation.totals,
      byTaxability: calculation.byTaxability,
      taxSummary: calculation.taxSummary,
      calcVersion: calculation.calcVersion,
      stateTaxLabel: calculation.stateTaxLabel,
    };
  }

  function resolveSupply({ business, customer, invoice }) {
    const registeredStateCode = customer.gstin?.slice(0, 2) || "";
    const candidates = placeOfSupplyCandidates({
      billingStateCode: customer.billingAddress?.stateCode,
      registeredStateCode,
      shipToStateCode: invoice.shipTo?.stateCode,
      businessStateCode: business.tax.stateCode || business.address.stateCode,
    });
    const place = invoice.placeOfSupply;
    if (business.tax.gstRegistered && !place?.stateCode)
      return { supplyType: "none", candidates, stateTaxLabel: "SGST" };
    if (!place?.stateCode)
      return { supplyType: "none", candidates, stateTaxLabel: "SGST" };
    const state = stateByCode.get(place.stateCode);
    if (!state)
      throw badRequest(
        "STATE_CODE_INVALID",
        "Choose a configured place-of-supply state.",
      );
    if (place.basis === "manual" && !place.note?.trim())
      throw badRequest(
        "PLACE_OF_SUPPLY_NOTE_REQUIRED",
        "Explain a manually selected place of supply.",
      );
    if (place.basis !== "manual") {
      const candidate = candidates.find((item) => item.basis === place.basis);
      if (!candidate || candidate.stateCode !== place.stateCode)
        throw badRequest(
          "PLACE_OF_SUPPLY_INVALID",
          "The selected place of supply does not match its source.",
        );
    }
    const supplyType =
      invoice.supplyType === "other"
        ? "other"
        : deriveSupplyType({
            gstRegistered: business.tax.gstRegistered,
            businessStateCode:
              business.tax.stateCode || business.address.stateCode,
            placeOfSupplyStateCode: place.stateCode,
          });
    return {
      supplyType,
      candidates,
      stateTaxLabel: state.intraSecondTax ?? "SGST",
    };
  }

  function makeDraftState({ input, business, settings, customer, old, at }) {
    const issueDate = input.issueDate
      ? dateAtUtcMidnight(input.issueDate)
      : (old?.issueDate ??
        dateAtUtcMidnight(businessDate(at, business.timezone)));
    const dueDate = Object.hasOwn(input, "dueDate")
      ? input.dueDate
        ? dateAtUtcMidnight(input.dueDate)
        : null
      : (old?.dueDate ??
        dateAtUtcMidnight(
          addDays(dateString(issueDate), settings.invoice.defaultTermsDays),
        ));
    const taxPointDate = Object.hasOwn(input, "taxPointDate")
      ? input.taxPointDate
        ? dateAtUtcMidnight(input.taxPointDate)
        : null
      : (old?.taxPointDate ?? issueDate);
    const merged = normalizeDraftInput(
      {
        ...input,
        issueDate: dateString(issueDate),
        dueDate: dateString(dueDate),
        taxPointDate: dateString(taxPointDate),
      },
      old,
    );
    const selectedCustomer = input.customerId ? customer : old?.customerId;
    const b2b = Boolean(selectedCustomer?.gstin);
    const recipientContext =
      input.recipientContext ?? old?.recipientContext ?? (b2b ? "b2b" : "b2c");
    const override = input.recipientContextOverride ??
      old?.recipientContextOverride ?? { overridden: false, reason: "" };
    if (
      (recipientContext === "b2b") !== b2b &&
      (!override.overridden || !override.reason.trim())
    )
      throw badRequest(
        "RECIPIENT_CONTEXT_OVERRIDE_REQUIRED",
        "Explain why the recipient context differs from the customer's GSTIN.",
      );
    return {
      ...merged,
      customerId: input.customerId ?? old?.customerId,
      issueDate,
      dueDate,
      taxPointDate,
      currency: business.currency,
      currencyVersion: business.currencyVersion,
      status: "draft",
      number: null,
      recipientContext,
      recipientContextOverride: override,
      supplyType: input.otherSupply
        ? "other"
        : old?.supplyType === "other" && input.otherSupply === undefined
          ? "other"
          : "none",
      supplyNote: input.supplyNote ?? old?.supplyNote ?? "",
      reverseCharge: old?.reverseCharge ?? { status: "unset" },
      amountPaidMinor: 0,
      balanceMinor: 0,
      createdBy: old?.createdBy,
      createdAt: old?.createdAt,
      updatedAt: at,
      archivedAt: old?.archivedAt ?? null,
      _customer: selectedCustomer,
      _settings: settings,
    };
  }

  function addDays(date, days) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  async function create({ businessId, userId, input, ip }) {
    const current = now();
    const session = await mongoose.startSession();
    let created;
    try {
      await session.withTransaction(async () => {
        const { business, settings } = await loadWorkspace(businessId, session);
        await lockCurrency({
          businessId,
          currencyVersion: business.currencyVersion,
          session,
        });
        const customer = await loadCustomer({
          businessId,
          customerId: input.customerId,
          session,
        });
        const draft = makeDraftState({
          input,
          business,
          settings,
          customer,
          at: current,
        });
        const fy = getFinancialYear(
          dateString(draft.issueDate),
          settings.invoice.financialYearStartMonth,
        );
        validateInvoiceSeries(settings.invoice);
        const supply = resolveSupply({ business, customer, invoice: draft });
        draft.supplyType = supply.supplyType;
        draft.stateTaxLabel = supply.stateTaxLabel;
        const resolved = await resolveLines({
          businessId,
          invoice: draft,
          issueDate: dateString(draft.issueDate),
          session,
        });
        const calculated = calculateDraft(draft, resolved);
        const [invoice] = await Invoice.create(
          [
            {
              ...draft,
              ...calculated,
              financialYear: fy,
              businessId,
              customerId: customer._id,
              createdBy: userId,
              balanceMinor: calculated.totals.totalMinor,
            },
          ],
          { session },
        );
        await auditRecord({
          businessId,
          actorId: userId,
          action: "invoice.draft_created",
          entityId: invoice._id,
          after: serializeInvoice(invoice),
          ip,
          at: current,
          session,
        });
        created = {
          invoice: serializeInvoice(invoice),
          placeOfSupplyCandidates: supply.candidates,
        };
      });
    } finally {
      await session.endSession();
    }
    return created;
  }

  async function update({ businessId, invoiceId, userId, input, ip }) {
    const current = now();
    const session = await mongoose.startSession();
    let updated;
    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne({
          _id: invoiceId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!invoice)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        const before = serializeInvoice(invoice);
        if (invoice.status !== "draft") {
          const permittedStatuses = new Set([
            "issued",
            "sent",
            "partially_paid",
          ]);
          const editableFields = new Set(["dueDate", "notes"]);
          if (
            !permittedStatuses.has(invoice.status) ||
            Object.keys(input).some((key) => !editableFields.has(key))
          )
            throw new ApiError(
              409,
              "INVOICE_LOCKED",
              "Only notes and due date can be changed after an invoice is issued.",
            );
          if (Object.hasOwn(input, "dueDate"))
            invoice.dueDate = input.dueDate
              ? dateAtUtcMidnight(input.dueDate)
              : null;
          if (Object.hasOwn(input, "notes")) invoice.notes = input.notes;
          invoice.updatedAt = current;
          await invoice.save({ session });
          await auditRecord({
            businessId,
            actorId: userId,
            action: "invoice.issued_details_updated",
            entityId: invoice._id,
            before,
            after: serializeInvoice(invoice),
            ip,
            at: current,
            session,
          });
          updated = {
            invoice: serializeInvoice(invoice),
            placeOfSupplyCandidates: [],
          };
          return;
        }
        const { business, settings } = await loadWorkspace(businessId, session);
        await lockCurrency({
          businessId,
          currencyVersion: invoice.currencyVersion,
          session,
        });
        const customer = await loadCustomer({
          businessId,
          customerId: input.customerId ?? invoice.customerId,
          session,
        });
        const draft = makeDraftState({
          input,
          business,
          settings,
          customer,
          old: invoice,
          at: current,
        });
        const fy = getFinancialYear(
          dateString(draft.issueDate),
          settings.invoice.financialYearStartMonth,
        );
        validateInvoiceSeries(settings.invoice);
        const supply = resolveSupply({ business, customer, invoice: draft });
        draft.supplyType = supply.supplyType;
        draft.stateTaxLabel = supply.stateTaxLabel;
        const resolved = await resolveLines({
          businessId,
          invoice: draft,
          issueDate: dateString(draft.issueDate),
          session,
        });
        const calculated = calculateDraft(draft, resolved);
        Object.assign(invoice, draft, calculated, {
          businessId,
          customerId: customer._id,
          currency: business.currency,
          currencyVersion: business.currencyVersion,
          financialYear: fy,
          balanceMinor: calculated.totals.totalMinor,
          updatedAt: current,
        });
        await invoice.save({ session });
        await auditRecord({
          businessId,
          actorId: userId,
          action: "invoice.draft_updated",
          entityId: invoice._id,
          before,
          after: serializeInvoice(invoice),
          ip,
          at: current,
          session,
        });
        updated = {
          invoice: serializeInvoice(invoice),
          placeOfSupplyCandidates: supply.candidates,
        };
      });
    } finally {
      await session.endSession();
    }
    if (updated.invoice.status !== "draft")
      await reminders.syncInvoice({ businessId, invoiceId, at: current });
    return updated;
  }

  async function get({ businessId, invoiceId }) {
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      businessId,
      archivedAt: null,
    });
    if (!invoice)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    const customer = await Customer.findOne({
      _id: invoice.customerId,
      businessId,
    })
      .select("name email phone billingAddress shippingAddress gstin")
      .lean();
    const deliveries = await InvoiceDelivery.find({ businessId, invoiceId })
      .sort({ recordedAt: 1 })
      .lean();
    const { business } = await loadWorkspace(businessId);
    const candidates =
      customer && invoice.status === "draft"
        ? placeOfSupplyCandidates({
            billingStateCode: customer.billingAddress?.stateCode,
            registeredStateCode: customer.gstin?.slice(0, 2),
            shipToStateCode: invoice.shipTo?.stateCode,
            businessStateCode:
              business.tax.stateCode || business.address.stateCode,
          })
        : [];
    return {
      invoice: serializeInvoice(invoice),
      customer,
      placeOfSupplyCandidates: candidates,
      deliveries,
    };
  }

  async function list({ businessId, query, timeZone = "Asia/Kolkata" }) {
    const today = dateAtUtcMidnight(businessDate(now(), timeZone));
    const filter = { businessId, archivedAt: null };
    if (query.customerId) filter.customerId = query.customerId;
    if (query.from || query.to) {
      filter.issueDate = {};
      if (query.from) filter.issueDate.$gte = dateAtUtcMidnight(query.from);
      if (query.to) filter.issueDate.$lte = dateAtUtcMidnight(query.to);
    }
    if (query.status === "overdue") {
      filter.status = { $in: ["issued", "sent", "partially_paid"] };
      filter.dueDate = { $lt: today };
      filter.balanceMinor = { $gt: 0 };
    } else if (query.status) filter.status = query.status;
    if (query.search) {
      const expression = new RegExp(escapeRegex(query.search), "i");
      const customers = await Customer.find({
        businessId,
        archivedAt: null,
        name: expression,
      })
        .select("_id")
        .lean();
      filter.$or = [
        { number: expression },
        { customerId: { $in: customers.map((row) => row._id) } },
      ];
    }
    const sortField =
      query.sort === "totalMinor" ? "totals.totalMinor" : query.sort;
    const direction = query.direction === "asc" ? 1 : -1;
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ [sortField]: direction, _id: direction })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      Invoice.countDocuments(filter),
    ]);
    return {
      invoices: rows.map(serializeInvoice),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async function removeDraft({ businessId, invoiceId, userId, ip }) {
    const session = await mongoose.startSession();
    const current = now();
    let removed;
    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne({
          _id: invoiceId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!invoice)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        if (invoice.status !== "draft")
          throw new ApiError(
            409,
            "INVOICE_LOCKED",
            "Only draft invoices can be deleted.",
          );
        const Payment = mongoose.models.Payment;
        if (
          Payment &&
          (await Payment.exists({ businessId, invoiceId }).session(session))
        )
          throw new ApiError(
            409,
            "INVOICE_HAS_PAYMENTS",
            "An invoice with payments cannot be deleted.",
          );
        const before = serializeInvoice(invoice);
        await Invoice.deleteOne(
          { _id: invoice._id, businessId, status: "draft" },
          { session },
        );
        await auditRecord({
          businessId,
          actorId: userId,
          action: "invoice.draft_deleted",
          entityId: invoice._id,
          before,
          ip,
          at: current,
          session,
        });
        removed = { id: invoice._id.toString(), deleted: true };
      });
    } finally {
      await session.endSession();
    }
    return removed;
  }

  async function archive({ businessId, invoiceId, userId, ip }) {
    const current = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne({
          _id: invoiceId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!invoice)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        if (invoice.status === "draft")
          throw new ApiError(
            409,
            "DRAFT_DELETE_REQUIRED",
            "Delete a draft invoice instead of archiving it.",
          );
        const before = serializeInvoice(invoice);
        invoice.archivedAt = current;
        await invoice.save({ session });
        await auditRecord({
          businessId,
          actorId: userId,
          action: "invoice.archived",
          entityId: invoice._id,
          before,
          after: serializeInvoice(invoice),
          ip,
          at: current,
          session,
        });
        result = { id: invoice._id.toString(), archivedAt: current };
      });
    } finally {
      await session.endSession();
    }
    await reminders.syncInvoice({ businessId, invoiceId, at: current });
    return result;
  }

  async function clearAmounts({ businessId, invoiceId, userId, ip }) {
    const current = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne({
          _id: invoiceId,
          businessId,
          status: "draft",
          archivedAt: null,
        }).session(session);
        if (!invoice)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested draft was not found.",
          );
        const before = serializeInvoice(invoice);
        const { business } = await loadWorkspace(businessId, session);
        await lockCurrency({
          businessId,
          currencyVersion: invoice.currencyVersion,
          session,
        });
        invoice.items = invoice.items.map((item) => ({
          ...item.toObject(),
          unitPriceMinor: 0,
          discount:
            item.discount.type === "fixed"
              ? { type: "none", rateBp: 0, amountMinor: 0 }
              : item.discount,
        }));
        invoice.charges = invoice.charges.map((charge) => ({
          ...charge.toObject(),
          amountMinor: 0,
        }));
        invoice.invoiceDiscountMinor = 0;
        invoice.currency = business.currency;
        invoice.currencyVersion = business.currencyVersion;
        const resolved = await resolveLines({
          businessId,
          invoice,
          issueDate: dateString(invoice.issueDate),
          session,
        });
        const calculated = calculateDraft(invoice, resolved);
        Object.assign(invoice, calculated, {
          balanceMinor: calculated.totals.totalMinor,
          updatedAt: current,
        });
        await invoice.save({ session });
        await auditRecord({
          businessId,
          actorId: userId,
          action: "invoice.draft_amounts_cleared",
          entityId: invoice._id,
          before,
          after: serializeInvoice(invoice),
          ip,
          at: current,
          session,
        });
        result = { invoice: serializeInvoice(invoice) };
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function finalize({ businessId, invoiceId, userId, input, ip }) {
    if (!storage?.stage || !storage?.promote)
      throw new ApiError(
        503,
        "PDF_STORAGE_UNAVAILABLE",
        "Invoice PDF storage is not available.",
      );
    const operation = "invoice.finalize";
    const requestHash = invoiceRequestHash(operation, invoiceId, input);
    const previous = await findIdempotent({
      businessId,
      key: input.idempotencyKey,
      operation,
      requestHash,
    });
    if (previous) return previous;
    const current = now();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const session = await mongoose.startSession();
      let staged;
      let result;
      try {
        await session.withTransaction(async () => {
          const replay = await findIdempotent({
            businessId,
            key: input.idempotencyKey,
            operation,
            requestHash,
            session,
          });
          if (replay) {
            result = replay;
            return;
          }
          const invoice = await Invoice.findOne({
            _id: invoiceId,
            businessId,
            archivedAt: null,
          }).session(session);
          if (!invoice)
            throw new ApiError(
              404,
              "NOT_FOUND",
              "The requested resource was not found.",
            );
          if (invoice.status !== "draft")
            throw new ApiError(
              409,
              "INVOICE_LOCKED",
              "Only a draft invoice can be finalized.",
            );
          const before = serializeInvoice(invoice);
          const { business, settings } = await loadWorkspace(
            businessId,
            session,
          );
          await lockCurrency({
            businessId,
            currencyVersion: invoice.currencyVersion,
            session,
          });
          const customer = await loadCustomer({
            businessId,
            customerId: invoice.customerId,
            session,
          });
          const fy = getFinancialYear(
            dateString(invoice.issueDate),
            settings.invoice.financialYearStartMonth,
          );
          let counter = await Counter.findOne({
            businessId,
            key: fy.counterKey,
          }).session(session);
          if (!counter) {
            const series = validateInvoiceSeries(settings.invoice);
            [counter] = await Counter.create(
              [
                {
                  businessId,
                  key: fy.counterKey,
                  seq: 0,
                  prefix: series.prefix,
                  width: series.sequenceWidth,
                  maxSeq: series.maxSeq,
                  financialYear: { startYear: fy.startYear, label: fy.label },
                },
              ],
              { session },
            );
          }
          validateInvoiceSeries({
            prefix: counter.prefix,
            sequenceWidth: counter.width,
          });
          const supply = resolveSupply({ business, customer, invoice });
          if (business.tax.gstRegistered) {
            if (!input.confirmPlaceOfSupply)
              throw badRequest(
                "PLACE_OF_SUPPLY_REQUIRED",
                "Confirm the place of supply before finalizing.",
              );
            if (!invoice.placeOfSupply?.stateCode)
              throw badRequest(
                "PLACE_OF_SUPPLY_REQUIRED",
                "Select a place of supply before finalizing.",
              );
            if (!input.reverseCharge)
              throw badRequest(
                "REVERSE_CHARGE_CONFIRMATION_REQUIRED",
                "Confirm whether reverse charge applies before finalizing.",
              );
            if (input.reverseCharge !== "not_applicable")
              throw badRequest(
                "REVERSE_CHARGE_NOT_SUPPORTED",
                "Reverse charge is unsupported in this release. The invoice remains a draft.",
              );
          }
          if (invoice.supplyType === "other" && !invoice.supplyNote?.trim())
            throw badRequest(
              "OTHER_SUPPLY_NOTE_REQUIRED",
              "Add a note for this other supply type.",
            );

          const calculated = await (async () => {
            const finalInvoice = {
              ...plain(invoice),
              supplyType: supply.supplyType,
              stateTaxLabel: supply.stateTaxLabel,
            };
            const resolved = await resolveLines({
              businessId,
              invoice: finalInvoice,
              issueDate: dateString(invoice.issueDate),
              session,
              compareExisting: true,
            });
            const values = calculateDraft(finalInvoice, resolved);
            return { finalInvoice, values };
          })();

          const recipientContext =
            invoice.recipientContext ?? (customer.gstin ? "b2b" : "b2c");
          const derivedContext = customer.gstin ? "b2b" : "b2c";
          const override = invoice.recipientContextOverride ?? {
            overridden: false,
            reason: "",
          };
          if (
            recipientContext !== derivedContext &&
            (!override.overridden || !override.reason?.trim())
          )
            throw badRequest(
              "RECIPIENT_CONTEXT_OVERRIDE_REQUIRED",
              "Explain why the recipient context differs from the customer's GSTIN.",
            );
          const hsn = evaluateHsnPolicy(
            hsnRules.turnoverBands,
            business.tax.hsnPolicy?.declaredTurnoverBand ?? "unspecified",
            recipientContext,
            [
              ...calculated.finalInvoice.items,
              ...calculated.finalInvoice.charges,
            ].map((line) => line.hsnSac ?? ""),
          );
          if (
            supply.supplyType === "other" &&
            [
              ...calculated.finalInvoice.items,
              ...calculated.finalInvoice.charges,
            ].some((line) => line.taxability === "taxable")
          )
            throw badRequest(
              "TAXABLE_LINE_NOT_SUPPORTED_FOR_SUPPLY_TYPE",
              "Taxable lines are not supported for this supply type.",
            );

          const nextSequence = await Counter.findOneAndUpdate(
            { _id: counter._id, seq: { $lt: counter.maxSeq } },
            { $inc: { seq: 1 } },
            { returnDocument: "after", session },
          );
          if (!nextSequence)
            throw badRequest(
              "INVOICE_NUMBER_SERIES_EXHAUSTED",
              "The invoice number series has no remaining numbers.",
            );
          const number = formatInvoiceNumber({
            prefix: nextSequence.prefix,
            financialYear: nextSequence.financialYear,
            sequence: nextSequence.seq,
            sequenceWidth: nextSequence.width,
          });
          const issuedAt = current;
          const updateSettings = await BusinessSettings.updateOne(
            { businessId, "invoice.startMonthLockedAt": null },
            { $set: { "invoice.startMonthLockedAt": issuedAt } },
            { session },
          );
          void updateSettings;
          const businessLock = await Business.updateOne(
            { _id: businessId, currencyVersion: business.currencyVersion },
            {
              $set: {
                hasFinalizedRecords: true,
                currencyLockedAt: business.currencyLockedAt ?? issuedAt,
              },
            },
            { session },
          );
          if (!businessLock.matchedCount)
            throw new ApiError(
              409,
              "CURRENCY_MISMATCH",
              "The business currency changed while finalizing. Retry after reloading the invoice.",
            );
          const subscription = await Subscription.findOne({
            businessId,
          }).session(session);
          const planKey =
            subscription?.planKey ??
            business.billing.entitlementPlanKey ??
            "king";
          const limit = plans.plans[planKey]?.finalizedInvoicesPerMonth;
          const periodKey = businessDate(current, business.timezone).slice(
            0,
            7,
          );
          const usage = await UsageCounter.findOneAndUpdate(
            { businessId, periodKey },
            { $inc: { finalizedInvoices: 1 }, $set: { updatedAt: current } },
            {
              upsert: true,
              returnDocument: "after",
              setDefaultsOnInsert: true,
              session,
            },
          );
          if (Number.isFinite(limit) && usage.finalizedInvoices > limit)
            throw new ApiError(
              402,
              "PLAN_LIMIT_REACHED",
              "The plan's monthly finalized-invoice limit has been reached.",
              { limit, periodKey },
            );

          invoice.number = number;
          invoice.status = "issued";
          invoice.financialYear = fy;
          invoice.templateType = business.tax.gstRegistered
            ? calculated.values.items.some(
                (line) => line.taxability === "taxable",
              ) ||
              calculated.values.charges.some(
                (line) => line.taxability === "taxable",
              )
              ? "tax_invoice"
              : "bill_of_supply"
            : "invoice";
          invoice.supplyType = supply.supplyType;
          invoice.stateTaxLabel = supply.stateTaxLabel;
          invoice.recipientContext = recipientContext;
          invoice.hsnRequirement = hsn.requirement;
          invoice.hsnMinDigits = hsn.minDigits;
          invoice.customerSnapshot = snapshotCustomer(customer);
          invoice.businessSnapshot = snapshotBusiness(business, settings);
          invoice.calcVersion = CALC_VERSION;
          invoice.items = calculated.values.items;
          invoice.charges = calculated.values.charges;
          invoice.totals = calculated.values.totals;
          invoice.byTaxability = calculated.values.byTaxability;
          invoice.taxSummary = calculated.values.taxSummary;
          invoice.amountPaidMinor = 0;
          invoice.balanceMinor = calculated.values.totals.totalMinor;
          invoice.reverseCharge = business.tax.gstRegistered
            ? {
                status: "not_applicable",
                confirmedBy: userId,
                confirmedAt: issuedAt,
                note: "",
              }
            : {
                status: "unset",
                confirmedBy: null,
                confirmedAt: null,
                note: "",
              };
          invoice.issuedAt = issuedAt;
          invoice.issuedBy = userId;
          const finalPlain = invoice.toObject();
          const { buffer } = await renderInvoicePdf(finalPlain);
          const sha256 = createHash("sha256").update(buffer).digest("hex");
          staged = await storage.stage({
            buffer,
            filename: `${number}.pdf`,
            mimeType: "application/pdf",
            businessId: idString(businessId),
            purpose: "invoice_pdf",
          });
          const [file] = await StoredFile.create(
            [
              {
                businessId,
                purpose: "invoice_pdf",
                provider: storage.name ?? "local",
                publicId: staged.id,
                deliveryType: "private",
                filename: `${number}.pdf`,
                mime: "application/pdf",
                size: buffer.length,
                sha256,
                uploadedBy: userId,
              },
            ],
            { session },
          );
          invoice.pdfFileId = file._id;
          invoice.pdfSha256 = sha256;
          invoice.pdfTemplateVersion = "invoice-pdf-v1";
          await invoice.save({ session });
          await auditRecord({
            businessId,
            actorId: userId,
            action: "invoice.finalized",
            entityId: invoice._id,
            before,
            after: serializeInvoice(invoice),
            ip,
            at: current,
            session,
          });
          result = {
            invoice: serializeInvoice(invoice),
            warnings: hsn.warnings,
          };
          await saveIdempotency({
            businessId,
            key: input.idempotencyKey,
            operation,
            requestHash,
            resourceId: invoice._id,
            response: result,
            at: current,
            session,
          });
          await beforeFinalizeCommit({
            invoice: serializeInvoice(invoice),
            session,
          });
        });
      } catch (error) {
        if (staged) await storage.remove?.(staged).catch(() => {});
        if (error?.code === 11000) {
          const replay = await findIdempotent({
            businessId,
            key: input.idempotencyKey,
            operation,
            requestHash,
          }).catch(() => null);
          if (replay) return replay;
          if (attempt < 2) continue;
        }
        throw error;
      } finally {
        await session.endSession();
      }
      if (staged) await storage.promote(staged);
      await reminders.syncInvoice({ businessId, invoiceId, at: current });
      return result;
    }
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Could not safely finalize the invoice. Reload and retry.",
    );
  }

  async function beginEmailDelivery({
    businessId,
    invoiceId,
    userId,
    input,
    ip,
  }) {
    const operation = "invoice.email_begin";
    const requestHash = invoiceRequestHash(operation, invoiceId, input);
    const replay = await findIdempotent({
      businessId,
      key: input.idempotencyKey,
      operation,
      requestHash,
    });
    if (replay) return replay;
    const current = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne({
          _id: invoiceId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!invoice)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        if (!["issued", "sent", "partially_paid"].includes(invoice.status))
          throw new ApiError(
            422,
            "INVOICE_EMAIL_NOT_ALLOWED",
            "This invoice cannot be emailed in its current state.",
          );
        const customer = await Customer.findOne({
          _id: invoice.customerId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!customer?.email)
          throw badRequest(
            "CUSTOMER_EMAIL_REQUIRED",
            "Add an email address to the customer before emailing this invoice.",
          );
        const attempt =
          (await InvoiceDelivery.countDocuments({
            businessId,
            invoiceId,
            method: "email",
          }).session(session)) + 1;
        const messageId = `<invoice-${invoiceId}-${attempt}@invoiceflow.local>`;
        const leaseToken = randomHexToken();
        const changed = await Invoice.updateOne(
          {
            _id: invoiceId,
            businessId,
            archivedAt: null,
            status: { $in: ["issued", "sent", "partially_paid"] },
            deliveryFenceSeq: invoice.deliveryFenceSeq,
          },
          { $inc: { deliveryFenceSeq: 1 } },
          { session },
        );
        if (!changed.matchedCount)
          throw new ApiError(
            422,
            "INVOICE_EMAIL_NOT_ALLOWED",
            "Invoice state changed. Reload before attempting email.",
          );
        const [delivery] = await InvoiceDelivery.create(
          [
            {
              businessId,
              invoiceId,
              method: "email",
              via: "smtp",
              status: "started",
              recordedAt: current,
              recordedBy: userId,
              recipient: maskEmail(customer.email),
              messageId,
              attempt,
              manual: input.manual ?? false,
              idempotencyKey: input.idempotencyKey,
              leaseToken,
            },
          ],
          { session },
        );
        result = {
          deliveryId: delivery._id.toString(),
          messageId,
          attempt,
          leaseToken,
          recipient: maskEmail(customer.email),
          fenceSeq: invoice.deliveryFenceSeq + 1,
        };
        await saveIdempotency({
          businessId,
          key: input.idempotencyKey,
          operation,
          requestHash,
          resourceId: invoiceId,
          response: result,
          at: current,
          session,
        });
        await auditRecord({
          businessId,
          actorId: userId,
          action: "invoice.email_started",
          entityId: invoiceId,
          before: serializeInvoice(invoice),
          after: result,
          ip,
          at: current,
          session,
        });
      });
    } catch (error) {
      if (error?.code === 11000) {
        const saved = await findIdempotent({
          businessId,
          key: input.idempotencyKey,
          operation,
          requestHash,
        });
        if (saved) return saved;
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function completeEmailDelivery({
    businessId,
    invoiceId,
    deliveryId,
    leaseToken,
    status,
    error: deliveryError = null,
    userId,
    ip,
  }) {
    if (
      ![
        "accepted",
        "failed_retryable",
        "failed_permanent",
        "uncertain",
      ].includes(status)
    )
      throw new TypeError("Unsupported invoice email outcome.");
    const current = now();
    const session = await mongoose.startSession();
    let response;
    try {
      await session.withTransaction(async () => {
        const delivery = await InvoiceDelivery.findOne({
          _id: deliveryId,
          businessId,
          invoiceId,
          method: "email",
          status: "started",
          leaseToken,
        }).session(session);
        if (!delivery)
          throw new ApiError(
            409,
            "EMAIL_DELIVERY_STATE_CHANGED",
            "The email attempt is no longer active.",
          );
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
        delivery.status = status;
        delivery.leaseToken = null;
        delivery.error = deliveryError
          ? {
              code: deliveryError.code ?? "SMTP_ERROR",
              message:
                deliveryError.message ?? "The email attempt did not complete.",
            }
          : { code: null, message: null };
        await delivery.save({ session });
        if (status === "accepted" && invoice.status === "issued") {
          invoice.status = "sent";
          invoice.sentAt = current;
          invoice.sentVia = "email";
          invoice.sentBasis = "email_accepted";
          invoice.sentBy = userId;
          await invoice.save({ session });
        }
        await auditRecord({
          businessId,
          actorId: userId,
          action: `invoice.email_${status}`,
          entityId: invoiceId,
          after: { deliveryId, status, recordedAt: current },
          ip,
          at: current,
          session,
        });
        response = {
          deliveryId: delivery._id.toString(),
          status,
          invoice: serializeInvoice(invoice),
        };
      });
    } finally {
      await session.endSession();
    }
    return response;
  }

  async function previewPdf({ businessId, invoiceId }) {
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      businessId,
      archivedAt: null,
    }).lean();
    if (!invoice)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    if (invoice.status !== "draft")
      return downloadPdf({ businessId, invoiceId });
    const { buffer } = await renderInvoicePdf(invoice);
    return { buffer, filename: "invoice-draft.pdf", status: "draft" };
  }

  async function downloadPdf({ businessId, invoiceId, userId }) {
    if (!storage?.read)
      throw new ApiError(
        503,
        "PDF_STORAGE_UNAVAILABLE",
        "Invoice PDF storage is not available.",
      );
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      businessId,
      archivedAt: null,
    });
    if (!invoice)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    if (invoice.status === "draft") {
      const { buffer } = await renderInvoicePdf(invoice);
      return { buffer, filename: "invoice-draft.pdf", status: "draft" };
    }
    const file = await StoredFile.findOne({
      _id: invoice.pdfFileId,
      businessId,
      purpose: "invoice_pdf",
    });
    if (!file)
      throw new ApiError(
        404,
        "PDF_NOT_FOUND",
        "The archived invoice PDF was not found.",
      );
    const buffer = await storage.read(file.publicId);
    const hash = createHash("sha256").update(buffer).digest("hex");
    if (hash !== invoice.pdfSha256 || hash !== file.sha256)
      throw new ApiError(
        500,
        "PDF_INTEGRITY_FAILED",
        "The archived invoice PDF failed its integrity check.",
      );
    if (userId) {
      await InvoiceDelivery.create({
        businessId,
        invoiceId,
        method: "pdf_download",
        status: "recorded",
        recordedAt: now(),
        recordedBy: userId,
      });
    }
    return { buffer, filename: file.filename, status: invoice.status };
  }

  async function markSent({ businessId, invoiceId, userId, input, ip }) {
    const operation = "invoice.mark_sent";
    const requestHash = invoiceRequestHash(operation, invoiceId, input);
    const replay = await findIdempotent({
      businessId,
      key: input.idempotencyKey,
      operation,
      requestHash,
    });
    if (replay) return replay;
    const current = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne({
          _id: invoiceId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!invoice)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        if (!["issued", "sent"].includes(invoice.status))
          throw new ApiError(
            409,
            "INVOICE_STATUS_INVALID",
            "Only issued invoices can be marked as sent.",
          );
        const before = serializeInvoice(invoice);
        const declaredAt = new Date(input.declaredAt);
        if (invoice.status === "issued") {
          invoice.status = "sent";
          invoice.sentAt = declaredAt;
          invoice.sentVia = input.via;
          invoice.sentBasis = "user_declared";
          invoice.sentBy = userId;
          await invoice.save({ session });
        }
        const [delivery] = await InvoiceDelivery.create(
          [
            {
              businessId,
              invoiceId,
              method: "mark_sent",
              via: input.via,
              status: "recorded",
              declaredAt,
              recordedAt: current,
              recordedBy: userId,
              note: input.note,
              idempotencyKey: input.idempotencyKey,
            },
          ],
          { session },
        );
        await auditRecord({
          businessId,
          actorId: userId,
          action: "invoice.marked_sent",
          entityId: invoiceId,
          before,
          after: serializeInvoice(invoice),
          ip,
          at: current,
          session,
        });
        result = {
          invoice: serializeInvoice(invoice),
          deliveryId: delivery._id.toString(),
        };
        await saveIdempotency({
          businessId,
          key: input.idempotencyKey,
          operation,
          requestHash,
          resourceId: invoiceId,
          response: result,
          at: current,
          session,
        });
      });
    } catch (error) {
      if (error?.code === 11000) {
        const saved = await findIdempotent({
          businessId,
          key: input.idempotencyKey,
          operation,
          requestHash,
        });
        if (saved) return saved;
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return result;
  }

  async function unmarkSent({ businessId, invoiceId, userId, input, ip }) {
    const operation = "invoice.unmark_sent";
    const requestHash = invoiceRequestHash(operation, invoiceId, input);
    const replay = await findIdempotent({
      businessId,
      key: input.idempotencyKey,
      operation,
      requestHash,
    });
    if (replay) return replay;
    const current = now();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne({
          _id: invoiceId,
          businessId,
          archivedAt: null,
        }).session(session);
        if (!invoice)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The requested resource was not found.",
          );
        const deliveries = await InvoiceDelivery.find({ businessId, invoiceId })
          .session(session)
          .lean();
        let reason;
        if (
          invoice.amountPaidMinor > 0 ||
          ["partially_paid", "paid"].includes(invoice.status)
        )
          reason = "has_payments";
        else if (invoice.customerEmailExposure?.acceptedAt)
          reason = "customer_email_accepted";
        else if (invoice.customerEmailExposure?.uncertainAt)
          reason = "customer_email_uncertain";
        else if (
          deliveries.some(
            (row) =>
              row.method === "email" &&
              ["started", "accepted", "uncertain"].includes(row.status),
          )
        )
          reason = deliveries.some(
            (row) => row.method === "email" && row.status === "started",
          )
            ? "email_in_flight"
            : "sent_by_email";
        else if (
          deliveries.some(
            (row) => row.method === "email" && row.status === "accepted",
          )
        )
          reason = "sent_by_email";
        else if (invoice.status !== "sent") reason = "not_sent";
        if (reason) {
          const retryable = reason === "email_in_flight";
          throw new ApiError(
            422,
            "UNMARK_SENT_NOT_ALLOWED",
            retryable
              ? "An email is being sent. Try again in a minute."
              : "This sent invoice cannot be unmarked.",
            { reason, ...(retryable ? { retryable: true } : {}) },
          );
        }
        const before = serializeInvoice(invoice);
        const previousDeliveryIds = deliveries
          .filter((row) => row.method === "mark_sent")
          .map((row) => row._id);
        const changed = await Invoice.updateOne(
          {
            _id: invoiceId,
            businessId,
            status: "sent",
            deliveryFenceSeq: invoice.deliveryFenceSeq,
          },
          {
            $set: {
              status: "issued",
              sentAt: null,
              sentVia: null,
              sentBasis: null,
              sentBy: null,
            },
            $inc: { deliveryFenceSeq: 1 },
          },
          { session },
        );
        if (!changed.matchedCount)
          throw new ApiError(
            422,
            "UNMARK_SENT_NOT_ALLOWED",
            "An email is being sent. Try again in a minute.",
            { reason: "email_in_flight", retryable: true },
          );
        const after = await Invoice.findById(invoiceId).session(session);
        const [delivery] = await InvoiceDelivery.create(
          [
            {
              businessId,
              invoiceId,
              method: "unmark_sent",
              status: "recorded",
              recordedAt: current,
              recordedBy: userId,
              reverses: previousDeliveryIds,
              note: input.note,
              idempotencyKey: input.idempotencyKey,
            },
          ],
          { session },
        );
        await auditRecord({
          businessId,
          actorId: userId,
          action: "invoice.unmarked_sent",
          entityId: invoiceId,
          before,
          after: serializeInvoice(after),
          ip,
          at: current,
          session,
        });
        result = {
          invoice: serializeInvoice(after),
          deliveryId: delivery._id.toString(),
        };
        await saveIdempotency({
          businessId,
          key: input.idempotencyKey,
          operation,
          requestHash,
          resourceId: invoiceId,
          response: result,
          at: current,
          session,
        });
      });
    } catch (error) {
      if (error?.code === 11000) {
        const saved = await findIdempotent({
          businessId,
          key: input.idempotencyKey,
          operation,
          requestHash,
        });
        if (saved) return saved;
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return result;
  }

  return {
    create,
    update,
    get,
    list,
    removeDraft,
    archive,
    clearAmounts,
    finalize,
    beginEmailDelivery,
    completeEmailDelivery,
    previewPdf,
    downloadPdf,
    markSent,
    unmarkSent,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
