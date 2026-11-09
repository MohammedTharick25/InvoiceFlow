import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  scanText,
  checkClaims,
  sentenceHash,
} from "../../scripts/claimScanner.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("forbidden-claims guard", () => {
  it("rejects positive claims and handles negation within one sentence", async () => {
    const fixtures = JSON.parse(
      await readFile(
        new URL("./fixtures/claims.json", import.meta.url),
        "utf8",
      ),
    );
    for (const sentence of fixtures.reject)
      expect(scanText(sentence, "fixture").length).toBeGreaterThan(0);
    const allowlist = JSON.parse(
      await readFile(
        path.resolve(root, "docs/compliance/claims-allowlist.json"),
        "utf8",
      ),
    ).sentences;
    for (const sentence of fixtures.accept)
      expect(
        scanText(sentence, "fixture", { allowlistedHashes: allowlist }),
      ).toHaveLength(0);
    expect(allowlist).toContain(
      sentenceHash(
        "It does not file GST returns, give tax advice, or guarantee compliance.",
      ),
    );
    expect(
      scanText("Not only quick but GST compliant.", "fixture"),
    ).toHaveLength(1);
    expect(
      scanText("It is not compliant, however, certified.", "fixture"),
    ).toHaveLength(1);
  });

  it("requires the exact disclaimer in the README, tax settings, export header and landing footer", async () => {
    expect(await checkClaims(root)).toEqual([]);
  }, 15000);
});
