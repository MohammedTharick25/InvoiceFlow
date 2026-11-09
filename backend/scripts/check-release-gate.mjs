import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { calculateFinancials } from "../src/utils/financialCalculations.js";
import { buildInvoicePdfModel } from "../src/modules/invoices/pdf.service.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const reviewedFiles = [
  "backend/src/modules/invoices/pdf.service.js",
  "backend/src/utils/money.js",
  "backend/src/utils/gstDisclaimer.js",
  "backend/src/config/gst-state-codes.json",
  "backend/assets/fonts/NotoSansDevanagari-Regular.woff",
];

export async function getReleaseMetadata(baseDir = root) {
  const calculation = calculateFinancials({
    items: [],
    supplyType: "none",
  });
  const pdfTemplateVersion = buildInvoicePdfModel({
    status: "draft",
  }).templateVersion;
  const hash = createHash("sha256");
  for (const relativePath of reviewedFiles) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(path.join(baseDir, relativePath)));
    hash.update("\0");
  }
  return {
    calcVersion: calculation.calcVersion,
    pdfTemplateVersion,
    pdfTemplateHash: hash.digest("hex"),
  };
}

export function validateAccountantSignoff(markdown, metadata) {
  const fields = [
    "Reviewer",
    "Qualification",
    "Date",
    "Scope",
    "Findings",
    "Resolutions",
    "calcVersion",
    "pdfTemplateVersion",
    "pdfTemplateHash",
  ];
  const values = Object.fromEntries(
    fields.map((field) => {
      const match = markdown.match(
        new RegExp(`^\\s*${field}\\s*:\\s*(.*?)\\s*$`, "im"),
      );
      return [field, match?.[1] ?? ""];
    }),
  );
  const problems = fields
    .filter(
      (field) =>
        !values[field] ||
        /^(?:todo|tbd|pending|insert|placeholder)$/i.test(values[field]),
    )
    .map((field) => `Missing or placeholder field: ${field}`);
  const date = values.Date;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    problems.push("Date must be a valid YYYY-MM-DD date.");
  }
  for (const field of [
    "calcVersion",
    "pdfTemplateVersion",
    "pdfTemplateHash",
  ]) {
    if (values[field] !== metadata[field])
      problems.push(`${field} does not match current code.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(values.pdfTemplateHash))
    problems.push("pdfTemplateHash must be a SHA-256 hex digest.");
  return problems;
}

export async function checkReleaseGate({
  baseDir = root,
  signoffPath = path.join(baseDir, "docs/compliance/ACCOUNTANT_SIGNOFF.md"),
} = {}) {
  const metadata = await getReleaseMetadata(baseDir);
  let signoff;
  try {
    signoff = await readFile(signoffPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      ok: false,
      metadata,
      problems: [
        `Missing accountant sign-off: ${path.relative(baseDir, signoffPath)}`,
      ],
    };
  }
  const problems = validateAccountantSignoff(signoff, metadata);
  return { ok: problems.length === 0, metadata, problems };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const result = await checkReleaseGate();
  console.log(
    `Current release metadata: ${JSON.stringify(result.metadata, null, 2)}`,
  );
  if (!result.ok) {
    console.error("Production release gate failed:");
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log("Production release gate passed.");
  }
}
