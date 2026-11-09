export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}) {
  return (
    <section
      className={`rounded-2xl border border-dashed border-line bg-surface px-5 py-9 text-center dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {Icon && (
        <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      )}
      <h2 className="mt-4 text-base font-semibold text-ink dark:text-white">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted dark:text-slate-400">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}
