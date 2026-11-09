import { badRequest } from "./ApiError.js";
import {
  MAX_CHARGES,
  MAX_LINE_ITEMS,
  MAX_MONEY_MINOR,
  assertMoneyMinor,
  roundHalfUp,
  toSafeNumber,
} from "./money.js";
import { TAXABILITIES, validateOtherSupplyLines } from "./gst.js";

const ZERO_BUCKETS = () => ({
  taxableMinor: 0n,
  taxMinor: 0n,
  cgstMinor: 0n,
  sgstMinor: 0n,
  igstMinor: 0n,
});

function asBigInt(value, name) {
  return BigInt(assertMoneyMinor(value, name));
}

function allocateLargestRemainder(amount, bases) {
  const total = bases.reduce((sum, value) => sum + value, 0n);
  if (amount === 0n) return bases.map(() => 0n);
  if (total === 0n || amount > total)
    throw badRequest(
      "INVOICE_DISCOUNT_OUT_OF_RANGE",
      "Invoice discount exceeds item value.",
    );
  const parts = bases.map((base, index) => {
    const numerator = amount * base;
    return { index, amount: numerator / total, remainder: numerator % total };
  });
  let remaining = amount - parts.reduce((sum, part) => sum + part.amount, 0n);
  const priority = [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let i = 0; remaining > 0n; i += 1, remaining -= 1n)
    priority[i].amount += 1n;
  return parts.map((part) => part.amount);
}

function lineBase(line, index, rates, supplyType, allocatedDiscount = 0n) {
  if (!TAXABILITIES.includes(line.taxability))
    throw badRequest(
      "INVALID_TAXABILITY",
      `Line ${index + 1} has an invalid taxability category.`,
    );
  const quantityMilli = BigInt(line.quantityMilli);
  if (quantityMilli < 0n || quantityMilli > 10n ** 9n)
    throw badRequest(
      "INVALID_QUANTITY",
      `Line ${index + 1} quantity is outside the supported range.`,
    );
  if (!Number.isSafeInteger(line.quantityMilli))
    throw badRequest(
      "INVALID_QUANTITY",
      `Line ${index + 1} quantity must be integer milli-units.`,
    );
  const unitPriceMinor = asBigInt(
    line.unitPriceMinor,
    `Line ${index + 1} unit price`,
  );
  const gross = roundHalfUp(quantityMilli * unitPriceMinor, 1000n);
  if (
    line.discount?.type === "percent" &&
    (!Number.isInteger(line.discount.rateBp) ||
      line.discount.rateBp < 0 ||
      line.discount.rateBp > 10000)
  ) {
    throw badRequest(
      "INVALID_DISCOUNT_RATE",
      `Line ${index + 1} discount rate must be 0 to 10000 basis points.`,
    );
  }
  const discount =
    line.discount?.type === "percent"
      ? roundHalfUp(gross * BigInt(line.discount.rateBp), 10000n)
      : line.discount?.type === "fixed"
        ? asBigInt(line.discount.amountMinor, `Line ${index + 1} discount`)
        : 0n;
  if (discount > gross)
    throw badRequest(
      "DISCOUNT_EXCEEDS_GROSS",
      `Line ${index + 1} discount exceeds its value.`,
    );
  const taxableMinor = gross - discount - allocatedDiscount;
  if (taxableMinor < 0n)
    throw badRequest(
      "INVOICE_DISCOUNT_OUT_OF_RANGE",
      "Invoice discount exceeds item value.",
    );

  let rateBp = 0;
  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;
  if (line.taxability === "taxable" && supplyType !== "none") {
    rateBp = rates[line.taxCode]?.rateBp ?? rates[line.taxCode];
    if (!Number.isInteger(rateBp) || rateBp <= 0 || rateBp > 10000)
      throw badRequest(
        "TAX_RATE_NOT_CONFIGURED",
        `No valid tax rate is configured for ${line.taxCode ?? "this line"}.`,
      );
    if (supplyType === "intra") {
      cgst = roundHalfUp(taxableMinor * BigInt(rateBp), 20000n);
      sgst = cgst;
    } else if (supplyType === "inter") {
      igst = roundHalfUp(taxableMinor * BigInt(rateBp), 10000n);
    } else {
      throw new RangeError(`Unknown supply type: ${supplyType}`);
    }
  }
  const taxMinor = cgst + sgst + igst;
  const lineTotal = taxableMinor + taxMinor;
  return {
    ...line,
    grossMinor: toSafeNumber(gross),
    discountMinor: toSafeNumber(discount),
    invoiceDiscountMinor: toSafeNumber(allocatedDiscount),
    taxableMinor: toSafeNumber(taxableMinor),
    rateBp,
    cgstMinor: toSafeNumber(cgst),
    sgstMinor: toSafeNumber(sgst),
    igstMinor: toSafeNumber(igst),
    taxMinor: toSafeNumber(taxMinor),
    lineTotalMinor: toSafeNumber(lineTotal),
  };
}

export function calculateFinancials({
  items,
  charges = [],
  invoiceDiscountMinor = 0,
  supplyType,
  rates = {},
  stateTaxLabel = "SGST",
}) {
  if (!Array.isArray(items) || items.length > MAX_LINE_ITEMS)
    throw badRequest(
      "TOO_MANY_LINE_ITEMS",
      `An invoice may contain at most ${MAX_LINE_ITEMS} items.`,
    );
  if (!Array.isArray(charges) || charges.length > MAX_CHARGES)
    throw badRequest(
      "TOO_MANY_CHARGES",
      `An invoice may contain at most ${MAX_CHARGES} charges.`,
    );
  if (!["none", "intra", "inter", "other"].includes(supplyType))
    throw new RangeError(`Unknown supply type: ${supplyType}`);
  validateOtherSupplyLines([...items, ...charges], supplyType);

  const invoiceDiscount = asBigInt(invoiceDiscountMinor, "Invoice discount");
  const initial = items.map((item, index) => {
    if (!Number.isSafeInteger(item.quantityMilli) || item.quantityMilli < 0)
      throw badRequest(
        "INVALID_QUANTITY",
        `Line ${index + 1} quantity must be integer milli-units.`,
      );
    if (item.quantityMilli > 10 ** 9)
      throw badRequest(
        "INVALID_QUANTITY",
        `Line ${index + 1} quantity is outside the supported range.`,
      );
    const gross = roundHalfUp(
      BigInt(item.quantityMilli) * asBigInt(item.unitPriceMinor, "Unit price"),
      1000n,
    );
    if (
      item.discount?.type === "percent" &&
      (!Number.isInteger(item.discount.rateBp) ||
        item.discount.rateBp < 0 ||
        item.discount.rateBp > 10000)
    ) {
      throw badRequest(
        "INVALID_DISCOUNT_RATE",
        `Line ${index + 1} discount rate must be 0 to 10000 basis points.`,
      );
    }
    const lineDiscount =
      item.discount?.type === "percent"
        ? roundHalfUp(gross * BigInt(item.discount.rateBp), 10000n)
        : item.discount?.type === "fixed"
          ? asBigInt(item.discount.amountMinor, "Line discount")
          : 0n;
    if (lineDiscount > gross)
      throw badRequest(
        "DISCOUNT_EXCEEDS_GROSS",
        `Line ${index + 1} discount exceeds its value.`,
      );
    return gross - lineDiscount;
  });
  const allocated = allocateLargestRemainder(invoiceDiscount, initial);
  const calculatedItems = items.map((item, index) =>
    lineBase(item, index, rates, supplyType, allocated[index]),
  );
  const calculatedCharges = charges.map((charge, index) =>
    lineBase(
      {
        ...charge,
        quantityMilli: 1000,
        unitPriceMinor: charge.amountMinor,
        discount: undefined,
      },
      index,
      rates,
      supplyType,
      0n,
    ),
  );
  const allLines = [...calculatedItems, ...calculatedCharges];
  const byTaxability = Object.fromEntries(
    TAXABILITIES.map((category) => [category, ZERO_BUCKETS()]),
  );
  const summaries = new Map();
  for (const line of allLines) {
    const bucket = byTaxability[line.taxability];
    bucket.taxableMinor += BigInt(line.taxableMinor);
    bucket.taxMinor += BigInt(line.taxMinor);
    bucket.cgstMinor += BigInt(line.cgstMinor);
    bucket.sgstMinor += BigInt(line.sgstMinor);
    bucket.igstMinor += BigInt(line.igstMinor);
    if (line.taxability === "taxable" && line.rateBp > 0 && line.taxCode) {
      const key = `${line.taxCode}:${line.rateBp}`;
      const summary = summaries.get(key) ?? {
        taxCode: line.taxCode,
        rateBp: line.rateBp,
        taxableMinor: 0n,
        cgstMinor: 0n,
        sgstMinor: 0n,
        igstMinor: 0n,
      };
      summary.taxableMinor += BigInt(line.taxableMinor);
      summary.cgstMinor += BigInt(line.cgstMinor);
      summary.sgstMinor += BigInt(line.sgstMinor);
      summary.igstMinor += BigInt(line.igstMinor);
      summaries.set(key, summary);
    }
  }
  const total = (key) =>
    allLines.reduce((sum, line) => sum + BigInt(line[key]), 0n);
  const totals = {
    subtotalMinor: toSafeNumber(
      allLines.reduce((sum, line) => sum + BigInt(line.grossMinor), 0n),
    ),
    lineDiscountMinor: toSafeNumber(
      allLines.reduce((sum, line) => sum + BigInt(line.discountMinor), 0n),
    ),
    invoiceDiscountMinor: toSafeNumber(invoiceDiscount),
    taxableMinor: toSafeNumber(total("taxableMinor")),
    cgstMinor: toSafeNumber(total("cgstMinor")),
    [stateTaxLabel.toLowerCase() === "utgst" ? "utgstMinor" : "sgstMinor"]:
      toSafeNumber(total("sgstMinor")),
    igstMinor: toSafeNumber(total("igstMinor")),
    taxMinor: toSafeNumber(total("taxMinor")),
    totalMinor: toSafeNumber(total("lineTotalMinor")),
  };
  const safeBuckets = Object.fromEntries(
    Object.entries(byTaxability).map(([key, value]) => [
      key,
      Object.fromEntries(
        Object.entries(value).map(([field, amount]) => [
          field,
          toSafeNumber(amount),
        ]),
      ),
    ]),
  );
  return {
    items: calculatedItems,
    charges: calculatedCharges,
    totals,
    byTaxability: safeBuckets,
    taxSummary: [...summaries.values()].map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === "bigint" ? toSafeNumber(value) : value,
        ]),
      ),
    ),
    calcVersion: "gst-calc-v1",
    stateTaxLabel,
  };
}

export function allocateInvoiceDiscount(amountMinor, itemGrosses) {
  const amount = asBigInt(amountMinor, "Invoice discount");
  const bases = itemGrosses.map((gross) => asBigInt(gross, "Item gross"));
  return allocateLargestRemainder(amount, bases).map((part) =>
    toSafeNumber(part),
  );
}

export function withinInvoiceLimit(value) {
  return BigInt(value) <= MAX_MONEY_MINOR;
}
