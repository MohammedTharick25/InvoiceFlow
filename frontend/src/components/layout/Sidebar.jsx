import { Navigation } from "./Navigation.jsx";

function Brand() {
  return (
    <span className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">
        I
      </span>
      <span className="text-base font-semibold tracking-tight text-ink dark:text-white">
        InvoiceFlow
      </span>
    </span>
  );
}

export { Brand };

export function Sidebar({ navigation, activePage, onNavigate }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-line bg-surface px-4 py-6 dark:border-slate-800 dark:bg-slate-900 lg:block">
      <a className="mb-10 block px-2" href="/">
        <Brand />
      </a>
      <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted dark:text-slate-400">
        Workspace
      </p>
      <Navigation
        navigation={navigation}
        activePage={activePage}
        onNavigate={onNavigate}
      />
    </aside>
  );
}
