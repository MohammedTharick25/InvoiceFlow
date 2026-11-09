import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient.js";
import { CURRENCY_DECIMALS, parseMajorToMinor } from "../../lib/money.js";
import { Button } from "../../components/ui/Button.jsx";

const blank = {
  categoryId: "",
  vendor: "",
  description: "",
  amount: "",
  method: "bank_transfer",
  frequency: "monthly",
  nextRunAt: new Date().toISOString().slice(0, 10),
  endAt: "",
};
const field =
  "mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 dark:border-slate-700 dark:bg-slate-900";

export function RecurringExpenses({
  categories,
  currency = "INR",
  readOnly = false,
}) {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/recurring-expenses");
      setRules(data.recurringExpenses ?? []);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not load recurring expense rules.",
      );
    }
  }, []);
  useEffect(() => {
    let active = true;
    apiClient
      .get("/recurring-expenses")
      .then(({ data }) => {
        if (active) setRules(data.recurringExpenses ?? []);
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError?.response?.data?.error?.message ??
              "Could not load recurring expense rules.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const amountMinor = parseMajorToMinor(form.amount, currency);
      const payload = {
        ...form,
        amountMinor,
        endAt: form.endAt || null,
      };
      if (editingId)
        await apiClient.put(`/recurring-expenses/${editingId}`, payload);
      else await apiClient.post("/recurring-expenses", payload);
      setEditingId(null);
      setForm({ ...blank, nextRunAt: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          requestError.message ??
          "Could not create recurring expense.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function setPaused(rule) {
    setError("");
    try {
      await apiClient.patch(`/recurring-expenses/${rule.id}`, {
        paused: !rule.paused,
      });
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not update recurring expense.",
      );
    }
  }
  function edit(rule) {
    const decimals = CURRENCY_DECIMALS[currency];
    const scale = 10n ** BigInt(decimals);
    const amount = BigInt(rule.amountMinor);
    setEditingId(rule.id);
    setForm({
      categoryId: rule.categoryId,
      vendor: rule.vendor,
      description: rule.description,
      amount: decimals
        ? `${amount / scale}.${(amount % scale).toString().padStart(decimals, "0")}`
        : (amount / scale).toString(),
      method: rule.method,
      frequency: rule.frequency,
      nextRunAt: rule.nextRunAt,
      endAt: rule.endAt ?? "",
    });
  }
  async function archive(rule) {
    setError("");
    try {
      await apiClient.delete(`/recurring-expenses/${rule.id}`);
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not archive recurring expense.",
      );
    }
  }

  return (
    <section
      className="rounded-2xl border border-line bg-surface p-5 dark:border-slate-800 dark:bg-slate-900"
      aria-labelledby="recurring-expenses-heading"
    >
      <h2 id="recurring-expenses-heading" className="text-lg font-semibold">
        Recurring expenses
      </h2>
      <p className="mt-1 text-sm text-muted">
        Due rules create one expense per scheduled date. Pause or archive a rule
        to stop future entries.
      </p>
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {rules.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">
                  {rule.vendor} · {rule.description}
                </p>
                <p className="text-sm text-muted">
                  {rule.frequency} · next {rule.nextRunAt} ·{" "}
                  {rule.paused ? "paused" : "active"}
                  {rule.endAt ? ` · ends ${rule.endAt}` : ""}
                </p>
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => edit(rule)}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void setPaused(rule)}
                  >
                    {rule.paused ? "Resume" : "Pause"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void archive(rule)}
                  >
                    Archive
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={create}>
          <label className="text-sm">
            Category
            <select
              className={field}
              required
              value={form.categoryId}
              onChange={(event) =>
                setForm({ ...form, categoryId: event.target.value })
              }
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Vendor
            <input
              className={field}
              required
              maxLength={160}
              value={form.vendor}
              onChange={(event) =>
                setForm({ ...form, vendor: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Description
            <input
              className={field}
              required
              maxLength={500}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Amount ({currency})
            <input
              className={field}
              required
              inputMode="decimal"
              value={form.amount}
              onChange={(event) =>
                setForm({ ...form, amount: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Frequency
            <select
              className={field}
              value={form.frequency}
              onChange={(event) =>
                setForm({ ...form, frequency: event.target.value })
              }
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="text-sm">
            First occurrence
            <input
              className={field}
              type="date"
              required
              value={form.nextRunAt}
              onChange={(event) =>
                setForm({ ...form, nextRunAt: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            End date (optional)
            <input
              className={field}
              type="date"
              value={form.endAt}
              onChange={(event) =>
                setForm({ ...form, endAt: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Payment method
            <select
              className={field}
              value={form.method}
              onChange={(event) =>
                setForm({ ...form, method: event.target.value })
              }
            >
              {[
                ["cash", "Cash"],
                ["bank_transfer", "Bank transfer"],
                ["upi", "UPI"],
                ["card", "Card"],
                ["cheque", "Cheque"],
                ["other", "Other"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="sm:col-span-2 sm:justify-self-start"
            disabled={busy}
          >
            {busy
              ? "Saving…"
              : editingId
                ? "Save recurring rule"
                : "Create recurring rule"}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="secondary"
              className="sm:col-span-2 sm:justify-self-start"
              onClick={() => {
                setEditingId(null);
                setForm(blank);
              }}
            >
              Cancel edit
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
