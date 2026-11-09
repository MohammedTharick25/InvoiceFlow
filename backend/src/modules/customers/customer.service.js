import mongoose from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { isValidGstin } from "../../utils/gst.js";
import { isConfiguredStateCode } from "./customer.validation.js";
import { Customer } from "./customer.model.js";
import { Business } from "../businesses/business.model.js";
import { Invoice } from "../invoices/invoice.model.js";
import { Expense } from "../expenses/expense.model.js";
import { ActivityLog } from "../activity-logs/activity-log.model.js";

function notFound() {
  return new ApiError(
    404,
    "NOT_FOUND",
    "The requested resource was not found.",
  );
}

function assertPartyState({ gstin, stateCode }) {
  if (!isConfiguredStateCode(stateCode)) {
    throw new ApiError(
      422,
      "STATE_CODE_INVALID",
      "Choose a state code from the configured reference list.",
    );
  }
  if (gstin && !isValidGstin(gstin, stateCode)) {
    throw new ApiError(
      422,
      "GSTIN_INVALID",
      "Enter a valid GSTIN that starts with the billing state code.",
    );
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeCustomer(customer) {
  return {
    id: customer._id.toString(),
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    billingAddress: customer.billingAddress,
    ...(customer.shippingAddress
      ? { shippingAddress: customer.shippingAddress }
      : {}),
    gstin: customer.gstin,
    notes: customer.notes,
    reminderPrefs: customer.reminderPrefs,
    archivedAt: customer.archivedAt,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export function createCustomerService({ now = () => new Date() } = {}) {
  async function findDuplicates({ businessId, input }) {
    const clauses = [];
    if (input.email) clauses.push({ email: input.email.toLowerCase() });
    const phone = String(input.phone ?? "").replace(/\D/g, "");
    if (phone)
      clauses.push({
        phone: {
          $regex: `^\\D*${phone.split("").map(escapeRegExp).join("\\D*")}\\D*$`,
        },
      });
    if (input.gstin) clauses.push({ gstin: input.gstin.toUpperCase() });
    if (input.name?.trim())
      clauses.push({
        name: {
          $regex: `^${input.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          $options: "i",
        },
      });
    if (!clauses.length) return [];
    const matches = await Customer.find({
      businessId,
      archivedAt: null,
      $or: clauses,
    })
      .select("name email phone gstin")
      .sort({ name: 1 })
      .limit(10)
      .lean();
    return matches
      .filter((customer) => {
        const emailMatch =
          input.email &&
          customer.email.toLowerCase() === input.email.toLowerCase();
        const phoneMatch = phone && customer.phone.replace(/\D/g, "") === phone;
        const gstinMatch =
          input.gstin && customer.gstin === input.gstin.toUpperCase();
        const nameMatch =
          customer.name.toLocaleLowerCase() ===
          input.name.trim().toLocaleLowerCase();
        return emailMatch || phoneMatch || gstinMatch || nameMatch;
      })
      .map((customer) => ({
        name: customer.name,
        matches: [
          ...(input.email &&
          customer.email.toLowerCase() === input.email.toLowerCase()
            ? ["email"]
            : []),
          ...(phone && customer.phone.replace(/\D/g, "") === phone
            ? ["phone"]
            : []),
          ...(input.gstin && customer.gstin === input.gstin.toUpperCase()
            ? ["GSTIN"]
            : []),
          ...(customer.name.toLocaleLowerCase() ===
          input.name.trim().toLocaleLowerCase()
            ? ["name"]
            : []),
        ],
      }));
  }

  async function seedSampleData({ businessId, userId, ip }) {
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const business = await Business.findOneAndUpdate(
          { _id: businessId, sampleDataLoadedAt: null },
          { $set: { sampleDataLoadedAt: now() } },
          { returnDocument: "after", session },
        );
        if (!business)
          throw new ApiError(
            409,
            "SAMPLE_DATA_ALREADY_USED",
            "Sample data can be added once to an empty workspace.",
          );
        const customerCount = await Customer.countDocuments({
          businessId,
        }).session(session);
        const invoiceCount = await Invoice.countDocuments({
          businessId,
        }).session(session);
        const expenseCount = await Expense.countDocuments({
          businessId,
        }).session(session);
        if (customerCount || invoiceCount || expenseCount)
          throw new ApiError(
            409,
            "SAMPLE_DATA_WORKSPACE_NOT_EMPTY",
            "Sample data is available only before adding business records.",
          );
        const stateCode = business.address?.stateCode || "27";
        const customers = await Customer.create(
          [
            {
              businessId,
              name: "Sample Customer - Northwind Traders",
              email: "northwind.sample@example.invalid",
              phone: "9000000001",
              billingAddress: {
                line1: "101 Sample Street",
                line2: "",
                city: "Mumbai",
                stateCode,
                postalCode: "400001",
                country: "India",
              },
              archivedAt: null,
            },
            {
              businessId,
              name: "Sample Customer - Cedar Works",
              email: "cedar.sample@example.invalid",
              phone: "9000000002",
              billingAddress: {
                line1: "202 Example Avenue",
                line2: "",
                city: "Pune",
                stateCode,
                postalCode: "411001",
                country: "India",
              },
              archivedAt: null,
            },
          ],
          { session, ordered: true },
        );
        result = {
          customers: customers.map(serializeCustomer),
          added: customers.length,
        };
        await ActivityLog.create(
          customers.map((customer) => ({
            businessId,
            actorId: userId,
            action: "customer.sample_created",
            entityType: "customer",
            entityId: customer._id,
            after: serializeCustomer(customer),
            ip: (ip ?? "").slice(0, 100),
            at: now(),
          })),
          { session, ordered: true },
        );
      });
    } finally {
      await session.endSession();
    }
    return result;
  }
  async function create({ businessId, input }) {
    assertPartyState({
      gstin: input.gstin,
      stateCode: input.billingAddress.stateCode,
    });
    const customer = await Customer.create({
      ...input,
      businessId,
      archivedAt: null,
    });
    return serializeCustomer(customer);
  }

  async function list({ businessId, search, page, limit }) {
    const filter = { businessId, archivedAt: null };
    if (search) filter.$text = { $search: search };
    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .sort(search ? { score: { $meta: "textScore" }, name: 1 } : { name: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Customer.countDocuments(filter),
    ]);
    return {
      customers: customers.map(serializeCustomer),
      page,
      limit,
      total,
    };
  }

  async function get({ businessId, customerId }) {
    if (!mongoose.isValidObjectId(customerId)) throw notFound();
    const customer = await Customer.findOne({
      _id: customerId,
      businessId,
      archivedAt: null,
    });
    if (!customer) throw notFound();
    return serializeCustomer(customer);
  }

  async function update({ businessId, customerId, input }) {
    if (!mongoose.isValidObjectId(customerId)) throw notFound();
    const customer = await Customer.findOne({
      _id: customerId,
      businessId,
      archivedAt: null,
    });
    if (!customer) throw notFound();

    const nextGstin = input.gstin ?? customer.gstin;
    const nextStateCode =
      input.billingAddress?.stateCode ?? customer.billingAddress.stateCode;
    assertPartyState({ gstin: nextGstin, stateCode: nextStateCode });

    const update = { ...input };
    const unset = {};
    if (update.shippingAddress === null) {
      delete update.shippingAddress;
      unset.shippingAddress = 1;
    }
    const updateDocument = { $set: update };
    if (Object.keys(unset).length) updateDocument.$unset = unset;
    updateDocument.$inc = { __v: 1 };
    const updated = await Customer.findOneAndUpdate(
      { _id: customerId, businessId, archivedAt: null, __v: customer.__v },
      updateDocument,
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) {
      const stillActive = await Customer.exists({
        _id: customerId,
        businessId,
        archivedAt: null,
      });
      if (!stillActive) throw notFound();
      throw new ApiError(
        409,
        "CUSTOMER_CHANGED",
        "This customer changed while you were editing it. Reload and try again.",
      );
    }
    return serializeCustomer(updated);
  }

  async function archive({ businessId, customerId }) {
    if (!mongoose.isValidObjectId(customerId)) throw notFound();
    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, businessId, archivedAt: null },
      { $set: { archivedAt: now() }, $inc: { __v: 1 } },
      { returnDocument: "after" },
    );
    if (!customer) throw notFound();
    return { id: customer._id.toString(), archivedAt: customer.archivedAt };
  }

  return { create, list, get, update, archive, findDuplicates, seedSampleData };
}

export { serializeCustomer };
