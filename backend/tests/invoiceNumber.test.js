import { describe, expect, it } from "vitest";
import {
  formatInvoiceNumber,
  getFinancialYear,
  nextInvoiceSequence,
  validateInvoiceSeries,
} from "../src/utils/invoiceNumber.js";

describe("financial-year invoice series arithmetic", () => {
  it.each([
    ["2026-04-01", 4, "2627"],
    ["2027-03-31", 4, "2627"],
    ["2027-04-01", 4, "2728"],
    ["2000-04-01", 4, "0001"],
    ["2099-04-01", 4, "9900"],
    ["2026-06-15", 1, "2627"],
  ])("labels %s with start month %i as %s", (date, month, label) => {
    expect(getFinancialYear(date, month).label).toBe(label);
  });

  it("keeps labels unique across the supported range and rejects out-of-range years", () => {
    const labels = Array.from(
      { length: 100 },
      (_, index) => getFinancialYear(`${2000 + index}-04-01`).label,
    );
    expect(new Set(labels).size).toBe(100);
    expect(() => getFinancialYear("1999-12-31")).toThrowError(
      expect.objectContaining({ code: "FINANCIAL_YEAR_OUT_OF_RANGE" }),
    );
    expect(() => getFinancialYear("2100-04-01")).toThrowError(
      expect.objectContaining({ code: "FINANCIAL_YEAR_OUT_OF_RANGE" }),
    );
  });

  it("validates the maximum number width and formats the invoice number", () => {
    expect(
      validateInvoiceSeries({ prefix: "ABCDE", sequenceWidth: 6 }).maxSeq,
    ).toBe(999999);
    expect(
      formatInvoiceNumber({
        prefix: "ABCDE",
        financialYear: "2627",
        sequence: 999999,
        sequenceWidth: 6,
      }),
    ).toBe("ABCDE2627-999999");
    expect(() =>
      validateInvoiceSeries({ prefix: "ABCDE", sequenceWidth: 7 }),
    ).toThrowError(
      expect.objectContaining({ code: "INVOICE_NUMBER_FORMAT_INVALID" }),
    );
    expect(() =>
      formatInvoiceNumber({
        prefix: "INV",
        financialYear: "2627",
        sequence: 1000000,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVOICE_NUMBER_SERIES_EXHAUSTED" }),
    );
    expect(nextInvoiceSequence(999998)).toBe(999999);
    expect(() => nextInvoiceSequence(999999)).toThrowError(
      expect.objectContaining({ code: "INVOICE_NUMBER_SERIES_EXHAUSTED" }),
    );
  });
});
