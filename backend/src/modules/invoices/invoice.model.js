import mongoose from "mongoose";
import { TAXABILITIES } from "../../utils/gst.js";

const amount = { type: Number, min: 0, required: true };
const objectId = mongoose.Schema.Types.ObjectId;

const discountSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["none", "percent", "fixed"], default: "none" },
    rateBp: { type: Number, min: 0, max: 10000, default: 0 },
    amountMinor: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const invoiceLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 500 },
    hsnSac: { type: String, default: "", maxlength: 8 },
    unit: { type: String, default: "unit", trim: true, maxlength: 30 },
    quantityMilli: { type: Number, required: true, min: 0, max: 1_000_000_000 },
    unitPriceMinor: amount,
    discount: { type: discountSchema, default: () => ({}) },
    taxability: { type: String, enum: TAXABILITIES, required: true },
    taxCode: { type: String, default: "" },
    taxRateVersionId: { type: objectId, default: null },
    rateBp: { type: Number, min: 0, max: 10000, default: 0 },
    taxabilityNote: { type: String, default: "", maxlength: 500 },
    grossMinor: { type: Number, min: 0, default: 0 },
    discountMinor: { type: Number, min: 0, default: 0 },
    invoiceDiscountMinor: { type: Number, min: 0, default: 0 },
    taxableMinor: { type: Number, min: 0, default: 0 },
    cgstMinor: { type: Number, min: 0, default: 0 },
    sgstMinor: { type: Number, min: 0, default: 0 },
    igstMinor: { type: Number, min: 0, default: 0 },
    taxMinor: { type: Number, min: 0, default: 0 },
    lineTotalMinor: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const chargeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["shipping", "packing", "insurance", "other"],
      required: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 250 },
    amountMinor: amount,
    hsnSac: { type: String, default: "", maxlength: 8 },
    taxability: { type: String, enum: TAXABILITIES, required: true },
    taxCode: { type: String, default: "" },
    taxRateVersionId: { type: objectId, default: null },
    rateBp: { type: Number, min: 0, max: 10000, default: 0 },
    taxabilityNote: { type: String, default: "", maxlength: 500 },
    grossMinor: { type: Number, min: 0, default: 0 },
    taxableMinor: { type: Number, min: 0, default: 0 },
    cgstMinor: { type: Number, min: 0, default: 0 },
    sgstMinor: { type: Number, min: 0, default: 0 },
    igstMinor: { type: Number, min: 0, default: 0 },
    taxMinor: { type: Number, min: 0, default: 0 },
    lineTotalMinor: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    businessId: {
      type: objectId,
      ref: "Business",
      required: true,
      immutable: true,
    },
    customerId: { type: objectId, ref: "Customer", required: true },
    number: { type: String, default: null, maxlength: 16 },
    status: {
      type: String,
      enum: ["draft", "issued", "sent", "partially_paid", "paid", "cancelled"],
      default: "draft",
      required: true,
    },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },
    taxPointDate: { type: Date, default: null },
    currency: {
      type: String,
      enum: ["INR", "USD", "EUR", "JPY", "KWD"],
      required: true,
    },
    currencyVersion: { type: Number, required: true },
    invoiceDiscountMinor: { type: Number, min: 0, default: 0 },
    templateType: {
      type: String,
      enum: ["tax_invoice", "invoice", "bill_of_supply"],
      default: "invoice",
    },
    financialYear: { startYear: Number, label: String },
    placeOfSupply: {
      stateCode: { type: String, default: "" },
      basis: {
        type: String,
        enum: [
          "customer_billing",
          "customer_registered",
          "ship_to",
          "business_location",
          "manual",
          null,
        ],
        default: null,
      },
      overridden: { type: Boolean, default: false },
      note: { type: String, default: "", maxlength: 500 },
    },
    shipTo: {
      address: { type: mongoose.Schema.Types.Mixed, default: undefined },
      stateCode: { type: String, default: "" },
    },
    supplyType: {
      type: String,
      enum: ["none", "intra", "inter", "other"],
      default: "none",
    },
    supplyNote: { type: String, default: "", maxlength: 500 },
    stateTaxLabel: { type: String, enum: ["SGST", "UTGST"], default: "SGST" },
    recipientContext: { type: String, enum: ["b2b", "b2c"], default: "b2c" },
    recipientContextOverride: {
      overridden: { type: Boolean, default: false },
      reason: { type: String, default: "", maxlength: 500 },
    },
    hsnRequirement: {
      type: String,
      enum: ["required", "recommended", "not_required"],
      default: "recommended",
    },
    hsnMinDigits: { type: Number, enum: [4, 6, 8], default: 4 },
    customerSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    businessSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    calcVersion: { type: String, default: "gst-calc-v1" },
    items: { type: [invoiceLineSchema], default: [] },
    charges: { type: [chargeSchema], default: [] },
    totals: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ totalMinor: 0 }),
    },
    byTaxability: { type: mongoose.Schema.Types.Mixed, default: {} },
    taxSummary: { type: [mongoose.Schema.Types.Mixed], default: [] },
    amountPaidMinor: { type: Number, min: 0, default: 0 },
    balanceMinor: { type: Number, min: 0, default: 0 },
    notes: { type: String, default: "", maxlength: 4000 },
    terms: { type: String, default: "", maxlength: 4000 },
    reverseCharge: {
      status: {
        type: String,
        enum: ["unset", "not_applicable", "applies", "unsure"],
        default: "unset",
      },
      confirmedBy: { type: objectId, default: null },
      confirmedAt: { type: Date, default: null },
      note: { type: String, default: "", maxlength: 500 },
    },
    issuedAt: { type: Date, default: null },
    issuedBy: { type: objectId, default: null },
    sentAt: { type: Date, default: null },
    sentVia: { type: String, default: null },
    sentBasis: {
      type: String,
      enum: ["user_declared", "email_accepted", null],
      default: null,
    },
    sentBy: { type: objectId, default: null },
    deliveryFenceSeq: { type: Number, min: 0, default: 0 },
    reminderVersion: { type: Number, min: 0, default: 0 },
    customerEmailExposure: {
      acceptedAt: { type: Date, default: null },
      acceptedDeliveryId: { type: objectId, default: null },
      uncertainAt: { type: Date, default: null },
      uncertainDeliveryId: { type: objectId, default: null },
    },
    pdfFileId: { type: objectId, default: null },
    pdfSha256: { type: String, default: null },
    pdfTemplateVersion: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    duplicateOf: { type: objectId, default: null },
    createdBy: { type: objectId, ref: "User", required: true },
  },
  { timestamps: true },
);

invoiceSchema.index(
  { businessId: 1, number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: "string" } } },
);
invoiceSchema.index({ businessId: 1, status: 1, dueDate: 1 });
invoiceSchema.index({ businessId: 1, customerId: 1, issueDate: -1 });
invoiceSchema.index({ businessId: 1, issueDate: -1 });

export const Invoice = mongoose.model("Invoice", invoiceSchema);
