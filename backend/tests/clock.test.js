import { describe, expect, it } from "vitest";
import {
  businessDate,
  dateAtUtcMidnight,
  now,
  resetClock,
  setClock,
} from "../src/utils/clock.js";

describe("injectable clock and UTC date contract", () => {
  it("uses an injectable instant and derives business-local calendar dates", () => {
    setClock(() => new Date("2026-04-01T00:30:00.000Z"));
    try {
      expect(now().toISOString()).toBe("2026-04-01T00:30:00.000Z");
      expect(businessDate(now(), "America/Los_Angeles")).toBe("2026-03-31");
      expect(dateAtUtcMidnight("2026-03-31").toISOString()).toBe(
        "2026-03-31T00:00:00.000Z",
      );
    } finally {
      resetClock();
    }
  });
});
