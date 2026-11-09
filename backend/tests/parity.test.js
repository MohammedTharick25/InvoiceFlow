import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseMajorToMinor,
  parseQuantityMilli,
  roundHalfUp,
} from "../src/utils/money.js";
import { calculateFinancials } from "../src/utils/financialCalculations.js";

const fixtures = JSON.parse(
  await readFile(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../shared/financial-parity.json",
    ),
    "utf8",
  ),
);

describe("backend shared financial parity fixtures", () => {
  it.each(fixtures)("$name", (fixture) => {
    const actual =
      fixture.kind === "round"
        ? roundHalfUp(
            BigInt(fixture.numerator),
            BigInt(fixture.denominator),
          ).toString()
        : fixture.kind === "money"
          ? parseMajorToMinor(fixture.value, fixture.currency)
          : fixture.kind === "quantity"
            ? parseQuantityMilli(fixture.value)
            : fixture.kind === "calculation"
              ? calculateFinancials(fixture.input).items.map((line) => ({
                  taxableMinor: line.taxableMinor,
                  cgstMinor: line.cgstMinor,
                  sgstMinor: line.sgstMinor,
                  igstMinor: line.igstMinor,
                  lineTotalMinor: line.lineTotalMinor,
                }))
              : null;
    expect(actual).toEqual(fixture.expected);
  });
});
