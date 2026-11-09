import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";
import { Brand } from "./Sidebar.jsx";
import { MobileNavigation } from "./MobileNavigation.jsx";

export function Header({
  dark,
  onToggleTheme,
  mobileOpen,
  onToggleMobile,
  navigation,
  activePage,
  onNavigate,
  user,
  onSignOut,
  signOutError,
}) {
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    if (!onSignOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <a className="lg:hidden" href="/">
          <Brand />
        </a>
        <div className="hidden text-sm text-muted dark:text-slate-400 lg:block">
          Business workspace
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            className="grid size-10 place-items-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onToggleTheme}
            type="button"
          >
            {dark ? (
              <Sun aria-hidden="true" className="size-5" />
            ) : (
              <Moon aria-hidden="true" className="size-5" />
            )}
          </button>
          <span
            className="hidden max-w-40 truncate text-sm text-muted dark:text-slate-400 sm:block"
            title={user?.email}
          >
            {user?.name || user?.email}
          </span>
          <button
            aria-label="Sign out"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
            disabled={signingOut}
            onClick={signOut}
            type="button"
          >
            <LogOut aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">
              {signingOut ? "Signing out…" : "Sign out"}
            </span>
          </button>
          <button
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            className="grid size-10 place-items-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
            onClick={onToggleMobile}
            type="button"
          >
            {mobileOpen ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
      </div>
      <MobileNavigation
        open={mobileOpen}
        onClose={() => onToggleMobile(false)}
        navigation={navigation}
        activePage={activePage}
        onNavigate={onNavigate}
      />
      {signOutError && (
        <p
          className="border-t border-red-200 px-4 py-2 text-right text-sm text-red-800 dark:border-red-950 dark:text-red-200"
          role="alert"
        >
          {signOutError}
        </p>
      )}
    </header>
  );
}
