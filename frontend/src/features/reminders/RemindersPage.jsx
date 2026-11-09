import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient.js";
import { Button } from "../../components/ui/Button.jsx";

const cardClass =
  "rounded-2xl border border-line bg-surface p-5 shadow-card dark:border-slate-800 dark:bg-slate-900";
const inputClass =
  "mt-1 min-h-11 rounded-xl border border-line bg-white px-3 text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const defaultSchedule = [
  { key: "before_due_3", offsetDays: 3, when: "before_due" },
  { key: "on_due", offsetDays: 0, when: "on_due" },
  { key: "after_due_3", offsetDays: 3, when: "after_due" },
];

export function RemindersPage({ readOnly = false }) {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [time, setTime] = useState("09:00");
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [settingsResponse, statusResponse] = await Promise.all([
        apiClient.get("/settings/reminders"),
        apiClient.get("/reminders/status"),
      ]);
      const reminders = settingsResponse.data.reminders;
      setSettings(reminders);
      setTime(reminders.sendTimeLocal ?? "09:00");
      setSchedule(reminders.schedule ?? []);
      setStatus(statusResponse.data.status);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not load reminder settings.",
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveSettings(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiClient.patch("/settings/reminders", {
        sendTimeLocal: time,
        schedule,
      });
      setSettings(response.data.reminders);
      setNotice("Reminder schedule saved.");
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not save reminder settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled() {
    if (!settings) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiClient.patch("/settings/reminders", {
        enabled: !settings.enabled,
      });
      setNotice(
        settings.enabled
          ? "Reminders disabled."
          : "Reminders enabled. Existing cancelled reminders will not be restored.",
      );
      await load();
    } catch (requestError) {
      const details = requestError?.response?.data?.error?.details;
      if (
        requestError?.response?.data?.error?.code ===
        "REMINDERS_DISABLE_CONFIRMATION_REQUIRED"
      ) {
        const count = details?.pendingCount ?? 0;
        const confirmed = window.confirm(
          `${count} scheduled reminders will be cancelled. Turning reminders back on will not restore them.`,
        );
        if (confirmed) {
          try {
            await apiClient.patch("/settings/reminders", {
              enabled: false,
              confirmCancelPending: count,
            });
            setNotice(
              "Reminders disabled. Existing cancelled reminders will not be restored.",
            );
            await load();
          } catch (confirmError) {
            setError(
              confirmError?.response?.data?.error?.message ??
                "Could not disable reminders.",
            );
          }
        }
      } else {
        setError(
          requestError?.response?.data?.error?.message ??
            "Could not update reminders.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setError("");
    try {
      const response = await apiClient.post("/reminders/run-now");
      setNotice(
        response.data.acquired
          ? `Reminder check finished. ${response.data.processed} due reminders processed.`
          : "A reminder check is already running.",
      );
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not run the reminder check.",
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleRule(rule) {
    setSchedule((current) =>
      current.some((item) => item.key === rule.key)
        ? current.filter((item) => item.key !== rule.key)
        : [...current, rule],
    );
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
      <section className={cardClass} aria-labelledby="reminder-health-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              id="reminder-health-title"
              className="text-lg font-semibold text-ink dark:text-white"
            >
              Reminder health
            </h2>
            <p className="mt-2 text-sm text-muted dark:text-slate-400">
              {status?.healthy
                ? "The reminder service is up to date."
                : "Some reminders need attention or are waiting to run."}
              {status?.lastSuccessfulRunAt
                ? ` Last successful check: ${new Date(status.lastSuccessfulRunAt).toLocaleString()}.`
                : " No successful check has completed yet."}
            </p>
            <p className="mt-1 text-xs text-muted dark:text-slate-500">
              Due: {status?.dueUnprocessed ?? 0} · Failed: {status?.failed ?? 0}{" "}
              · Cancelled: {status?.cancelled ?? 0}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={busy || readOnly}
            onClick={runNow}
          >
            Run check now
          </Button>
        </div>
      </section>

      {settings && (
        <>
          <section
            className={cardClass}
            aria-labelledby="reminder-control-title"
          >
            <h2
              id="reminder-control-title"
              className="text-lg font-semibold text-ink dark:text-white"
            >
              Send reminders
            </h2>
            <p className="mt-2 text-sm text-muted dark:text-slate-400">
              In-app reminders are sent to active members of this workspace.
              Email to customers is not enabled.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={settings.enabled}
                aria-label="Send reminders"
                disabled={busy || readOnly}
                onClick={toggleEnabled}
                className={`relative h-7 w-12 rounded-full transition-colors ${settings.enabled ? "bg-brand-700" : "bg-slate-400"}`}
              >
                <span
                  className={`absolute top-1 size-5 rounded-full bg-white transition-transform ${settings.enabled ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
              <span className="text-sm font-medium">
                {settings.enabled ? "On" : "Off"}
              </span>
            </div>
            {!settings.enabled && (
              <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                Turning reminders back on will not restore cancelled reminders.
                New invoices finalized after re-enabling can receive a new
                schedule.
              </p>
            )}
          </section>

          <form className={cardClass} onSubmit={saveSettings}>
            <h2 className="text-lg font-semibold text-ink dark:text-white">
              Reminder schedule
            </h2>
            <p className="mt-2 text-sm text-muted dark:text-slate-400">
              Times use your business timezone. Late reminders are skipped after
              48 hours.
            </p>
            <label className="mt-4 block text-sm font-medium">
              Send time
              <input
                className={`${inputClass} ml-2`}
                type="time"
                disabled={readOnly}
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
            <fieldset className="mt-5 space-y-3">
              <legend className="text-sm font-semibold">When to notify</legend>
              {defaultSchedule.map((rule) => (
                <label
                  className="flex items-center gap-3 text-sm"
                  key={rule.key}
                >
                  <input
                    type="checkbox"
                    disabled={!settings.enabled || readOnly}
                    checked={schedule.some((item) => item.key === rule.key)}
                    onChange={() => toggleRule(rule)}
                  />
                  {rule.when === "before_due"
                    ? `${rule.offsetDays} days before the due date`
                    : rule.when === "on_due"
                      ? "On the due date"
                      : `${rule.offsetDays} days after the due date`}
                </label>
              ))}
            </fieldset>
            <Button
              className="mt-5"
              type="submit"
              disabled={busy || !settings.enabled || readOnly}
            >
              Save schedule
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
