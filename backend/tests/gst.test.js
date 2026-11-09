import { describe, expect, it } from "vitest";
import hsnRules from "../src/config/gst-hsn-rules.json" with { type: "json" };
import stateCodes from "../src/config/gst-state-codes.json" with { type: "json" };
import {
  assertHsnSac,
  deriveSupplyType,
  evaluateHsnPolicy,
  isValidGstin,
  isValidHsnSac,
  placeOfSupplyCandidates,
  validateOtherSupplyLines,
} from "../src/utils/gst.js";

describe("GST configuration and pure validation helpers", () => {
  it("validates HSN/SAC format and applies configured policy", () => {
    expect(isValidHsnSac("1234")).toBe(true);
    expect(isValidHsnSac("123456")).toBe(true);
    expect(isValidHsnSac("12345678")).toBe(true);
    for (const code of ["123", "12345", "12A4", 1234])
      expect(isValidHsnSac(code)).toBe(false);
    expect(
      evaluateHsnPolicy(hsnRules.turnoverBands, "unspecified", "b2b", ["1234"]),
    ).toEqual({ requirement: "recommended", minDigits: 4, warnings: [] });
    expect(() => assertHsnSac(undefined, { required: true })).toThrowError(
      expect.objectContaining({ code: "HSN_SAC_REQUIRED" }),
    );
    expect(() => assertHsnSac("1234", { minDigits: 6 })).toThrowError(
      expect.objectContaining({ code: "HSN_SAC_TOO_SHORT" }),
    );
  });

  it("warns for recommended HSN/SAC, blocks required, and leaves not-required optional", () => {
    const rules = {
      band: {
        b2b: { requirement: "recommended", minDigits: 6 },
        b2c: { requirement: "required", minDigits: 6 },
        other: { requirement: "not_required", minDigits: 8 },
      },
    };
    expect(
      evaluateHsnPolicy(rules, "band", "b2b", ["1234", undefined]).warnings,
    ).toEqual([
      { index: 0, reason: "below_recommended_length", minDigits: 6 },
      { index: 1, reason: "missing", minDigits: 6 },
    ]);
    expect(() =>
      evaluateHsnPolicy(rules, "band", "b2c", [undefined]),
    ).toThrowError(expect.objectContaining({ code: "HSN_SAC_REQUIRED" }));
    expect(() =>
      evaluateHsnPolicy(rules, "band", "b2c", ["1234"]),
    ).toThrowError(expect.objectContaining({ code: "HSN_SAC_TOO_SHORT" }));
    expect(evaluateHsnPolicy(rules, "band", "other", [undefined])).toEqual({
      requirement: "not_required",
      minDigits: 8,
      warnings: [],
    });
    expect(() =>
      evaluateHsnPolicy(rules, "band", "other", ["bad"]),
    ).toThrowError(expect.objectContaining({ code: "HSN_SAC_INVALID" }));
  });

  it("has a rule for every declared turnover band and recipient context", () => {
    for (const rule of Object.values(hsnRules.turnoverBands)) {
      expect(rule).toHaveProperty("b2b");
      expect(rule).toHaveProperty("b2c");
      for (const contextRule of Object.values(rule)) {
        expect(["required", "recommended", "not_required"]).toContain(
          contextRule.requirement,
        );
        expect([4, 6, 8]).toContain(contextRule.minDigits);
      }
    }
  });

  it("checks GSTIN format and state prefix only", () => {
    expect(isValidGstin("27AAPFU0939F1ZV", "27")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZV", "29")).toBe(false);
    expect(isValidGstin("bad", "27")).toBe(false);
  });

  it("derives only from explicit place-of-supply choices and rejects taxable other supplies", () => {
    expect(
      deriveSupplyType({ gstRegistered: false, businessStateCode: "27" }),
    ).toBe("none");
    expect(() =>
      deriveSupplyType({ gstRegistered: true, businessStateCode: "27" }),
    ).toThrowError(
      expect.objectContaining({ code: "PLACE_OF_SUPPLY_REQUIRED" }),
    );
    expect(
      deriveSupplyType({
        gstRegistered: true,
        businessStateCode: "27",
        placeOfSupplyStateCode: "27",
      }),
    ).toBe("intra");
    expect(
      deriveSupplyType({
        gstRegistered: true,
        businessStateCode: "27",
        placeOfSupplyStateCode: "29",
      }),
    ).toBe("inter");
    expect(() =>
      validateOtherSupplyLines([{ taxability: "taxable" }], "other"),
    ).toThrowError(
      expect.objectContaining({
        code: "TAXABLE_LINE_NOT_SUPPORTED_FOR_SUPPLY_TYPE",
      }),
    );
    expect(validateOtherSupplyLines([{ taxability: "exempt" }], "other")).toBe(
      true,
    );
  });

  it("returns labeled candidates without applying a legal suggestion rule", () => {
    expect(
      placeOfSupplyCandidates({
        billingStateCode: "27",
        shipToStateCode: "29",
        businessStateCode: "27",
      }),
    ).toEqual([
      { basis: "customer_billing", stateCode: "27" },
      { basis: "ship_to", stateCode: "29" },
      { basis: "business_location", stateCode: "27" },
    ]);
  });

  it("keeps state reference codes unique and marks a second tax label for each territory", async () => {
    const codes = stateCodes.states.map((state) => state.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(
      stateCodes.states.every((state) =>
        ["SGST", "UTGST"].includes(state.intraSecondTax),
      ),
    ).toBe(true);
    expect(stateCodes.states.some((state) => state.code === "97")).toBe(true);
  });
});
