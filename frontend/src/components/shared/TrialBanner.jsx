import { CalendarClock } from "lucide-react";

export function TrialBanner({ subscription, onOpenBilling }) {
  if (subscription?.status !== "trialing" || !subscription.trialEndsAt) {
    return null;
  }
  const endDate = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(subscription.trialEndsAt));

  return (
    <section
      aria-label="Trial status"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-brand-900 dark:bg-brand-950/60"
    >
      <div className="flex items-start gap-3">
        <CalendarClock
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-brand-700 dark:text-brand-300"
        />
        <div>
          <h2 className="text-sm font-semibold text-brand-950 dark:text-brand-100">
            Your 14-day King trial is active
          </h2>
          <p className="mt-1 text-sm text-brand-900/80 dark:text-brand-200/80">
            No card required. Trial ends {endDate}.
          </p>
        </div>
      </div>
      <a
        className="ml-8 text-sm font-semibold text-brand-800 underline-offset-4 hover:underline dark:text-brand-200"
        href="/settings/billing"
        onClick={(event) => {
          if (!onOpenBilling) return;
          event.preventDefault();
          onOpenBilling();
        }}
      >
        View plan details
      </a>
    </section>
  );
}
