import { badRequest } from "./ApiError.js";

export const TAXABILITIES = Object.freeze([
  "taxable",
  "zero_rated",
  "exempt",
  "nil_rated",
  "non_gst",
]);
export const PLACE_OF_SUPPLY_BASES = Object.freeze([
  "customer_billing",
  "customer_registered",
  "ship_to",
  "business_location",
  "manual",
]);
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidHsnSac(value) {
  return typeof value === "string" && /^(?:\d{4}|\d{6}|\d{8})$/.test(value);
}

export function assertHsnSac(value, { required = false, minDigits = 4 } = {}) {
  if (!value && required)
    throw badRequest(
      "HSN_SAC_REQUIRED",
      "HSN/SAC is required by the selected policy.",
    );
  if (!value) return true;
  if (!isValidHsnSac(value))
    throw badRequest(
      "HSN_SAC_INVALID",
      "HSN/SAC must contain 4, 6, or 8 digits.",
    );
  if (value.length < minDigits)
    throw badRequest(
      "HSN_SAC_TOO_SHORT",
      `HSN/SAC must contain at least ${minDigits} digits.`,
    );
  return true;
}

export function evaluateHsnPolicy(rules, turnoverBand, context, codes = []) {
  const rule = rules?.[turnoverBand]?.[context];
  if (!rule)
    throw new RangeError(
      "No HSN/SAC rule exists for the selected turnover band and context.",
    );
  if (!["required", "recommended", "not_required"].includes(rule.requirement)) {
    throw new RangeError(
      "HSN/SAC requirement must be required, recommended, or not_required.",
    );
  }
  const warnings = [];
  for (const [index, code] of codes.entries()) {
    if (rule.requirement === "required") {
      assertHsnSac(code, { required: true, minDigits: rule.minDigits });
      continue;
    }
    assertHsnSac(code);
    if (
      rule.requirement === "recommended" &&
      (!code || code.length < rule.minDigits)
    ) {
      warnings.push({
        index,
        reason: !code ? "missing" : "below_recommended_length",
        minDigits: rule.minDigits,
      });
    }
  }
  return { requirement: rule.requirement, minDigits: rule.minDigits, warnings };
}

export function isValidGstin(gstin, stateCode) {
  return (
    typeof gstin === "string" &&
    GSTIN_PATTERN.test(gstin) &&
    (!stateCode || gstin.slice(0, 2) === stateCode)
  );
}

export function deriveSupplyType({
  gstRegistered,
  businessStateCode,
  placeOfSupplyStateCode,
}) {
  if (!gstRegistered) return "none";
  if (!placeOfSupplyStateCode)
    throw badRequest(
      "PLACE_OF_SUPPLY_REQUIRED",
      "Confirm the place of supply before finalizing.",
    );
  return businessStateCode === placeOfSupplyStateCode ? "intra" : "inter";
}

export function validateOtherSupplyLines(lines, supplyType) {
  if (supplyType !== "other") return true;
  if (lines.some((line) => line.taxability === "taxable")) {
    throw badRequest(
      "TAXABLE_LINE_NOT_SUPPORTED_FOR_SUPPLY_TYPE",
      "Taxable lines are not supported for this supply type.",
    );
  }
  return true;
}

export function placeOfSupplyCandidates({
  billingStateCode,
  registeredStateCode,
  shipToStateCode,
  businessStateCode,
}) {
  return [
    ["customer_billing", billingStateCode],
    ["customer_registered", registeredStateCode],
    ["ship_to", shipToStateCode],
    ["business_location", businessStateCode],
  ]
    .filter(([, stateCode]) => Boolean(stateCode))
    .map(([basis, stateCode]) => ({ basis, stateCode }));
}
