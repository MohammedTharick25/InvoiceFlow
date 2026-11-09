import { describe, expect, it } from "vitest";
import {
  MAX_MONEY_MINOR,
  MAX_QUANTITY_MILLI,
  assertMoneyMinor,
  formatMoney,
  parseMajorToMinor,
  parseQuantityMilli,
  roundHalfUp,
  sumMoney,
  toSafeNumber,
} from "../src/utils/money.js";

describe("money parsing and safe arithmetic", () => {
  it("parses string values using currency precision", () => {
    expect(parseMajorToMinor("1234.56", "INR")).toBe(123456);
    expect(parseMajorToMinor("1234", "JPY")).toBe(1234);
    expect(parseMajorToMinor("1.125", "KWD")).toBe(1125);
    expect(parseQuantityMilli("1.5")).toBe(1500);
    expect(parseQuantityMilli("1000000.000")).toBe(Number(MAX_QUANTITY_MILLI));
  });

  it.each(["", "-1", "-0", "1e3", "NaN", "Infinity", "1,000", "01", "1.001"])(
    "rejects invalid INR amount %s",
    (value) => {
      expect(() => parseMajorToMinor(value, "INR")).toThrow();
    },
  );

  it.each(["-1", "1.0001", "1e3", "Infinity", "1,000"])(
    "rejects invalid quantity %s",
    (value) => {
      expect(() => parseQuantityMilli(value)).toThrow();
    },
  );

  it("enforces all stored-value boundaries and rejects negative zero", () => {
    expect(assertMoneyMinor(Number(MAX_MONEY_MINOR))).toBe(
      Number(MAX_MONEY_MINOR),
    );
    expect(() => assertMoneyMinor(Number(MAX_MONEY_MINOR) + 1)).toThrowError(
      expect.objectContaining({ code: "AMOUNT_OUT_OF_RANGE" }),
    );
    for (const invalid of [
      -0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER,
      NaN,
      Infinity,
      "4",
    ])
      expect(() => assertMoneyMinor(invalid)).toThrow();
    expect(() => toSafeNumber(MAX_MONEY_MINOR + 1n)).toThrowError(
      expect.objectContaining({ code: "AMOUNT_OUT_OF_RANGE" }),
    );
  });

  it("uses round-half-up on BigInt values and formats without float conversion", () => {
    expect(roundHalfUp(5n, 2n)).toBe(3n);
    expect(roundHalfUp(4n, 2n)).toBe(2n);
    expect(formatMoney(123456789n, "INR")).toContain("12,34,567.89");
    expect(sumMoney([10, 20, 30])).toBe(60);
  });
});
