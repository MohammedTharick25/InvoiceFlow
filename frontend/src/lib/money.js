import { badRequest } from "./ApiError.js";

export const MAX_MONEY_MINOR = 10n ** 13n;
export const MAX_QUANTITY_MILLI = 10n ** 9n;
export const MAX_LINE_ITEMS = 200;
export const MAX_CHARGES = 10;
export const CURRENCY_DECIMALS = Object.freeze({
  INR: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
  KWD: 3,
});

export function roundHalfUp(numerator, denominator) {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (n < 0n || d <= 0n)
    throw new RangeError(
      "roundHalfUp requires a non-negative numerator and positive denominator",
    );
  return (2n * n + d) / (2n * d);
}

export function toSafeNumber(value) {
  const n = BigInt(value);
  if (n < 0n || n > MAX_MONEY_MINOR || n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw badRequest(
      "AMOUNT_OUT_OF_RANGE",
      "Amount is outside the supported range.",
    );
  }
  return Number(n);
}

function parseDecimalString(value, maxDecimals, scale, maximum, code) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw badRequest(
      code,
      "Enter a non-negative decimal amount without separators or exponent notation.",
    );
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > maxDecimals)
    throw badRequest(code, `Use no more than ${maxDecimals} decimal places.`);
  const minor =
    BigInt(whole) * scale +
    BigInt((fraction + "0".repeat(maxDecimals)).slice(0, maxDecimals) || "0");
  if (minor > maximum || minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw badRequest(
      "AMOUNT_OUT_OF_RANGE",
      "Amount is outside the supported range.",
    );
  return Number(minor);
}

export function parseMajorToMinor(value, currency = "INR") {
  const decimals = CURRENCY_DECIMALS[currency];
  if (decimals === undefined)
    throw new RangeError(`Unsupported currency: ${currency}`);
  return parseDecimalString(
    value,
    decimals,
    10n ** BigInt(decimals),
    MAX_MONEY_MINOR,
    "INVALID_MONEY",
  );
}

export function parseQuantityMilli(value) {
  return parseDecimalString(
    value,
    3,
    1000n,
    MAX_QUANTITY_MILLI,
    "INVALID_QUANTITY",
  );
}

export function assertMoneyMinor(value, name = "amount") {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < 0 ||
    value > Number(MAX_MONEY_MINOR)
  ) {
    throw badRequest(
      "AMOUNT_OUT_OF_RANGE",
      `${name} is outside the supported range.`,
    );
  }
  return value;
}

export function formatMoney(value, currency = "INR", locale = "en-IN") {
  const decimals = CURRENCY_DECIMALS[currency];
  if (decimals === undefined)
    throw new RangeError(`Unsupported currency: ${currency}`);
  const minor = BigInt(value);
  if (minor < 0n)
    throw badRequest(
      "AMOUNT_OUT_OF_RANGE",
      "Amount is outside the supported range.",
    );
  const scale = 10n ** BigInt(decimals);
  const whole = (minor / scale).toString();
  const fraction = decimals
    ? (minor % scale).toString().padStart(decimals, "0")
    : "";
  const grouped = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(BigInt(whole));
  const symbol =
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency;
  return `${symbol}${grouped}${decimals ? `.${fraction}` : ""}`;
}

export function sumMoney(values) {
  return toSafeNumber(
    values.reduce((sum, value) => sum + BigInt(assertMoneyMinor(value)), 0n),
  );
}
