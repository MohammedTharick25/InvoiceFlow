import { badRequest } from "./ApiError.js";

export const MIN_FINANCIAL_YEAR_START = 2000;
export const MAX_FINANCIAL_YEAR_START = 2099;
const PREFIX_PATTERN = /^[A-Za-z0-9/-]{1,5}$/;

export function asCalendarDate(value) {
  const date =
    typeof value === "string"
      ? value
      : value instanceof Date
        ? value.toISOString().slice(0, 10)
        : "";
  if (
    !/^\d{4}-\d\d-\d\d$/.test(date) ||
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
  )
    throw new RangeError("Expected a valid YYYY-MM-DD calendar date.");
  return {
    date,
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
  };
}

export function getFinancialYear(value, startMonth = 4) {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12)
    throw new RangeError("Financial year start month must be 1 to 12.");
  const { year, month } = asCalendarDate(value);
  const startYear = month >= startMonth ? year : year - 1;
  if (
    startYear < MIN_FINANCIAL_YEAR_START ||
    startYear > MAX_FINANCIAL_YEAR_START
  ) {
    throw badRequest(
      "FINANCIAL_YEAR_OUT_OF_RANGE",
      "The invoice date is outside the supported financial-year range.",
      { startYear },
    );
  }
  return {
    startYear,
    label: `${String(startYear % 100).padStart(2, "0")}${String((startYear + 1) % 100).padStart(2, "0")}`,
    counterKey: `invoice:${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
  };
}

export function validateInvoiceSeries({ prefix, sequenceWidth = 6 }) {
  if (
    typeof prefix !== "string" ||
    !PREFIX_PATTERN.test(prefix) ||
    !Number.isInteger(sequenceWidth) ||
    sequenceWidth < 6 ||
    prefix.length + 4 + 1 + sequenceWidth > 16
  ) {
    throw badRequest(
      "INVOICE_NUMBER_FORMAT_INVALID",
      "Invoice prefix and sequence width do not fit the 16-character limit.",
    );
  }
  return { prefix, sequenceWidth, maxSeq: 10 ** sequenceWidth - 1 };
}

export function formatInvoiceNumber({
  prefix,
  financialYear,
  sequence,
  sequenceWidth = 6,
}) {
  const series = validateInvoiceSeries({ prefix, sequenceWidth });
  const fy =
    typeof financialYear === "string" ? financialYear : financialYear?.label;
  if (
    !/^\d{4}$/.test(fy ?? "") ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    sequence > series.maxSeq
  ) {
    throw badRequest(
      "INVOICE_NUMBER_SERIES_EXHAUSTED",
      "The invoice number series has no remaining numbers.",
    );
  }
  const invoiceNumber = `${prefix}${fy}-${String(sequence).padStart(sequenceWidth, "0")}`;
  if (invoiceNumber.length > 16 || !/^[A-Za-z0-9/-]+$/.test(invoiceNumber))
    throw badRequest(
      "INVOICE_NUMBER_FORMAT_INVALID",
      "Invoice number does not fit the supported format.",
    );
  return invoiceNumber;
}

export function nextInvoiceSequence(currentSequence, sequenceWidth = 6) {
  if (!Number.isSafeInteger(currentSequence) || currentSequence < 0)
    throw new RangeError("Sequence must be a non-negative integer.");
  const maxSeq = 10 ** sequenceWidth - 1;
  if (currentSequence >= maxSeq)
    throw badRequest(
      "INVOICE_NUMBER_SERIES_EXHAUSTED",
      "The invoice number series has no remaining numbers.",
    );
  return currentSequence + 1;
}
