import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient.js";
import { Button } from "../../components/ui/Button.jsx";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const cardClass =
  "rounded-2xl border border-line bg-surface p-5 shadow-card dark:border-slate-800 dark:bg-slate-900";
const blank = {
  name: "",
  email: "",
  phone: "",
  line1: "",
  city: "",
  stateCode: "",
  postalCode: "",
};
const customerFields = [
  ["name", "Customer name", "text"],
  ["email", "Email", "email"],
  ["phone", "Phone", "tel"],
  ["line1", "Street address", "text"],
  ["city", "City", "text"],
  ["stateCode", "Two-digit state code", "text"],
  ["postalCode", "Postal code", "text"],
];

export function CustomersPage({ readOnly = false }) {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [pendingCustomer, setPendingCustomer] = useState(null);
  const load = useCallback(async () => {
    try {
      const response = await apiClient.get("/customers", {
        params: { page: 1, limit: 100 },
      });
      setCustomers(response.data.customers ?? []);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not load customers.",
      );
    }
  }, []);
  useEffect(() => {
    let active = true;
    apiClient
      .get("/customers", { params: { page: 1, limit: 100 } })
      .then((response) => {
        if (active) setCustomers(response.data.customers ?? []);
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError?.response?.data?.error?.message ??
              "Could not load customers.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function submitCustomer(customerInput, skipCheck = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!skipCheck) {
        const check = await apiClient.post(
          "/customers/check-duplicates",
          customerInput,
        );
        if (check.data.duplicates?.length) {
          setDuplicates(check.data.duplicates);
          setPendingCustomer(customerInput);
          setBusy(false);
          return;
        }
      }
      await apiClient.post("/customers", {
        ...customerInput,
      });
      setForm(blank);
      setDuplicates([]);
      setPendingCustomer(null);
      setNotice("Customer added.");
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not create the customer.",
      );
    } finally {
      setBusy(false);
    }
  }

  function createCustomer(event) {
    event.preventDefault();
    void submitCustomer({
      name: form.name,
      email: form.email,
      phone: form.phone,
      billingAddress: {
        line1: form.line1,
        city: form.city,
        stateCode: form.stateCode,
        postalCode: form.postalCode,
        country: "India",
      },
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <section className={cardClass} aria-labelledby="customers-heading">
        <h2
          id="customers-heading"
          className="text-lg font-semibold text-ink dark:text-white"
        >
          Customers
        </h2>
        {error && (
          <p
            className="mt-3 text-sm text-red-700 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            className="mt-3 text-sm text-brand-700 dark:text-brand-300"
            role="status"
          >
            {notice}
          </p>
        )}
        {duplicates.length > 0 && (
          <div
            className="mt-4 rounded-xl border border-amber-500 p-4"
            role="status"
            aria-label="Possible duplicate customers"
          >
            <p className="font-medium">These records may already exist:</p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {duplicates.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  {item.name} (matching {item.matches.join(", ")})
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              You can still add this customer if it is a different person or
              business.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  pendingCustomer && void submitCustomer(pendingCustomer, true)
                }
              >
                Add anyway
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDuplicates([]);
                  setPendingCustomer(null);
                }}
              >
                Review details
              </Button>
            </div>
          </div>
        )}
        {customers.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No customers yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line dark:divide-slate-800">
            {customers.map((customer) => (
              <li className="py-3" key={customer.id}>
                <p className="font-medium text-ink dark:text-white">
                  {customer.name}
                </p>
                <p className="text-sm text-muted">
                  {customer.email || customer.phone || "No contact details"}
                </p>
                <p className="text-xs text-muted">
                  {customer.billingAddress.city}, state{" "}
                  {customer.billingAddress.stateCode}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {!readOnly && (
        <form className={cardClass} onSubmit={createCustomer}>
          <h2 className="text-lg font-semibold text-ink dark:text-white">
            Add a customer
          </h2>
          {customerFields.map(([key, label, type]) => (
            <label
              className="mt-3 block text-sm font-medium text-ink dark:text-slate-200"
              key={key}
            >
              {label}
              <input
                className={inputClass}
                required={!["email", "phone"].includes(key)}
                type={type}
                maxLength={key === "stateCode" ? 2 : 160}
                pattern={key === "stateCode" ? "[0-9]{2}" : undefined}
                value={form[key]}
                onChange={(event) =>
                  setForm({ ...form, [key]: event.target.value })
                }
              />
            </label>
          ))}
          <p className="mt-3 text-xs leading-5 text-muted">
            For a GST registered customer, use the correct state code and GSTIN
            from their records. The customer API checks GSTIN format only.
          </p>
          <Button className="mt-4 w-full" disabled={busy}>
            {busy ? "Saving…" : "Add customer"}
          </Button>
        </form>
      )}
    </div>
  );
}
