import { useState } from "react";
import { Header } from "./Header.jsx";
import { Sidebar } from "./Sidebar.jsx";
import { PageContainer } from "./PageContainer.jsx";

export function AppLayout({
  children,
  navigation,
  activePage,
  onNavigate,
  subscription,
  readOnly,
  user,
  onSignOut,
  signOutError,
  onOpenBilling,
  onDownloadExport,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === "dark",
  );

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("invoiceflow-theme", next ? "dark" : "light");
  }

  function toggleMobile(value) {
    setMobileOpen((open) => (typeof value === "boolean" ? value : !open));
  }

  return (
    <div className="min-h-screen bg-canvas text-ink transition-colors dark:bg-slate-950 dark:text-white">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        navigation={navigation}
        activePage={activePage}
        onNavigate={onNavigate}
      />
      <div className="lg:pl-64">
        <Header
          dark={dark}
          onToggleTheme={toggleTheme}
          mobileOpen={mobileOpen}
          onToggleMobile={toggleMobile}
          navigation={navigation}
          activePage={activePage}
          onNavigate={onNavigate}
          user={user}
          onSignOut={onSignOut}
          signOutError={signOutError}
        />
        <PageContainer
          subscription={subscription}
          readOnly={readOnly}
          onOpenBilling={onOpenBilling}
          onDownloadExport={onDownloadExport}
        >
          {children}
        </PageContainer>
      </div>
    </div>
  );
}
