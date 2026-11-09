import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { apiClient } from "../../lib/apiClient.js";

export function TaxRatesPage({ readOnly = false }) {
  const [rates, setRates] = useState([]);
  const [code, setCode] = useState("GST18");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const response = await apiClient.get("/settings/tax-rates");
      setRates(response.data.taxRates ?? []);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not load tax-rate versions.",
      );
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const codeVersions = rates.filter(
    (item) => item.code === code.trim().toUpperCase(),
  );

  async function appendVersion(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiClient.post("/settings/tax-rates", {
        code,
        name,
        kind: "rate",
        rateBp: Math.round(Number(rate) * 100),
        ...(codeVersions.length ? { effectiveFrom } : {}),
      });
      setRates((current) => [...current, response.data.taxRate]);
      setNotice(`A new ${code.toUpperCase()} tax-rate version was added.`);
      setName("");
      setRate("");
      setEffectiveFrom("");
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not add the tax-rate version.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-ink dark:text-white">
          Tax-rate versions
        </h2>
        <p className="mt-2 text-sm text-muted dark:text-slate-400">
          Versions are append-only. A new rate applies from its effective date;
          finalized invoices retain their saved calculation. Confirm tax
          treatment with your accountant.
        </p>
        {rates.length === 0 ? (
          <p className="mt-4 text-sm text-muted dark:text-slate-300">
            No tax-rate versions are configured.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line dark:divide-slate-800">
            {rates.map((item) => (
              <li
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                key={item.id}
              >
                <span className="font-medium text-ink dark:text-white">
                  {item.code} · {item.name}
                </span>
                <span>
                  {item.kind === "end" ? "Ended" : `${item.rateBp / 100}%`} ·{" "}
                  {item.effectiveFrom ?? "Initial version"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <form
        className="rounded-2xl border border-line bg-surface p-5 shadow-card dark:border-slate-800 dark:bg-slate-900"
        onSubmit={appendVersion}
      >
        <h2 className="text-lg font-semibold text-ink dark:text-white">
          Add a tax-rate version
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Tax code
            <input
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
              maxLength={30}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              required
              value={code}
            />
          </label>
          <label className="text-sm font-medium">
            Version name
            <input
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="text-sm font-medium">
            Rate (%)
            <input
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
              inputMode="decimal"
              max="100"
              min="0.01"
              onChange={(event) => setRate(event.target.value)}
              required
              step="0.01"
              type="number"
              value={rate}
            />
          </label>
          <label className="text-sm font-medium">
            Effective from
            <input
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
              disabled={codeVersions.length === 0}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              required={codeVersions.length > 0}
              type="date"
              value={effectiveFrom}
            />
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted dark:text-slate-400">
          Rate data is configurable and non-authoritative. A new version must
          start after the most recent existing version.
        </p>
        <Button className="mt-4" disabled={readOnly || busy || !loaded}>
          Add version
        </Button>
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
      </form>
    </div>
  );
}
