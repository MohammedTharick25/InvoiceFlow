import { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient.js";
import { Button } from "../../components/ui/Button.jsx";
import { formatMoney } from "../../lib/money.js";

const reports = [
  ["sales", "Sales", "Issued invoices and their recorded totals."],
  ["payments", "Payments", "Recorded payments. Reversed entries are excluded."],
  ["outstanding", "Outstanding invoices", "Open invoice balances."],
  ["overdue", "Overdue invoices", "Open balances past their due date."],
  [
    "customer-balances",
    "Customer balances",
    "Current open balances grouped by customer and currency.",
  ],
];

export function ReportsPage({
  cashflowEnabled = false,
  exportEnabled = false,
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [cashflow, setCashflow] = useState([]);
  useEffect(() => {
    if (!cashflowEnabled) return undefined;
    let active = true;
    apiClient
      .get("/reports/cashflow")
      .then(({ data }) => {
        if (active) setCashflow(data.months ?? []);
      })
      .catch(() => {
        if (active) setError("Cash-flow data could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [cashflowEnabled]);
  async function download(type) {
    setBusy(type);
    setError("");
    try {
      const params =
        type.startsWith("customer-balances") || type === "customers.csv"
          ? {}
          : { ...(from && { from }), ...(to && { to }) };
      const format = type.endsWith(".pdf") ? "pdf" : "csv";
      const reportType = type.replace(/\.(csv|pdf)$/, "");
      const response = await apiClient.get(`/reports/${reportType}.${format}`, {
        params,
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoiceflow-${reportType}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(
        "Report could not be downloaded. Check the selected date range and try again.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section aria-label="Reports">
      <div className="mb-6 rounded-2xl border border-line bg-surface p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold">Optional date range</h2>
        <p className="mt-1 text-sm text-muted">
          Choose dates for the sales, payment, outstanding, and overdue CSVs.
          Leave blank to include all matching records. Ranges are limited to 367
          days.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            From
            <input
              className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="text-sm">
            To
            <input
              className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {reports.map(([key, title, description]) => (
          <article
            key={key}
            className="flex flex-col justify-between gap-5 rounded-2xl border border-line bg-surface p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{description}</p>
            </div>
            <Button
              className="self-start"
              disabled={Boolean(busy)}
              onClick={() => download(`${key}.csv`)}
            >
              {busy === `${key}.csv` ? "Preparing CSV…" : "Download CSV"}
            </Button>
            <Button
              className="self-start"
              variant="secondary"
              disabled={Boolean(busy)}
              onClick={() => download(`${key}.pdf`)}
            >
              {busy === `${key}.pdf` ? "Preparing PDF…" : "Download PDF"}
            </Button>
          </article>
        ))}
      </div>
      {exportEnabled && (
        <Button
          className="mt-5"
          disabled={Boolean(busy)}
          onClick={() => download("customers.csv")}
        >
          Download customer CSV
        </Button>
      )}
      {cashflowEnabled && (
        <section
          className="mt-8 rounded-2xl border border-line bg-surface p-5 dark:border-slate-800 dark:bg-slate-900"
          aria-labelledby="cashflow-heading"
        >
          <h2 id="cashflow-heading" className="text-lg font-semibold">
            Cash flow · last six months
          </h2>
          <p className="mt-1 text-sm text-muted">
            Recorded payments received and active expenses, grouped by
            business-local month. Invoice totals are not counted as cash
            received.
          </p>
          {cashflow.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Month</th>
                    <th className="p-2">Currency</th>
                    <th className="p-2">Cash received</th>
                    <th className="p-2">Expenses</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflow.map((row) => (
                    <tr key={`${row.month}-${row.currency}`}>
                      <td className="p-2">{row.month}</td>
                      <td className="p-2">{row.currency}</td>
                      <td className="p-2">
                        {formatMoney(row.inflowMinor, row.currency)}
                      </td>
                      <td className="p-2">
                        {formatMoney(row.outflowMinor, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              No recorded cash activity in this period.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
