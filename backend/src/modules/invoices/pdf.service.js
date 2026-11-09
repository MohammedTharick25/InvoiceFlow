import PDFDocument from "pdfkit";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import stateData from "../../config/gst-state-codes.json" with { type: "json" };
import { formatMoney } from "../../utils/money.js";
import { GST_DISCLAIMER } from "../../utils/gstDisclaimer.js";

const devanagariFont = fileURLToPath(
  new URL(
    "../../../assets/fonts/NotoSansDevanagari-Regular.woff",
    import.meta.url,
  ),
);

function wordsUnderThousand(value) {
  const ones = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  if (value < 20) return ones[value];
  if (value < 100)
    return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`;
  return `${ones[Math.floor(value / 100)]} hundred${value % 100 ? ` ${wordsUnderThousand(value % 100)}` : ""}`;
}

function wordsIndian(value) {
  if (value < 1000) return wordsUnderThousand(value);
  for (const [size, label] of [
    [10_000_000, "crore"],
    [100_000, "lakh"],
    [1_000, "thousand"],
  ]) {
    if (value >= size) {
      const group = Math.floor(value / size);
      const remainder = value % size;
      return `${wordsIndian(group)} ${label}${remainder ? ` ${wordsIndian(remainder)}` : ""}`;
    }
  }
  return wordsUnderThousand(value);
}

export function amountInWords(totalMinor, currency = "INR") {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0)
    throw new RangeError(
      "Amount in words requires a non-negative safe integer.",
    );
  const decimals = { INR: 2, USD: 2, EUR: 2, JPY: 0, KWD: 3 }[currency];
  if (decimals === undefined) throw new RangeError("Unsupported currency.");
  const scale = 10 ** decimals;
  let whole = Math.floor(totalMinor / scale);
  let fraction = totalMinor % scale;
  const parts = [];
  parts.push(wordsIndian(whole));
  const major =
    currency === "INR"
      ? "rupees"
      : currency === "USD"
        ? "dollars"
        : currency === "EUR"
          ? "euros"
          : currency === "JPY"
            ? "yen"
            : "dinars";
  const minor =
    currency === "INR"
      ? "paise"
      : currency === "USD"
        ? "cents"
        : currency === "EUR"
          ? "cents"
          : currency === "KWD"
            ? "fils"
            : "";
  const fractionText =
    fraction && minor ? ` and ${wordsUnderThousand(fraction)} ${minor}` : "";
  return `${parts.join(" ")} ${major}${fractionText} only`;
}

function toPlain(value) {
  return value?.toObject ? value.toObject({ depopulate: true }) : value;
}

function dateText(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function addressText(address = {}) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildInvoicePdfModel(invoiceInput) {
  const invoice = toPlain(invoiceInput);
  const supplier = invoice.businessSnapshot ?? {};
  const recipient = invoice.customerSnapshot ?? {};
  const allLines = [...(invoice.items ?? []), ...(invoice.charges ?? [])];
  const hasTaxable = allLines.some((line) => line.taxability === "taxable");
  const registered = Boolean(supplier.tax?.gstRegistered);
  const title = registered
    ? hasTaxable
      ? "Tax Invoice"
      : "Bill of Supply"
    : "Invoice";
  const state = stateData.states.find(
    (item) => item.code === invoice.placeOfSupply?.stateCode,
  );
  const currency = invoice.currency ?? supplier.currency ?? "INR";
  const totalMinor = invoice.totals?.totalMinor ?? 0;
  return {
    title,
    draft: invoice.status === "draft",
    number: invoice.status === "draft" ? null : invoice.number,
    issueDate: dateText(invoice.issueDate),
    dueDate: dateText(invoice.dueDate),
    supplier: {
      name: supplier.name ?? "",
      address: addressText(supplier.address),
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      gstin: supplier.tax?.gstRegistered ? supplier.tax.gstin : "",
    },
    recipient: {
      name: recipient.name ?? "",
      address: addressText(recipient.billingAddress),
      email: recipient.email ?? "",
      phone: recipient.phone ?? "",
      gstin: recipient.gstin ?? "",
    },
    shipTo: invoice.shipTo?.address ? addressText(invoice.shipTo.address) : "",
    placeOfSupply: state ? `${state.name} (${state.code})` : "",
    items: (invoice.items ?? []).map((item) => ({
      description: item.description,
      hsnSac: item.hsnSac || "",
      quantityMilli: item.quantityMilli,
      unit: item.unit,
      unitPrice: formatMoney(item.unitPriceMinor, currency),
      lineDiscountMinor: item.discountMinor,
      invoiceDiscountMinor: item.invoiceDiscountMinor,
      taxableMinor: item.taxableMinor,
      taxability: item.taxability,
      taxabilityNote: item.taxabilityNote,
      rateBp: item.rateBp,
      cgstMinor: item.cgstMinor,
      sgstMinor: item.sgstMinor,
      igstMinor: item.igstMinor,
      totalMinor: item.lineTotalMinor,
    })),
    charges: (invoice.charges ?? []).map((charge) => ({
      description: charge.description,
      hsnSac: charge.hsnSac || "",
      taxability: charge.taxability,
      taxabilityNote: charge.taxabilityNote,
      rateBp: charge.rateBp,
      taxableMinor: charge.taxableMinor,
      cgstMinor: charge.cgstMinor,
      sgstMinor: charge.sgstMinor,
      igstMinor: charge.igstMinor,
      totalMinor: charge.lineTotalMinor,
    })),
    totals: invoice.totals ?? {},
    taxSummary: invoice.taxSummary ?? [],
    amountWords: amountInWords(totalMinor, currency),
    currency,
    stateTaxLabel: invoice.stateTaxLabel ?? "SGST",
    reverseCharge:
      registered && invoice.reverseCharge?.status === "not_applicable"
        ? "Tax payable on reverse charge: No"
        : "",
    signatoryName: supplier.settings?.invoice?.signatoryName ?? "",
    declarations: supplier.settings?.invoice?.declarations ?? [],
    terms: invoice.terms ?? "",
    paymentDetails: supplier.settings?.payment ?? {},
    notes: invoice.notes ?? "",
    cessNotice: "Cess is not supported in this release.",
    disclaimer: GST_DISCLAIMER,
    templateVersion: "invoice-pdf-v1",
  };
}

export async function renderInvoicePdf(invoice) {
  const model = buildInvoicePdfModel(invoice);
  const doc = new PDFDocument({
    size: "A4",
    margin: 44,
    compress: false,
    info: {
      Title: `${model.title}${model.number ? ` ${model.number}` : " draft"}`,
      CreationDate: new Date(
        invoice.issuedAt ?? invoice.createdAt ?? invoice.issueDate,
      ),
      ModDate: new Date(
        invoice.issuedAt ?? invoice.createdAt ?? invoice.issueDate,
      ),
      Producer: "InvoiceFlow",
    },
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const ended = once(doc, "end");
  doc.registerFont("NotoSansDevanagari", devanagariFont);
  const line = (label, value) => {
    if (!value) return;
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(String(value));
  };
  doc.font("Helvetica-Bold").fontSize(20).text(model.title, { align: "right" });
  if (model.draft)
    doc
      .fontSize(13)
      .fillColor("#b91c1c")
      .text("DRAFT, not a tax invoice", { align: "right" })
      .fillColor("#111827");
  line("Invoice number", model.number ?? (model.draft ? "Not allocated" : ""));
  line("Issue date", model.issueDate);
  line("Due date", model.dueDate);
  doc.moveDown();
  doc.font("Helvetica-Bold").fontSize(12).text("Supplier");
  line("Name", model.supplier.name);
  line("Address", model.supplier.address);
  line("Email", model.supplier.email);
  line("Phone", model.supplier.phone);
  line("GSTIN", model.supplier.gstin);
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(12).text("Bill to");
  line("Name", model.recipient.name);
  line("Address", model.recipient.address);
  line("GSTIN", model.recipient.gstin);
  line("Email", model.recipient.email);
  line("Phone", model.recipient.phone);
  line("Ship to", model.shipTo);
  line("Place of supply", model.placeOfSupply);
  doc.moveDown();
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Description of goods and services");
  doc.moveDown(0.3);
  for (const [index, item] of model.items.entries()) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${index + 1}. ${item.description}`);
    doc.font("Helvetica").fontSize(8);
    line("HSN/SAC", item.hsnSac || "Not provided");
    line("Quantity", `${(item.quantityMilli / 1000).toFixed(3)} ${item.unit}`);
    line("Unit price", item.unitPrice);
    if (item.lineDiscountMinor)
      line(
        "Line discount",
        formatMoney(item.lineDiscountMinor, model.currency),
      );
    if (item.invoiceDiscountMinor)
      line(
        "Allocated invoice discount",
        formatMoney(item.invoiceDiscountMinor, model.currency),
      );
    line("Taxable value", formatMoney(item.taxableMinor, model.currency));
    if (item.rateBp) line("Rate", `${item.rateBp / 100}%`);
    line("CGST", formatMoney(item.cgstMinor, model.currency));
    line(model.stateTaxLabel, formatMoney(item.sgstMinor, model.currency));
    line("IGST", formatMoney(item.igstMinor, model.currency));
    if (
      ["exempt", "nil_rated", "zero_rated", "non_gst"].includes(item.taxability)
    ) {
      line(
        "Tax treatment",
        `${item.taxability}${item.taxabilityNote ? ` — ${item.taxabilityNote}` : ""}`,
      );
    }
    line("Line total", formatMoney(item.totalMinor, model.currency));
    doc.moveDown(0.35);
  }
  for (const charge of model.charges) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`Charge: ${charge.description}`);
    doc.font("Helvetica").fontSize(8);
    line("HSN/SAC", charge.hsnSac || "Not provided");
    line("Taxable value", formatMoney(charge.taxableMinor, model.currency));
    line("Line total", formatMoney(charge.totalMinor, model.currency));
  }
  doc.moveDown();
  doc.font("Helvetica-Bold").fontSize(10).text("Tax summary");
  for (const row of model.taxSummary) {
    line(
      `${row.taxCode} at ${row.rateBp / 100}%`,
      `Taxable ${formatMoney(row.taxableMinor, model.currency)}; CGST ${formatMoney(row.cgstMinor, model.currency)}; ${model.stateTaxLabel} ${formatMoney(row.sgstMinor ?? row.utgstMinor ?? 0, model.currency)}; IGST ${formatMoney(row.igstMinor, model.currency)}`,
    );
  }
  const totals = model.totals;
  line("Subtotal", formatMoney(totals.subtotalMinor ?? 0, model.currency));
  line(
    "Discount",
    formatMoney(
      (totals.lineDiscountMinor ?? 0) + (totals.invoiceDiscountMinor ?? 0),
      model.currency,
    ),
  );
  line("Taxable value", formatMoney(totals.taxableMinor ?? 0, model.currency));
  line("Total tax", formatMoney(totals.taxMinor ?? 0, model.currency));
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(`Total: ${formatMoney(totals.totalMinor ?? 0, model.currency)}`);
  doc
    .font("Helvetica")
    .fontSize(9)
    .text(`Amount in words: ${model.amountWords}`);
  doc.font("Helvetica").fontSize(9).text("Amount: ", { continued: true });
  doc.font("NotoSansDevanagari").text("₹", { continued: true });
  doc
    .font("Helvetica")
    .text(
      formatMoney(totals.totalMinor ?? 0, model.currency).replace(/^₹/, ""),
    );
  if (model.reverseCharge) doc.moveDown().text(model.reverseCharge);
  doc.moveDown();
  line("Terms", model.terms);
  line("Notes", model.notes);
  for (const declaration of model.declarations)
    doc.font("Helvetica").fontSize(8).text(declaration);
  if (model.paymentDetails.bankDetails)
    line("Payment details", model.paymentDetails.bankDetails);
  if (model.paymentDetails.upiId) line("UPI ID", model.paymentDetails.upiId);
  if (model.signatoryName) {
    doc.moveDown(2).text("______________________________");
    doc.text(model.signatoryName);
  }
  doc
    .moveDown()
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#4b5563")
    .text(model.cessNotice);
  doc.moveDown(0.4).text(model.disclaimer);
  doc.end();
  await ended;
  return { buffer: Buffer.concat(chunks), model };
}
