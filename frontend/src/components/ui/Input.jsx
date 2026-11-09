export function Input({ className = "", ...props }) {
  return (
    <input
      className={`min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-muted outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white ${className}`}
      {...props}
    />
  );
}
