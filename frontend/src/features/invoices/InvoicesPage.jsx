import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient.js";
import {
  CURRENCY_DECIMALS,
  formatMoney,
  parseMajorToMinor,
  parseQuantityMilli,
} from "../../lib/money.js";
import { Button } from "../../components/ui/Button.jsx";

const fieldClass =
  "mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const cardClass =
  "rounded-2xl border border-line bg-surface p-5 shadow-card dark:border-slate-800 dark:bg-slate-900";

function errorText(error) {
  return (
    error?.response?.data?.error?.message ??
    "The request failed. Please try again."
  );
}

function minorToInput(value, currency) {
  const digits = CURRENCY_DECIMALS[currency] ?? 2;
  const scale = 10 ** digits;
  const amount = Number(value ?? 0);
  return digits
    ? `${Math.floor(amount / scale)}.${String(amount % scale).padStart(digits, "0")}`
    : String(amount);
}

function localDateTimeInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function InvoicesPage({
  readOnly = false,
  currency = "INR",
  gstRegistered = false,
}) {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [placeCandidates, setPlaceCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [placeConfirmed, setPlaceConfirmed] = useState(false);
  const [reverseChargeChoice, setReverseChargeChoice] = useState("");
  const [paymentKey, setPaymentKey] = useState(() =>
    globalThis.crypto.randomUUID(),
  );
  const [form, setForm] = useState({
    customerId: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    taxability: "non_gst",
    taxCode: "GST18",
    hsnSac: "",
  });
  const [editForm, setEditForm] = useState({
    description: "",
    quantity: "1",
    unitPrice: "0",
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paidAt: localDateTimeInput(),
    method: "bank_transfer",
    reference: "",
    notes: "",
  });

  function setInvoice(invoice) {
    setSelected(invoice);
    const first = invoice?.items?.[0];
    if (first)
      setEditForm({
        description: first.description,
        quantity: String(first.quantityMilli / 1000),
        unitPrice: minorToInput(
          first.unitPriceMinor,
          invoice.currency ?? currency,
        ),
      });
  }

  const load = useCallback(async () => {
    setError("");
    try {
      const [invoiceResult, customerResult] = await Promise.all([
        apiClient.get("/invoices", {
          params: { page: 1, limit: 100, sort: "issueDate", direction: "desc" },
        }),
        apiClient.get("/customers", { params: { page: 1, limit: 100 } }),
      ]);
      setInvoices(invoiceResult.data.invoices ?? []);
      setCustomers(customerResult.data.customers ?? []);
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiClient.get("/invoices", {
        params: { page: 1, limit: 100, sort: "issueDate", direction: "desc" },
      }),
      apiClient.get("/customers", { params: { page: 1, limit: 100 } }),
    ])
      .then(([invoiceResult, customerResult]) => {
        if (!active) return;
        setInvoices(invoiceResult.data.invoices ?? []);
        setCustomers(customerResult.data.customers ?? []);
      })
      .catch((requestError) => {
        if (active) setError(errorText(requestError));
      });
    return () => {
      active = false;
    };
  }, []);

  async function createDraft(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiClient.post("/invoices", {
        customerId: form.customerId,
        items: [
          {
            description: form.description,
            quantityMilli: parseQuantityMilli(form.quantity),
            unitPriceMinor: parseMajorToMinor(form.unitPrice || "0", currency),
            taxability: form.taxability,
            taxCode: form.taxability === "taxable" ? form.taxCode : "",
            hsnSac: form.hsnSac,
          },
        ],
      });
      const detail = await apiClient.get(
        `/invoices/${response.data.invoice.id}`,
      );
      setInvoice(detail.data.invoice);
      setPlaceCandidates(detail.data.placeOfSupplyCandidates ?? []);
      setForm({
        customerId: "",
        description: "",
        quantity: "1",
        unitPrice: "",
        taxability: "non_gst",
        taxCode: "GST18",
        hsnSac: "",
      });
      setNotice("Draft created. Review the details before finalizing.");
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSelected(id) {
    const [response, paymentResponse] = await Promise.all([
      apiClient.get(`/invoices/${id}`),
      apiClient.get(`/invoices/${id}/payments`, {
        params: { page: 1, limit: 100 },
      }),
    ]);
    const invoice = response.data.invoice ?? response.data;
    setInvoice(invoice);
    setPlaceCandidates(response.data.placeOfSupplyCandidates ?? []);
    setPayments(paymentResponse.data.payments ?? []);
    setPlaceConfirmed(false);
    setReverseChargeChoice("");
    await load();
  }

  async function recordPayment(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiClient.post(`/invoices/${selected.id}/payments`, {
        idempotencyKey: paymentKey,
        amountMinor: parseMajorToMinor(
          paymentForm.amount,
          selected.currency ?? currency,
        ),
        paidAt: new Date(paymentForm.paidAt).toISOString(),
        method: paymentForm.method,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
      });
      setPaymentKey(globalThis.crypto.randomUUID());
      setPaymentForm({ ...paymentForm, amount: "", reference: "", notes: "" });
      await refreshSelected(selected.id);
      setNotice("Payment recorded.");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function reversePayment(event, payment) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiClient.post(
        `/invoices/${selected.id}/payments/${payment.id}/reverse`,
        {
          idempotencyKey: globalThis.crypto.randomUUID(),
          reason: data.get("reason"),
        },
      );
      await refreshSelected(selected.id);
      setNotice("Payment reversal recorded.");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function openInvoice(invoice) {
    setInvoice(invoice);
    setError("");
    setNotice("");
    try {
      await refreshSelected(invoice.id);
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  async function choosePlaceOfSupply(event) {
    const [basis, stateCode] = event.target.value.split(":");
    if (!basis || !stateCode || !selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiClient.patch(`/invoices/${selected.id}`, {
        placeOfSupply: { basis, stateCode },
      });
      setInvoice(response.data.invoice);
      setPlaceConfirmed(false);
      setPlaceCandidates(
        response.data.placeOfSupplyCandidates ?? placeCandidates,
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function updateDraft(event) {
    event.preventDefault();
    if (!selected?.items?.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const items = selected.items.map((item, index) => ({
        description: index === 0 ? editForm.description : item.description,
        hsnSac: item.hsnSac ?? "",
        unit: item.unit ?? "unit",
        quantityMilli:
          index === 0
            ? parseQuantityMilli(editForm.quantity)
            : item.quantityMilli,
        unitPriceMinor:
          index === 0
            ? parseMajorToMinor(editForm.unitPrice, currency)
            : item.unitPriceMinor,
        discount: item.discount ?? { type: "none" },
        taxability: item.taxability,
        taxCode: item.taxCode ?? "",
        taxabilityNote: item.taxabilityNote ?? "",
      }));
      const response = await apiClient.patch(`/invoices/${selected.id}`, {
        items,
      });
      setInvoice(response.data.invoice);
      setNotice("Draft updated.");
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function clearDraftAmounts() {
    if (!selected || selected.status !== "draft") return;
    const confirmed = window.confirm(
      "Clear saved prices and discounts from this draft? Descriptions and quantities remain, but the cleared amounts will not be restored.",
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiClient.post(
        `/invoices/${selected.id}/clear-amounts`,
        { confirmation: "CLEAR_AMOUNTS" },
      );
      setInvoice(response.data.invoice);
      setNotice("Draft amounts cleared. Review the draft before finalizing.");
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiClient.post(`/invoices/${selected.id}/finalize`, {
        idempotencyKey: globalThis.crypto.randomUUID(),
        ...(gstRegistered
          ? {
              confirmPlaceOfSupply: placeConfirmed,
              reverseCharge: reverseChargeChoice,
            }
          : {}),
      });
      await refreshSelected(selected.id);
      setNotice(
        "The invoice number and archived PDF are ready. No customer communication was made.",
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiClient.get(`/invoices/${selected.id}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${selected.number ?? "invoice-draft"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function markSent(event) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await apiClient.post(`/invoices/${selected.id}/mark-sent`, {
        idempotencyKey: globalThis.crypto.randomUUID(),
        via: data.get("via"),
        declaredAt: new Date().toISOString(),
      });
      await refreshSelected(selected.id);
      setNotice(
        "Sent status recorded based on your declaration. InvoiceFlow did not deliver the invoice.",
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function unmarkSent(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await apiClient.post(`/invoices/${selected.id}/unmark-sent`, {
        idempotencyKey: globalThis.crypto.randomUUID(),
        note: data.get("note"),
      });
      await refreshSelected(selected.id);
      setNotice("Sent status cleared.");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <section className={cardClass} aria-labelledby="invoice-list-heading">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="invoice-list-heading"
            className="text-lg font-semibold text-ink dark:text-white"
          >
            Invoices
          </h2>
          <Button
            variant="secondary"
            onClick={() => void load()}
            disabled={busy}
          >
            Refresh
          </Button>
        </div>
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
        <div className="mt-4 divide-y divide-line dark:divide-slate-800">
          {invoices.length === 0 ? (
            <p className="py-6 text-sm text-muted">
              No invoices yet. Create a draft once a customer is available.
            </p>
          ) : (
            invoices.map((invoice) => (
              <button
                key={invoice.id}
                type="button"
                onClick={() => void openInvoice(invoice)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left hover:bg-canvas dark:hover:bg-slate-800/60"
              >
                <span>
                  <span className="block font-medium text-ink dark:text-white">
                    {invoice.number ?? "Draft invoice"}
                  </span>
                  <span className="text-xs text-muted">
                    {invoice.status} · {invoice.issueDate}
                  </span>
                </span>
                <span className="font-semibold text-ink dark:text-white">
                  {formatMoney(
                    invoice.totals?.totalMinor ?? 0,
                    invoice.currency ?? currency,
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <div className="space-y-5">
        {!readOnly && (
          <form className={cardClass} onSubmit={createDraft}>
            <h2 className="text-lg font-semibold text-ink dark:text-white">
              New draft
            </h2>
            <label className="mt-4 block text-sm font-medium text-ink dark:text-slate-200">
              Customer
              <select
                className={fieldClass}
                required
                value={form.customerId}
                onChange={(event) =>
                  setForm({ ...form, customerId: event.target.value })
                }
              >
                <option value="">Choose a customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium text-ink dark:text-slate-200">
              Description
              <input
                className={fieldClass}
                required
                maxLength={500}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-ink dark:text-slate-200">
                Quantity
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  required
                  value={form.quantity}
                  onChange={(event) =>
                    setForm({ ...form, quantity: event.target.value })
                  }
                />
              </label>
              <label className="text-sm font-medium text-ink dark:text-slate-200">
                Unit price
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  required
                  value={form.unitPrice}
                  onChange={(event) =>
                    setForm({ ...form, unitPrice: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="mt-3 block text-sm font-medium text-ink dark:text-slate-200">
              Tax treatment
              <select
                className={fieldClass}
                value={form.taxability}
                onChange={(event) =>
                  setForm({ ...form, taxability: event.target.value })
                }
              >
                <option value="non_gst">Non-GST</option>
                <option value="taxable">Taxable</option>
                <option value="zero_rated">Zero-rated</option>
                <option value="exempt">Exempt</option>
                <option value="nil_rated">Nil-rated</option>
              </select>
            </label>
            {form.taxability === "taxable" && (
              <label className="mt-3 block text-sm font-medium text-ink dark:text-slate-200">
                Tax rate code
                <input
                  className={fieldClass}
                  required
                  maxLength={30}
                  value={form.taxCode}
                  onChange={(event) =>
                    setForm({ ...form, taxCode: event.target.value })
                  }
                />
              </label>
            )}
            <label className="mt-3 block text-sm font-medium text-ink dark:text-slate-200">
              HSN/SAC (if known)
              <input
                className={fieldClass}
                inputMode="numeric"
                pattern="([0-9]{4}|[0-9]{6}|[0-9]{8})?"
                maxLength={8}
                value={form.hsnSac}
                onChange={(event) =>
                  setForm({ ...form, hsnSac: event.target.value })
                }
              />
            </label>
            <p className="mt-3 text-xs leading-5 text-muted">
              Tax rates and HSN/SAC policy are configurable starting points.
              Confirm the treatment with your accountant.
            </p>
            <Button
              className="mt-4 w-full"
              disabled={busy || customers.length === 0}
            >
              {busy ? "Working…" : "Create draft"}
            </Button>
            {customers.length === 0 && (
              <p className="mt-2 text-xs text-muted">
                Add a customer before creating an invoice.
              </p>
            )}
          </form>
        )}

        <section className={cardClass} aria-labelledby="invoice-detail-heading">
          <h2
            id="invoice-detail-heading"
            className="text-lg font-semibold text-ink dark:text-white"
          >
            Invoice details
          </h2>
          {!selected ? (
            <p className="mt-3 text-sm text-muted">
              Choose an invoice to review available actions.
            </p>
          ) : (
            <>
              <p className="mt-3 font-medium text-ink dark:text-white">
                {selected.number ?? "Draft invoice"} · {selected.status}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <p>
                  <span className="block text-xs text-muted">Total</span>
                  <strong className="text-ink dark:text-white">
                    {formatMoney(
                      selected.totals?.totalMinor ?? 0,
                      selected.currency ?? currency,
                    )}
                  </strong>
                </p>
                <p>
                  <span className="block text-xs text-muted">Paid</span>
                  <strong className="text-ink dark:text-white">
                    {formatMoney(
                      selected.amountPaidMinor ?? 0,
                      selected.currency ?? currency,
                    )}
                  </strong>
                </p>
                <p>
                  <span className="block text-xs text-muted">Balance</span>
                  <strong className="text-ink dark:text-white">
                    {formatMoney(
                      selected.balanceMinor ?? selected.totals?.totalMinor ?? 0,
                      selected.currency ?? currency,
                    )}
                  </strong>
                </p>
              </div>
              {selected.items?.length > 0 && (
                <section
                  className="mt-4 border-t border-line pt-4 dark:border-slate-800"
                  aria-labelledby="invoice-calculation-heading"
                >
                  <h3
                    id="invoice-calculation-heading"
                    className="text-sm font-semibold text-ink dark:text-white"
                  >
                    Invoice calculation
                  </h3>
                  <ul className="mt-2 space-y-3 text-sm">
                    {selected.items.map((item, index) => (
                      <li
                        className="rounded-xl bg-canvas p-3 dark:bg-slate-800/60"
                        key={`${item.description}-${index}`}
                      >
                        <p className="font-medium text-ink dark:text-white">
                          {item.description}
                          {item.hsnSac ? ` · HSN/SAC ${item.hsnSac}` : ""}
                        </p>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
                          <div>
                            <dt className="text-muted">Taxable value</dt>
                            <dd>
                              {formatMoney(
                                item.taxableMinor ?? 0,
                                selected.currency ?? currency,
                              )}
                            </dd>
                          </div>
                          {item.cgstMinor > 0 && (
                            <div>
                              <dt className="text-muted">CGST</dt>
                              <dd>
                                {formatMoney(
                                  item.cgstMinor,
                                  selected.currency ?? currency,
                                )}
                              </dd>
                            </div>
                          )}
                          {item.sgstMinor > 0 && (
                            <div>
                              <dt className="text-muted">
                                {selected.stateTaxLabel ?? "SGST"}
                              </dt>
                              <dd>
                                {formatMoney(
                                  item.sgstMinor,
                                  selected.currency ?? currency,
                                )}
                              </dd>
                            </div>
                          )}
                          {item.utgstMinor > 0 && (
                            <div>
                              <dt className="text-muted">UTGST</dt>
                              <dd>
                                {formatMoney(
                                  item.utgstMinor,
                                  selected.currency ?? currency,
                                )}
                              </dd>
                            </div>
                          )}
                          {item.igstMinor > 0 && (
                            <div>
                              <dt className="text-muted">IGST</dt>
                              <dd>
                                {formatMoney(
                                  item.igstMinor,
                                  selected.currency ?? currency,
                                )}
                              </dd>
                            </div>
                          )}
                          {item.rateBp > 0 && (
                            <div>
                              <dt className="text-muted">Rate</dt>
                              <dd>{item.rateBp / 100}%</dd>
                            </div>
                          )}
                          {item.taxability && item.taxability !== "taxable" && (
                            <div>
                              <dt className="text-muted">Tax treatment</dt>
                              <dd>{item.taxability.replaceAll("_", " ")}</dd>
                            </div>
                          )}
                        </dl>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section
                className="mt-4 border-t border-line pt-4 dark:border-slate-800"
                aria-labelledby="payment-history-heading"
              >
                <h3
                  id="payment-history-heading"
                  className="text-sm font-semibold text-ink dark:text-white"
                >
                  Payments
                </h3>
                {payments.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    No payments recorded.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-line dark:divide-slate-800">
                    {payments.map((payment) => (
                      <li className="py-3" key={payment.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-ink dark:text-white">
                            {formatMoney(payment.amountMinor, payment.currency)}{" "}
                            · {payment.status}
                          </span>
                          <span className="text-xs text-muted">
                            {new Date(payment.paidAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          {payment.method.replaceAll("_", " ")}
                          {payment.reference ? ` · ${payment.reference}` : ""}
                        </p>
                        {payment.status === "recorded" && (
                          <form
                            className="mt-2 flex flex-col gap-2 sm:flex-row"
                            onSubmit={(event) =>
                              void reversePayment(event, payment)
                            }
                          >
                            <input
                              className={fieldClass}
                              name="reason"
                              required
                              minLength={1}
                              maxLength={1000}
                              placeholder="Reason for reversal"
                            />
                            <Button variant="secondary" disabled={busy}>
                              Reverse
                            </Button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {["issued", "sent", "partially_paid"].includes(
                  selected.status,
                ) &&
                  selected.balanceMinor > 0 && (
                    <form
                      className="mt-4 space-y-3 border-t border-line pt-4 dark:border-slate-800"
                      onSubmit={recordPayment}
                    >
                      <h4 className="text-sm font-semibold text-ink dark:text-white">
                        Record a payment
                      </h4>
                      <label className="block text-sm font-medium text-ink dark:text-slate-200">
                        Amount
                        <input
                          className={fieldClass}
                          required
                          inputMode="decimal"
                          value={paymentForm.amount}
                          onChange={(event) =>
                            setPaymentForm({
                              ...paymentForm,
                              amount: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-sm font-medium text-ink dark:text-slate-200">
                          Date and time
                          <input
                            className={fieldClass}
                            type="datetime-local"
                            required
                            value={paymentForm.paidAt}
                            onChange={(event) =>
                              setPaymentForm({
                                ...paymentForm,
                                paidAt: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="text-sm font-medium text-ink dark:text-slate-200">
                          Method
                          <select
                            className={fieldClass}
                            value={paymentForm.method}
                            onChange={(event) =>
                              setPaymentForm({
                                ...paymentForm,
                                method: event.target.value,
                              })
                            }
                          >
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Bank transfer</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                            <option value="cheque">Cheque</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                      </div>
                      <label className="block text-sm font-medium text-ink dark:text-slate-200">
                        Reference (optional)
                        <input
                          className={fieldClass}
                          maxLength={120}
                          value={paymentForm.reference}
                          onChange={(event) =>
                            setPaymentForm({
                              ...paymentForm,
                              reference: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium text-ink dark:text-slate-200">
                        Notes (optional)
                        <input
                          className={fieldClass}
                          maxLength={1000}
                          value={paymentForm.notes}
                          onChange={(event) =>
                            setPaymentForm({
                              ...paymentForm,
                              notes: event.target.value,
                            })
                          }
                        />
                      </label>
                      <Button disabled={busy}>Record payment</Button>
                    </form>
                  )}
              </section>
              {selected.status === "draft" &&
                !readOnly &&
                selected.items?.length > 0 && (
                  <form
                    className="mt-4 border-t border-line pt-4 dark:border-slate-800"
                    onSubmit={updateDraft}
                  >
                    <h3 className="text-sm font-semibold text-ink dark:text-white">
                      Edit first line
                    </h3>
                    <label className="mt-2 block text-sm font-medium text-ink dark:text-slate-200">
                      Description
                      <input
                        className={fieldClass}
                        required
                        maxLength={500}
                        value={editForm.description}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <label className="text-sm font-medium text-ink dark:text-slate-200">
                        Quantity
                        <input
                          className={fieldClass}
                          required
                          inputMode="decimal"
                          value={editForm.quantity}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              quantity: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="text-sm font-medium text-ink dark:text-slate-200">
                        Unit price
                        <input
                          className={fieldClass}
                          required
                          inputMode="decimal"
                          value={editForm.unitPrice}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              unitPrice: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <Button
                      variant="secondary"
                      className="mt-3"
                      disabled={busy}
                    >
                      Save draft changes
                    </Button>
                  </form>
                )}
              {selected.status === "draft" && placeCandidates.length > 0 && (
                <label className="mt-3 block text-sm font-medium text-ink dark:text-slate-200">
                  Place of supply
                  <select
                    className={fieldClass}
                    value={
                      selected.placeOfSupply
                        ? `${selected.placeOfSupply.basis}:${selected.placeOfSupply.stateCode}`
                        : ""
                    }
                    onChange={choosePlaceOfSupply}
                  >
                    <option value="">Choose a place of supply</option>
                    {placeCandidates.map((candidate) => (
                      <option
                        key={`${candidate.basis}:${candidate.stateCode}`}
                        value={`${candidate.basis}:${candidate.stateCode}`}
                      >
                        {candidate.basis.replaceAll("_", " ")} · state{" "}
                        {candidate.stateCode}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.status === "draft" && gstRegistered && !readOnly && (
                <div className="mt-3 space-y-3 rounded-xl bg-canvas p-3 dark:bg-slate-800/60">
                  <label className="flex items-start gap-2 text-sm text-ink dark:text-slate-200">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={placeConfirmed}
                      onChange={(event) =>
                        setPlaceConfirmed(event.target.checked)
                      }
                    />
                    I confirmed the place of supply shown above.
                  </label>
                  <label className="block text-sm font-medium text-ink dark:text-slate-200">
                    Reverse-charge declaration
                    <select
                      className={fieldClass}
                      value={reverseChargeChoice}
                      onChange={(event) =>
                        setReverseChargeChoice(event.target.value)
                      }
                    >
                      <option value="">Choose one</option>
                      <option value="not_applicable">
                        I confirmed it does not apply
                      </option>
                      <option value="applies">It applies</option>
                      <option value="unsure">I am unsure</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {selected.status === "draft" && !readOnly && (
                  <Button
                    onClick={() => void finalize()}
                    disabled={
                      busy ||
                      (gstRegistered &&
                        (!selected.placeOfSupply?.stateCode ||
                          !placeConfirmed ||
                          !reverseChargeChoice))
                    }
                  >
                    Finalize
                  </Button>
                )}
                {selected.status === "draft" && !readOnly && (
                  <Button
                    variant="secondary"
                    onClick={() => void clearDraftAmounts()}
                    disabled={busy}
                  >
                    Clear amounts
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => void downloadPdf()}
                  disabled={busy}
                >
                  Download PDF
                </Button>
              </div>
              {selected.status === "sent" && !readOnly && (
                <form
                  className="mt-4 border-t border-line pt-4 dark:border-slate-800"
                  onSubmit={unmarkSent}
                >
                  <label className="block text-sm font-medium text-ink dark:text-slate-200">
                    Why are you clearing the sent status?
                    <input
                      className={fieldClass}
                      name="note"
                      required
                      minLength={1}
                      maxLength={1000}
                    />
                  </label>
                  <Button variant="secondary" className="mt-3" disabled={busy}>
                    Clear sent status
                  </Button>
                </form>
              )}
              {["issued", "sent"].includes(selected.status) &&
                selected.status !== "sent" &&
                !readOnly && (
                  <form
                    className="mt-4 border-t border-line pt-4 dark:border-slate-800"
                    onSubmit={markSent}
                  >
                    <p className="text-sm text-muted">
                      Record a sent status only after you have handed over or
                      sent the invoice yourself.
                    </p>
                    <label className="mt-3 block text-sm font-medium text-ink dark:text-slate-200">
                      How was it sent?
                      <select className={fieldClass} name="via">
                        <option value="handed_over">Handed over</option>
                        <option value="own_email">My email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="post">Post</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <Button
                      variant="secondary"
                      className="mt-3"
                      disabled={busy}
                    >
                      Record as sent
                    </Button>
                  </form>
                )}
              <p className="mt-4 text-xs leading-5 text-muted">
                The archived PDF is saved for download. InvoiceFlow does not
                email invoices automatically.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
