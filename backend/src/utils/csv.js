import { stringify } from "csv-stringify/sync";
import { GST_DISCLAIMER } from "./gstDisclaimer.js";

export function guardCsvCell(value) {
  const text = String(value ?? "");
  return /^[=+@-]/.test(text.trimStart()) ? `'${text}` : text;
}

export function stringifyCsv(records, columns) {
  return stringify(
    records.map((record) =>
      Object.fromEntries(
        columns.map((column) => [column, guardCsvCell(record[column])]),
      ),
    ),
    { header: true, columns },
  );
}

export function gstExportHeader() {
  return `# ${GST_DISCLAIMER}\n`;
}
