import { describe, expect, it } from "vitest";
import {
  getReleaseMetadata,
  validateAccountantSignoff,
} from "../scripts/check-release-gate.mjs";

describe("accountant production release gate", () => {
  it("reports the current calculation and PDF template review metadata", async () => {
    const metadata = await getReleaseMetadata();
    expect(metadata.calcVersion).toBe("gst-calc-v1");
    expect(metadata.pdfTemplateVersion).toBe("invoice-pdf-v1");
    expect(metadata.pdfTemplateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts a completed sign-off only when its versions and hash match", async () => {
    const metadata = await getReleaseMetadata();
    const signoff = [
      "Reviewer: Example Reviewer",
      "Qualification: Chartered Accountant",
      "Date: 2026-11-09",
      "Scope: Full review pack scope",
      "Findings: None",
      "Resolutions: None",
      `calcVersion: ${metadata.calcVersion}`,
      `pdfTemplateVersion: ${metadata.pdfTemplateVersion}`,
      `pdfTemplateHash: ${metadata.pdfTemplateHash}`,
    ].join("\n");
    expect(validateAccountantSignoff(signoff, metadata)).toEqual([]);
    expect(
      validateAccountantSignoff(
        signoff.replace(metadata.pdfTemplateHash, "0".repeat(64)),
        metadata,
      ),
    ).toContain("pdfTemplateHash does not match current code.");
  });

  it("rejects placeholders and impossible dates", () => {
    const metadata = {
      calcVersion: "gst-calc-v1",
      pdfTemplateVersion: "invoice-pdf-v1",
      pdfTemplateHash: "a".repeat(64),
    };
    const problems = validateAccountantSignoff(
      "Reviewer: TODO\nQualification: TODO\nDate: 2026-02-31\nScope: TODO\nFindings: TODO\nResolutions: TODO\ncalcVersion: gst-calc-v1\npdfTemplateVersion: invoice-pdf-v1\npdfTemplateHash: " +
        "a".repeat(64),
      metadata,
    );
    expect(problems).toContain("Missing or placeholder field: Reviewer");
    expect(problems).toContain("Date must be a valid YYYY-MM-DD date.");
  });
});
