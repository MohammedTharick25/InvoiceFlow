import { Info } from "lucide-react";

export function ProvisionalBanner({ signedOff = false, children }) {
  if (signedOff) return null;
  return (
    <section
      aria-label="Calculation policy status"
      className="rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6 dark:border-amber-800 dark:bg-amber-950/35"
    >
      <div className="flex items-start gap-3">
        <Info
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-amber-800 dark:text-amber-300"
        />
        <div>
          <h2 className="font-semibold text-amber-950 dark:text-amber-100">
            Calculation policy provisional
          </h2>
          {children}
        </div>
      </div>
    </section>
  );
}
