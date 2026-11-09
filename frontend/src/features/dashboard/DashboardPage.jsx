import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient.js";
import { formatMoney } from "../../lib/money.js";
import { Button } from "../../components/ui/Button.jsx";
import { Skeleton } from "../../components/ui/Skeleton.jsx";
import { EmptyState } from "../../components/ui/EmptyState.jsx";
import { FileText } from "lucide-react";

export function DashboardPage({
  currency = "INR",
  onOpenInvoices,
  onOpenCustomers,
  readOnly = false,
  canAddSampleData = false,
  loading = false,
}) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [sampleBusy, setSampleBusy] = useState(false);
  const load = useCallback(() => {
    let active = true;
    apiClient
      .get("/reports/dashboard")
      .then(({ data }) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setError("Dashboard data could not be loaded. Try again.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => load(), [load]);

  async function addSampleData() {
    setSampleBusy(true);
    setError("");
    try {
      await apiClient.post("/customers/sample-data");
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Sample data could not be added.",
      );
    } finally {
      setSampleBusy(false);
    }
  }

  if (loading || (!summary && !error))
    return (
      <section
        aria-label="Loading business overview"
        aria-busy="true"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </section>
    );
  if (error)
    return (
      <EmptyState
        icon={FileText}
        title="Dashboard unavailable"
        description={error}
      />
    );
  const cards = [
    [
      "Issued this month",
      summary.issuedThisMonth,
      "Invoices finalized this month",
    ],
    [
      "Awaiting payment",
      formatMoney(summary.outstandingMinor, currency),
      `${summary.outstandingCount} open invoices`,
    ],
    [
      "Overdue",
      formatMoney(summary.overdueMinor, currency),
      `${summary.overdueCount} overdue invoices`,
    ],
    ["Customers", summary.activeCustomers, "Active customer records"],
  ];
  return (
    <>
      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Business overview"
      >
        {cards.map(([title, value, detail]) => (
          <article
            key={title}
            className="rounded-2xl border border-line bg-surface p-5 shadow-card dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-sm font-medium text-muted dark:text-slate-400">
              {title}
            </p>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-ink dark:text-white">
              {value}
            </p>
            <p className="mt-1 text-xs text-muted dark:text-slate-500">
              {detail}
            </p>
          </article>
        ))}
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">
              Your next step
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink dark:text-white">
              Start with a customer
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted dark:text-slate-400">
              Add a customer, prepare an invoice draft, and review the amounts
              before assigning the invoice number. Creating an invoice record
              does not contact the customer.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:min-w-48">
            {!readOnly && (
              <Button onClick={onOpenCustomers}>Add a customer</Button>
            )}
            {!readOnly && canAddSampleData && summary.activeCustomers === 0 && (
              <>
                <p className="text-xs leading-5 text-muted">
                  Adds two clearly labeled sample contacts to an empty
                  workspace.
                </p>
                <Button
                  variant="secondary"
                  disabled={sampleBusy}
                  onClick={addSampleData}
                >
                  {sampleBusy
                    ? "Adding sample customers…"
                    : "Add sample customers"}
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={onOpenInvoices}>
              View draft invoices
            </Button>
          </div>
        </div>
      </section>
      {summary.recentInvoices.length ? (
        <section
          className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface p-5 dark:border-slate-800 dark:bg-slate-900"
          aria-label="Recent invoices"
        >
          <h2 className="mb-4 text-lg font-semibold">Recent invoices</h2>
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="p-2">Number</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Issue date</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentInvoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-line last:border-0"
                >
                  <td className="p-2 font-medium">{invoice.number}</td>
                  <td className="p-2">{invoice.customer}</td>
                  <td className="p-2">{invoice.issueDate}</td>
                  <td className="p-2 capitalize">
                    {invoice.status.replaceAll("_", " ")}
                  </td>
                  <td className="p-2 text-right">
                    {formatMoney(invoice.balanceMinor, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <EmptyState
          className="mt-6"
          icon={FileText}
          title="Your recent invoices will appear here"
          description="Issued invoices appear here with their current payment status."
        />
      )}
    </>
  );
}
