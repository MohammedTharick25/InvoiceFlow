import { TrialBanner } from "../shared/TrialBanner.jsx";
import { ReadOnlyBanner } from "../shared/ReadOnlyBanner.jsx";

export function PageContainer({
  children,
  subscription,
  readOnly,
  onOpenBilling,
  onDownloadExport,
}) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
      {subscription && (
        <TrialBanner
          subscription={subscription}
          onOpenBilling={onOpenBilling}
        />
      )}
      {readOnly && (
        <ReadOnlyBanner
          onOpenBilling={onOpenBilling}
          onDownloadExport={onDownloadExport}
        />
      )}
      <main id="main-content" className="animate-enter">
        {children}
      </main>
      <footer className="mt-10 border-t border-line pt-5 text-xs leading-5 text-muted dark:border-slate-800 dark:text-slate-400">
        InvoiceFlow organizes records you configure. Review tax information with
        a qualified accountant.
      </footer>
    </div>
  );
}
