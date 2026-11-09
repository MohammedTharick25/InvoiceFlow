import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { apiErrorMessage, completeOnboarding } from "../../lib/authClient.js";
import { useAuthStore } from "../../store/authStore.js";

const businessTypes = [
  ["individual", "Individual"],
  ["company", "Company"],
  ["partnership", "Partnership"],
  ["other", "Other"],
];
const currencies = ["INR", "USD", "EUR", "JPY", "KWD"];

export function OnboardingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [name, setName] = useState("");
  const [type, setType] = useState("individual");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [gstRegistered, setGstRegistered] = useState(false);
  const [gstin, setGstin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const address = {
      line1,
      city,
      stateCode,
      postalCode,
      country: "India",
    };
    try {
      await completeOnboarding({
        name,
        type,
        email,
        phone,
        currency,
        address,
        tax: {
          gstRegistered,
          gstin: gstRegistered ? gstin : "",
          stateCode: gstRegistered ? stateCode : "",
        },
      });
      navigate("/", { replace: true });
    } catch (requestError) {
      setError(
        apiErrorMessage(
          requestError,
          "Workspace setup failed. Check your details and try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 dark:bg-slate-950">
      <section className="w-full max-w-2xl rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-9 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
          Set up your business
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink dark:text-white">
          Create your workspace
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted dark:text-slate-400">
          Your 14-day King trial starts when setup is complete. No card is
          collected.
        </p>

        <form className="mt-7 space-y-6" onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100 sm:col-span-2">
              Business name
              <Input
                autoFocus
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
              Business type
              <select
                className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                onChange={(event) => setType(event.target.value)}
                value={type}
              >
                {businessTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
              Invoice currency
              <select
                className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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
          </div>

          <section aria-labelledby="contact-heading" className="space-y-4">
            <h2
              className="text-base font-semibold text-ink dark:text-white"
              id="contact-heading"
            >
              Business contact
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
                Email
                <Input
                  autoComplete="email"
                  maxLength={254}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  value={email}
                />
              </label>
              <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
                Phone
                <Input
                  autoComplete="tel"
                  maxLength={30}
                  onChange={(event) => setPhone(event.target.value)}
                  type="tel"
                  value={phone}
                />
              </label>
              <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100 sm:col-span-2">
                Street address
                <Input
                  autoComplete="address-line1"
                  maxLength={160}
                  onChange={(event) => setLine1(event.target.value)}
                  value={line1}
                />
              </label>
              <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
                City
                <Input
                  autoComplete="address-level2"
                  maxLength={100}
                  onChange={(event) => setCity(event.target.value)}
                  value={city}
                />
              </label>
              <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
                Postal code
                <Input
                  autoComplete="postal-code"
                  maxLength={20}
                  onChange={(event) => setPostalCode(event.target.value)}
                  value={postalCode}
                />
              </label>
            </div>
          </section>

          <section aria-labelledby="tax-heading" className="space-y-4">
            <h2
              className="text-base font-semibold text-ink dark:text-white"
              id="tax-heading"
            >
              GST registration
            </h2>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink dark:text-slate-100">
              <input
                checked={gstRegistered}
                className="size-4 accent-brand-700"
                onChange={(event) => setGstRegistered(event.target.checked)}
                type="checkbox"
              />
              My business is registered for GST
            </label>
            {gstRegistered && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
                  GSTIN
                  <Input
                    autoComplete="off"
                    maxLength={15}
                    onChange={(event) =>
                      setGstin(event.target.value.toUpperCase())
                    }
                    required
                    value={gstin}
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
                  Registration state code
                  <Input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={2}
                    minLength={2}
                    onChange={(event) => setStateCode(event.target.value)}
                    pattern="[0-9]{2}"
                    placeholder="For example, 29"
                    required
                    value={stateCode}
                  />
                </label>
                <p className="text-xs leading-5 text-muted dark:text-slate-400 sm:col-span-2">
                  GSTIN format and state code are checked when you save. Confirm
                  tax details with your accountant.
                </p>
              </div>
            )}
          </section>

          {error && (
            <p
              className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
          )}
          <Button
            className="w-full sm:w-auto"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Creating workspace…" : "Create workspace"}
          </Button>
        </form>
      </section>
    </main>
  );
}
