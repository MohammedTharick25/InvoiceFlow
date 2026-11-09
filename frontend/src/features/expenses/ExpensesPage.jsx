import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient.js";
import { Button } from "../../components/ui/Button.jsx";
import { RecurringExpenses } from "./RecurringExpenses.jsx";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const cardClass =
  "rounded-2xl border border-line bg-surface p-5 shadow-card dark:border-slate-800 dark:bg-slate-900";
const blank = {
  categoryId: "",
  vendor: "",
  description: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  method: "bank_transfer",
  reference: "",
  notes: "",
};

function messageFrom(error, fallback) {
  return error?.response?.data?.error?.message ?? fallback;
}

function currencyText(amountMinor, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "INR",
  }).format(amountMinor / 100);
}

export function ExpensesPage({ currency = "INR", readOnly = false }) {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [expenseResponse, categoryResponse] = await Promise.all([
        apiClient.get("/expenses", { params: { page: 1, limit: 100 } }),
        apiClient.get("/expense-categories"),
      ]);
      setExpenses(expenseResponse.data.expenses ?? []);
      setCategories(categoryResponse.data.categories ?? []);
    } catch (requestError) {
      setError(messageFrom(requestError, "Could not load expenses."));
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiClient.get("/expenses", { params: { page: 1, limit: 100 } }),
      apiClient.get("/expense-categories"),
    ])
      .then(([expenseResponse, categoryResponse]) => {
        if (!active) return;
        setExpenses(expenseResponse.data.expenses ?? []);
        setCategories(categoryResponse.data.categories ?? []);
      })
      .catch((requestError) => {
        if (active)
          setError(messageFrom(requestError, "Could not load expenses."));
      });
    return () => {
      active = false;
    };
  }, []);

  function changeField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function saveExpense(event) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      categoryId: form.categoryId,
      vendor: form.vendor,
      description: form.description,
      amountMinor: Math.round(amount * 100),
      date: form.date,
      method: form.method,
      reference: form.reference,
      notes: form.notes,
    };
    try {
      if (editingId) await apiClient.patch(`/expenses/${editingId}`, payload);
      else await apiClient.post("/expenses", payload);
      setForm({ ...blank, date: new Date().toISOString().slice(0, 10) });
      setEditingId(null);
      setNotice(editingId ? "Expense updated." : "Expense recorded.");
      await load();
    } catch (requestError) {
      setError(messageFrom(requestError, "Could not save the expense."));
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiClient.post("/expense-categories", {
        name: categoryName,
      });
      setCategories((current) =>
        [...current, response.data.category].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setForm((current) => ({
        ...current,
        categoryId: response.data.category.id,
      }));
      setCategoryName("");
      setNotice("Category added.");
    } catch (requestError) {
      setError(messageFrom(requestError, "Could not add the category."));
    } finally {
      setBusy(false);
    }
  }

  async function archiveCategory(category) {
    setError("");
    try {
      await apiClient.delete(`/expense-categories/${category.id}`);
      setCategories((current) =>
        current.filter((item) => item.id !== category.id),
      );
      setNotice("Category archived.");
      if (form.categoryId === category.id)
        setForm((current) => ({ ...current, categoryId: "" }));
    } catch (requestError) {
      setError(messageFrom(requestError, "Could not archive the category."));
    }
  }

  function editExpense(expense) {
    setEditingId(expense.id);
    setForm({
      categoryId: expense.categoryId,
      vendor: expense.vendor,
      description: expense.description,
      amount: (expense.amountMinor / 100).toFixed(2),
      date: expense.date,
      method: expense.method,
      reference: expense.reference ?? "",
      notes: expense.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function archiveExpense(expense) {
    setError("");
    try {
      await apiClient.delete(`/expenses/${expense.id}`);
      setExpenses((current) =>
        current.filter((item) => item.id !== expense.id),
      );
      setNotice("Expense archived.");
      if (editingId === expense.id) {
        setEditingId(null);
        setForm(blank);
      }
    } catch (requestError) {
      setError(messageFrom(requestError, "Could not archive the expense."));
    }
  }

  async function uploadReceipt(expense, file) {
    if (!file) return;
    setError("");
    const data = new FormData();
    data.append("receipt", file);
    try {
      await apiClient.post(`/expenses/${expense.id}/receipt`, data);
      setNotice("Receipt uploaded.");
      await load();
    } catch (requestError) {
      setError(messageFrom(requestError, "Could not upload the receipt."));
    }
  }

  async function downloadReceipt(expense) {
    setError("");
    try {
      const response = await apiClient.get(`/expenses/${expense.id}/receipt`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "expense-receipt";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(messageFrom(requestError, "Could not download the receipt."));
    }
  }

  async function removeReceipt(expense) {
    setError("");
    try {
      await apiClient.delete(`/expenses/${expense.id}/receipt`);
      setNotice("Receipt removed.");
      await load();
    } catch (requestError) {
      setError(messageFrom(requestError, "Could not remove the receipt."));
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-brand-700 dark:text-brand-300">
          {notice}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.7fr)]">
        <section className={cardClass} aria-labelledby="expenses-heading">
          <h2
            id="expenses-heading"
            className="text-lg font-semibold text-ink dark:text-white"
          >
            Expenses
          </h2>
          {expenses.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No expenses recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line dark:divide-slate-800">
              {expenses.map((expense) => (
                <li className="py-4" key={expense.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink dark:text-white">
                        {expense.vendor}
                      </p>
                      <p className="text-sm text-muted">
                        {expense.description}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {expense.date} ·{" "}
                        {expense.category?.name ?? "Archived category"} ·{" "}
                        {expense.method.replaceAll("_", " ")}
                      </p>
                    </div>
                    <p className="font-semibold text-ink dark:text-white">
                      {currencyText(expense.amountMinor, expense.currency)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {expense.receipt ? (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => downloadReceipt(expense)}
                        >
                          Download receipt
                        </Button>
                        {!readOnly && (
                          <Button
                            variant="secondary"
                            onClick={() => removeReceipt(expense)}
                          >
                            Remove receipt
                          </Button>
                        )}
                      </>
                    ) : !readOnly ? (
                      <label className="cursor-pointer text-sm font-medium text-brand-700 underline dark:text-brand-300">
                        Upload receipt
                        <input
                          className="sr-only"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(event) => {
                            uploadReceipt(expense, event.target.files?.[0]);
                            event.target.value = "";
                          }}
                          aria-label={`Upload receipt for ${expense.vendor}`}
                        />
                      </label>
                    ) : null}
                    {!readOnly && (
                      <Button
                        variant="secondary"
                        onClick={() => editExpense(expense)}
                      >
                        Edit
                      </Button>
                    )}
                    {!readOnly && (
                      <Button
                        variant="secondary"
                        onClick={() => archiveExpense(expense)}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!readOnly && (
          <form className={cardClass} onSubmit={saveExpense}>
            <h2 className="text-lg font-semibold text-ink dark:text-white">
              {editingId ? "Edit expense" : "Record an expense"}
            </h2>
            <label className="mt-3 block text-sm font-medium">
              Category
              <select
                className={inputClass}
                name="categoryId"
                value={form.categoryId}
                onChange={changeField}
                required
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            {[
              ["vendor", "Vendor", "text"],
              ["description", "Description", "text"],
              ["amount", `Amount (${currency})`, "number"],
              ["date", "Date", "date"],
              ["reference", "Reference", "text"],
              ["notes", "Notes", "text"],
            ].map(([name, label, type]) => (
              <label className="mt-3 block text-sm font-medium" key={name}>
                {label}
                <input
                  className={inputClass}
                  name={name}
                  type={type}
                  value={form[name]}
                  onChange={changeField}
                  required={[
                    "vendor",
                    "description",
                    "amount",
                    "date",
                  ].includes(name)}
                  min={type === "number" ? "0.01" : undefined}
                  step={type === "number" ? "0.01" : undefined}
                />
              </label>
            ))}
            <label className="mt-3 block text-sm font-medium">
              Payment method
              <select
                className={inputClass}
                name="method"
                value={form.method}
                onChange={changeField}
              >
                {[
                  ["cash", "Cash"],
                  ["bank_transfer", "Bank transfer"],
                  ["upi", "UPI"],
                  ["card", "Card"],
                  ["cheque", "Cheque"],
                  ["other", "Other"],
                ].map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Record expense"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingId(null);
                    setForm(blank);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </div>

      {!readOnly && (
        <section
          className={cardClass}
          aria-labelledby="expense-categories-heading"
        >
          <h2
            id="expense-categories-heading"
            className="text-lg font-semibold text-ink dark:text-white"
          >
            Expense categories
          </h2>
          <form
            className="mt-3 flex flex-col gap-3 sm:flex-row"
            onSubmit={addCategory}
          >
            <label className="flex-1 text-sm font-medium">
              Add category
              <input
                className={inputClass}
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                maxLength={80}
                required
              />
            </label>
            <Button className="self-end" type="submit" disabled={busy}>
              Add category
            </Button>
          </form>
          {categories.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {categories.map((category) => (
                <li
                  className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm dark:border-slate-700"
                  key={category.id}
                >
                  {category.name}
                  <button
                    type="button"
                    className="font-semibold text-red-700 dark:text-red-300"
                    onClick={() => archiveCategory(category)}
                    aria-label={`Archive ${category.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <RecurringExpenses
        categories={categories}
        currency={currency}
        readOnly={readOnly}
      />
    </div>
  );
}
