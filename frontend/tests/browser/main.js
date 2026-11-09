import fixtures from "../../../shared/financial-parity.json";
import {
  parseMajorToMinor,
  parseQuantityMilli,
  roundHalfUp,
} from "../../src/lib/money.js";
import { calculateFinancials } from "../../src/lib/financialCalculations.js";

const results = fixtures.map((fixture) => {
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
  return {
    name: fixture.name,
    passed: JSON.stringify(actual) === JSON.stringify(fixture.expected),
    actual,
  };
});

document.querySelector("#results").textContent = JSON.stringify(results);
