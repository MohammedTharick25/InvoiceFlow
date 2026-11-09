import { useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { apiClient } from "../../lib/apiClient.js";
import { useAuthStore } from "../../store/authStore.js";

const currencies = ["INR", "USD", "EUR", "JPY", "KWD"];

export function BusinessSettingsPage({ readOnly = false }) {
  const workspace = useAuthStore((state) => state.workspace);
  const setWorkspace = useAuthStore((state) => state.setWorkspace);
  const [currency, setCurrency] = useState(
    workspace?.business?.currency ?? "INR",
  );
  const [draftIds, setDraftIds] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveCurrency() {
    setBusy(true);
    setError("");
    setNotice("");
    setDraftIds([]);
    try {
      const response = await apiClient.patch("/businesses/current/currency", {
        currency,
      });
      setWorkspace({
        ...workspace,
        business: { ...workspace.business, ...response.data.business },
      });
      setNotice(`Business currency changed to ${currency}.`);
    } catch (requestError) {
      const apiError = requestError?.response?.data?.error;
      if (apiError?.code === "DRAFTS_REQUIRE_REVIEW") {
        setDraftIds(apiError.details?.draftIds ?? []);
        setError(apiError.message);
      } else {
        setError(
          apiError?.message ?? "Could not change the business currency.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function clearDraftAmountsAndRetry() {
    if (!draftIds.length) return;
    const confirmed = window.confirm(
      `Clear saved prices and discounts from ${draftIds.length} draft invoice${draftIds.length === 1 ? "" : "s"}? Descriptions and quantities remain, but the cleared amounts will not be restored.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      for (const invoiceId of draftIds) {
        await apiClient.post(`/invoices/${invoiceId}/clear-amounts`, {
          confirmation: "CLEAR_AMOUNTS",
        });
      }
      const response = await apiClient.patch("/businesses/current/currency", {
        currency,
      });
      setWorkspace({
        ...workspace,
        business: { ...workspace.business, ...response.data.business },
      });
      setDraftIds([]);
      setNotice(
        `Draft amounts cleared and business currency changed to ${currency}.`,
      );
    } catch (requestError) {
      const apiError = requestError?.response?.data?.error;
      setError(
        apiError?.message ??
          "Could not clear draft amounts or change currency.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-ink dark:text-white">
          Business currency
        </h2>
        <p className="mt-2 text-sm text-muted dark:text-slate-400">
          Currency locks after a finalized invoice, payment, or expense. Draft
          invoices must have their amounts cleared before you can change it.
        </p>
        <label className="mt-4 block text-sm font-medium text-ink dark:text-slate-200">
          Invoice currency
          <select
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            disabled={readOnly || busy}
            onChange={(event) => setCurrency(event.target.value)}
            value={currency}
          >
            {currencies.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="mt-4"
          disabled={
            readOnly || busy || currency === workspace?.business?.currency
          }
          onClick={() => void saveCurrency()}
        >
          Change currency
        </Button>
        {draftIds.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300 p-4 dark:border-amber-800">
            <p
              className="text-sm text-amber-900 dark:text-amber-200"
              role="status"
            >
              {draftIds.length} draft invoice
              {draftIds.length === 1 ? " has" : "s have"} saved amounts. Review
              and clear them before changing currency.
            </p>
            <Button
              className="mt-3"
              disabled={busy}
              onClick={() => void clearDraftAmountsAndRetry()}
              variant="secondary"
            >
              Clear draft amounts and change currency
            </Button>
          </div>
        )}
        {error && (
          <p
            className="mt-4 text-sm text-red-700 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            className="mt-4 text-sm text-brand-700 dark:text-brand-300"
            role="status"
          >
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}
