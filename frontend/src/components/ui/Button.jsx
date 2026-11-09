export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}) {
  const style =
    variant === "secondary"
      ? "border border-line bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      : "bg-brand-700 text-white hover:bg-brand-800";
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${style} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
