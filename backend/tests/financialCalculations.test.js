import { describe, expect, it } from "vitest";
import {
  calculateFinancials,
  allocateInvoiceDiscount,
} from "../src/utils/financialCalculations.js";

const rates = { GST5: { rateBp: 500 }, GST18: { rateBp: 1800 } };
const item = (overrides = {}) => ({
  description: "Item",
  quantityMilli: 1000,
  unitPriceMinor: 10010,
  taxability: "taxable",
  taxCode: "GST5",
  ...overrides,
});

describe("financial calculations (gst-calc-v1 provisional policy)", () => {
  it("uses independent per-line half-up CGST and SGST rounding", () => {
    const result = calculateFinancials({
      items: [item()],
      rates,
      supplyType: "intra",
    });
    expect(result.items[0]).toMatchObject({
      cgstMinor: 250,
      sgstMinor: 250,
      taxMinor: 500,
      lineTotalMinor: 10510,
    });
    expect(result.calcVersion).toBe("gst-calc-v1");
  });

  it("uses IGST for inter-state taxable lines and no GST for unregistered supplies", () => {
    expect(
      calculateFinancials({ items: [item()], rates, supplyType: "inter" })
        .items[0],
    ).toMatchObject({ cgstMinor: 0, sgstMinor: 0, igstMinor: 501 });
    expect(
      calculateFinancials({ items: [item()], rates, supplyType: "none" })
        .items[0],
    ).toMatchObject({ taxMinor: 0, lineTotalMinor: 10010 });
  });

  it("keeps non-taxable categories separate and applies charges outside invoice discounts", () => {
    const result = calculateFinancials({
      items: [
        item({ unitPriceMinor: 10000 }),
        item({
          taxability: "exempt",
          taxCode: undefined,
          unitPriceMinor: 5000,
        }),
      ],
      charges: [
        {
          description: "Shipping",
          amountMinor: 2000,
          taxability: "taxable",
          taxCode: "GST5",
        },
      ],
      invoiceDiscountMinor: 1000,
      rates,
      supplyType: "intra",
    });
    expect(result.items[0].invoiceDiscountMinor).toBe(667);
    expect(result.items[1].invoiceDiscountMinor).toBe(333);
    expect(result.charges[0].invoiceDiscountMinor).toBe(0);
    expect(result.byTaxability.exempt.taxableMinor).toBe(4667);
    expect(result.totals.invoiceDiscountMinor).toBe(1000);
  });

  it("allocates invoice discount exactly with deterministic largest remainders", () => {
    expect(allocateInvoiceDiscount(2, [1, 1, 1])).toEqual([1, 1, 0]);
    for (let count = 1; count <= 200; count += 1) {
      const grosses = Array.from({ length: count }, (_, index) => index + 1);
      const allocated = allocateInvoiceDiscount(count, grosses);
      expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(count);
    }
  });

  it("rejects missing rates, invalid categories, unsupported lines and hard limits", () => {
    expect(() =>
      calculateFinancials({ items: [item()], supplyType: "intra" }),
    ).toThrowError(
      expect.objectContaining({ code: "TAX_RATE_NOT_CONFIGURED" }),
    );
    expect(() =>
      calculateFinancials({
        items: [item({ taxability: "invalid" })],
        rates,
        supplyType: "intra",
      }),
    ).toThrow();
    expect(() =>
      calculateFinancials({ items: [item()], rates, supplyType: "other" }),
    ).toThrowError(
      expect.objectContaining({
        code: "TAXABLE_LINE_NOT_SUPPORTED_FOR_SUPPLY_TYPE",
      }),
    );
    expect(() =>
      calculateFinancials({
        items: Array.from({ length: 201 }, () => item()),
        rates,
        supplyType: "intra",
      }),
    ).toThrowError(expect.objectContaining({ code: "TOO_MANY_LINE_ITEMS" }));
    expect(() =>
      calculateFinancials({
        items: Array.from({ length: 200 }, () =>
          item({ unitPriceMinor: 10_000_000_000_000 }),
        ),
        rates,
        supplyType: "none",
      }),
    ).toThrowError(expect.objectContaining({ code: "AMOUNT_OUT_OF_RANGE" }));
  });

  it("passes a fixed seeded arithmetic sweep", () => {
    let seed = 0x5eed1234;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    for (let run = 0; run < 2500; run += 1) {
      const lines = Array.from({ length: 1 + (next() % 8) }, () =>
        item({
          quantityMilli: 1 + (next() % 1_000_000),
          unitPriceMinor: next() % 100_000,
          taxCode: next() % 2 ? "GST5" : "GST18",
        }),
      );
      const result = calculateFinancials({
        items: lines,
        rates,
        supplyType: next() % 2 ? "intra" : "inter",
      });
      expect(
        result.items.every((line) => line.cgstMinor === line.sgstMinor),
      ).toBe(true);
      expect(result.totals.totalMinor).toBe(
        result.items.reduce((sum, line) => sum + line.lineTotalMinor, 0),
      );
      expect(
        result.items.every(
          (line) =>
            line.lineTotalMinor >= 0 &&
            line.taxMinor === line.cgstMinor + line.sgstMinor + line.igstMinor,
        ),
      ).toBe(true);
    }
  });
});
