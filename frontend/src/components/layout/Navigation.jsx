export function Navigation({ navigation, activePage, onNavigate, onSelect }) {
  return (
    <nav aria-label="Main navigation" className="space-y-1">
      {navigation.map(({ label, icon: Icon }) => {
        const active = activePage === label;
        return (
          <button
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors ${active ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            key={label}
            onClick={() => {
              onNavigate(label);
              onSelect?.();
            }}
            type="button"
          >
            <Icon aria-hidden="true" className="size-[18px] shrink-0" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
