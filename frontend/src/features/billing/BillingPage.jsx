import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient.js";
import { formatMoney } from "../../lib/money.js";
import { Button } from "../../components/ui/Button.jsx";

const intervals = ["month", "year"];

export function BillingPage() {
  const [billing, setBilling] = useState(null);
  const [invoiceHistory, setInvoiceHistory] = useState([]);
  const [interval, setInterval] = useState("month");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [summary, invoices] = await Promise.all([
      apiClient.get("/billing"),
      apiClient.get("/billing/invoices"),
    ]);
    setBilling(summary.data);
    setInvoiceHistory(invoices.data.invoices ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.get("/billing"), apiClient.get("/billing/invoices")])
      .then(([summary, invoices]) => {
        if (!active) return;
        setBilling(summary.data);
        setInvoiceHistory(invoices.data.invoices ?? []);
      })
      .catch(() => {
        if (active) setError("Billing details could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function startCheckout(planKey) {
    setBusy(planKey);
    setError("");
    try {
      const response = await apiClient.post("/billing/checkout", {
        planKey,
        interval,
      });
      if (!response.data.shortUrl)
        throw new Error("The provider did not return a checkout link.");
      window.location.assign(response.data.shortUrl);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          requestError.message ??
          "Checkout could not be started.",
      );
    } finally {
      setBusy("");
    }
  }

  async function changePlan(planKey) {
    setBusy(planKey);
    setError("");
    try {
      await apiClient.post("/billing/change-plan", { planKey, interval });
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "The plan change could not be requested.",
      );
    } finally {
      setBusy("");
    }
  }

  async function cancelPlan() {
    if (
      !window.confirm(
        "Cancel this subscription at the end of the current billing period?",
      )
    )
      return;
    setBusy("cancel");
    setError("");
    try {
      await apiClient.post("/billing/cancel", { confirm: true });
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "The subscription could not be cancelled.",
      );
    } finally {
      setBusy("");
    }
  }

  if (!billing && !error) return <p role="status">Loading billing details…</p>;
  if (error && !billing) return <p role="alert">{error}</p>;

  return (
    <section aria-label="Billing and plans" className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <article className="rounded-2xl border border-line bg-surface p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">Current plan</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Plan</dt>
            <dd className="mt-1 font-medium">{billing.planName}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Status</dt>
            <dd className="mt-1 font-medium capitalize">
              {billing.status.replaceAll("_", " ")}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Monthly finalized invoices</dt>
            <dd className="mt-1 font-medium">
              {billing.usage.finalizedInvoices} /{" "}
              {billing.limits.finalizedInvoicesPerMonth ?? "Unlimited"}
            </dd>
          </div>
        </dl>
        {billing.trialEndsAt && (
          <p className="mt-4 text-sm text-muted">
            Trial ends{" "}
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeZone: "Asia/Kolkata",
            }).format(new Date(billing.trialEndsAt))}
            . {billing.trialDaysLeft} day(s) remaining.
          </p>
        )}
        {billing.cancelAtPeriodEnd && (
          <p className="mt-3 text-sm">
            Cancellation is scheduled for the end of the current period.
          </p>
        )}
        {billing.status === "active" && !billing.cancelAtPeriodEnd && (
          <Button
            className="mt-4"
            variant="secondary"
            disabled={Boolean(busy)}
            onClick={cancelPlan}
          >
            Cancel at period end
          </Button>
        )}
      </article>

      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Available plans</h2>
        <label className="ml-auto flex items-center gap-2 text-sm">
          Billing interval
          <select
            className="min-h-10 rounded-lg border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-950"
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
          >
            {intervals.map((value) => (
              <option key={value} value={value}>
                {value === "month" ? "Monthly" : "Annual"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Object.entries(billing.plans).map(([key, plan]) => (
          <article
            key={key}
            className="flex flex-col rounded-2xl border border-line bg-surface p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-2 text-2xl font-semibold">
              {formatMoney(
                interval === "month" ? plan.monthlyMinor : plan.annualMinor,
                "INR",
              )}
              <span className="text-sm font-normal text-muted">
                {" "}
                / {interval === "month" ? "month" : "year"}
              </span>
            </p>
            <p className="mt-3 text-sm text-muted">
              {plan.finalizedInvoicesPerMonth.toLocaleString("en-IN")} finalized
              invoices per month · {plan.activeCustomers ?? "Unlimited"} active
              customers · {plan.teamMembers} team member(s)
            </p>
            {key === billing.planKey && billing.status === "active" ? (
              <p className="mt-auto pt-5 text-sm font-medium">Current plan</p>
            ) : (
              <Button
                className="mt-auto self-start pt-5"
                disabled={Boolean(busy) || billing.status === "trialing"}
                onClick={() =>
                  billing.status === "active" || billing.status === "past_due"
                    ? changePlan(key)
                    : startCheckout(key)
                }
              >
                {busy === key
                  ? "Working…"
                  : billing.status === "trialing"
                    ? "Available after trial"
                    : billing.status === "active" ||
                        billing.status === "past_due"
                      ? "Change plan"
                      : "Choose plan"}
              </Button>
            )}
          </article>
        ))}
      </div>
      <p className="text-xs leading-5 text-muted">
        Razorpay checkout only opens after you choose a plan. The payment
        provider may charge transaction fees. No payment is collected by this
        page until you continue on Razorpay.
      </p>
      {invoiceHistory.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Billing invoices</h2>
          <ul className="space-y-2">
            {invoiceHistory.map((item) => (
              <li
                key={item.id}
                className="flex justify-between rounded-xl border border-line p-3 text-sm"
              >
                <span>
                  {item.id} · {item.status}
                </span>
                <span>{formatMoney(item.amountMinor, item.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
