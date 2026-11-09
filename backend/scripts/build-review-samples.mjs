import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { calculateFinancials } from "../src/utils/financialCalculations.js";
import { renderInvoicePdf } from "../src/modules/invoices/pdf.service.js";

const outputDirectory = fileURLToPath(
  new URL("../../docs/compliance/sample-pdfs/", import.meta.url),
);
await mkdir(outputDirectory, { recursive: true });

const rates = { GST5: 500, GST18: 1800 };
const scenarios = [
  {
    file: "intra-mixed-discount-charge.pdf",
    name: "Intra-state mixed rates, invoice discount, and taxable charge",
    supplyType: "intra",
    businessStateCode: "29",
    placeOfSupplyStateCode: "29",
    items: [
      {
        description: "Consulting services",
        hsnSac: "998311",
        quantityMilli: 1000,
        unitPriceMinor: 10000,
        taxability: "taxable",
        taxCode: "GST18",
      },
      {
        description: "Printed manuals",
        hsnSac: "490110",
        quantityMilli: 2000,
        unitPriceMinor: 2500,
        taxability: "taxable",
        taxCode: "GST5",
      },
    ],
    charges: [
      {
        description: "Delivery",
        amountMinor: 500,
        taxability: "taxable",
        taxCode: "GST5",
      },
    ],
    invoiceDiscountMinor: 1000,
  },
  {
    file: "inter-state-igst.pdf",
    name: "Inter-state supply with IGST",
    supplyType: "inter",
    businessStateCode: "29",
    placeOfSupplyStateCode: "27",
    items: [
      {
        description: "Consulting services",
        hsnSac: "998311",
        quantityMilli: 1000,
        unitPriceMinor: 10000,
        taxability: "taxable",
        taxCode: "GST18",
      },
    ],
  },
  {
    file: "non-taxable-categories.pdf",
    name: "Exempt, nil-rated, and non-GST categories",
    supplyType: "none",
    businessStateCode: "29",
    placeOfSupplyStateCode: "29",
    registered: false,
    items: [
      {
        description: "Exempt item",
        quantityMilli: 1000,
        unitPriceMinor: 10000,
        taxability: "exempt",
        taxabilityNote: "Illustrative review category",
      },
      {
        description: "Nil-rated item",
        quantityMilli: 1000,
        unitPriceMinor: 5000,
        taxability: "nil_rated",
        taxabilityNote: "Illustrative review category",
      },
      {
        description: "Non-GST item",
        quantityMilli: 1000,
        unitPriceMinor: 2500,
        taxability: "non_gst",
        taxabilityNote: "Illustrative review category",
      },
    ],
  },
  {
    file: "other-supply.pdf",
    name: "Other supply type with non-taxable category",
    supplyType: "other",
    businessStateCode: "29",
    placeOfSupplyStateCode: "29",
    registered: false,
    items: [
      {
        description: "Other non-taxable supply",
        quantityMilli: 1000,
        unitPriceMinor: 7200,
        taxability: "non_gst",
        taxabilityNote: "Illustrative review category",
      },
    ],
  },
];

for (const [index, scenario] of scenarios.entries()) {
  const calculation = calculateFinancials({
    items: scenario.items,
    charges: scenario.charges ?? [],
    invoiceDiscountMinor: scenario.invoiceDiscountMinor ?? 0,
    rates,
    supplyType: scenario.supplyType,
  });
  const registered = scenario.registered ?? true;
  const invoice = {
    status: "issued",
    number: `REVIEW-${String(index + 1).padStart(4, "0")}`,
    issueDate: new Date("2026-11-09T00:00:00.000Z"),
    dueDate: new Date("2026-11-23T00:00:00.000Z"),
    currency: "INR",
    items: calculation.items,
    charges: calculation.charges,
    totals: calculation.totals,
    taxSummary: calculation.taxSummary,
    placeOfSupply: { stateCode: scenario.placeOfSupplyStateCode },
    stateTaxLabel: "SGST",
    businessSnapshot: {
      name: "InvoiceFlow Accountant Review Fixture",
      address: {
        line1: "Example Road",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "India",
      },
      tax: registered
        ? { gstRegistered: true, gstin: "29ABCDE1234F1Z5" }
        : { gstRegistered: false },
      currency: "INR",
    },
    customerSnapshot: {
      name: "Illustrative Review Recipient",
      billingAddress: {
        line1: "Sample Street",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
      },
    },
    reverseCharge: registered
      ? { status: "not_applicable" }
      : { status: "unset" },
    notes: scenario.name,
  };
  const { buffer } = await renderInvoicePdf(invoice);
  await writeFile(path.join(outputDirectory, scenario.file), buffer);
}

process.stdout.write(
  `Generated ${scenarios.length} illustrative PDF samples in ${outputDirectory}\n`,
);
