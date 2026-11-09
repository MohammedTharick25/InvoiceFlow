import { LockKeyhole } from "lucide-react";

export function ReadOnlyBanner({ onOpenBilling, onDownloadExport }) {
  return (
    <section
      aria-label="Read-only account"
      className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <LockKeyhole
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-amber-800 dark:text-amber-300"
      />
      <div>
        <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
          Your account is in read-only mode
        </h2>
        <p className="mt-1 text-sm leading-5 text-amber-900 dark:text-amber-200">
          You can view records, download PDFs, record payments on existing
          invoices, and export data. Choose a plan to create new records.
        </p>
        <a
          className="mt-2 inline-block text-sm font-semibold text-amber-950 underline-offset-4 hover:underline dark:text-amber-100"
          href="/settings/billing"
          onClick={(event) => {
            if (!onOpenBilling) return;
            event.preventDefault();
            onOpenBilling();
          }}
        >
          View plans
        </a>
        <button
          className="ml-4 mt-2 inline-block text-sm font-semibold text-amber-950 underline-offset-4 hover:underline dark:text-amber-100"
          onClick={onDownloadExport}
          type="button"
        >
          Download records
        </button>
      </div>
    </section>
  );
}
