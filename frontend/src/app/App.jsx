import { useMemo, useState } from "react";
import { AppLayout } from "../components/layout/AppLayout.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ProvisionalBanner } from "../components/shared/ProvisionalBanner.jsx";
import { useEntitlements } from "../hooks/useEntitlements.js";
import { InvoicesPage } from "../features/invoices/InvoicesPage.jsx";
import { CustomersPage } from "../features/customers/CustomersPage.jsx";
import { ExpensesPage } from "../features/expenses/ExpensesPage.jsx";
import { RemindersPage } from "../features/reminders/RemindersPage.jsx";
import { NotificationCenter } from "../features/notifications/NotificationCenter.jsx";
import { DashboardPage } from "../features/dashboard/DashboardPage.jsx";
import { ReportsPage } from "../features/reports/ReportsPage.jsx";
import { BillingPage } from "../features/billing/BillingPage.jsx";
import { BusinessSettingsPage } from "../features/settings/BusinessSettingsPage.jsx";
import { TaxRatesPage } from "../features/settings/TaxRatesPage.jsx";
import { apiClient } from "../lib/apiClient.js";
import { FileText, ReceiptText, UsersRound } from "lucide-react";

const disclaimer =
  "InvoiceFlow organizes invoice and tax information you configure. It does not file GST returns, give tax advice, or guarantee compliance. Review with a qualified accountant.";

export default function App({
  entitlements: serverEntitlements,
  subscription,
  readOnly = false,
  loading = false,
  policySignedOff = false,
  user,
  onSignOut,
  signOutError,
  workspace,
}) {
  const [page, setPage] = useState("Dashboard");
  const [exportError, setExportError] = useState("");
  const entitlements = useEntitlements(serverEntitlements);
  const isOwner = workspace?.membership?.role === "owner";
  const navigation = useMemo(
    () => [
      { label: "Dashboard", href: "/", icon: ReceiptText },
      { label: "Invoices", href: "/invoices", icon: FileText },
      { label: "Customers", href: "/customers", icon: UsersRound },
      { label: "Tax settings", href: "/settings/tax", icon: ReceiptText },
      ...(isOwner
        ? [
            {
              label: "Business settings",
              href: "/settings/business",
              icon: ReceiptText,
            },
          ]
        : []),
      ...(entitlements.expenses
        ? [{ label: "Expenses", href: "/expenses", icon: ReceiptText }]
        : []),
      ...(entitlements.reports || !serverEntitlements
        ? [{ label: "Reports", href: "/reports", icon: FileText }]
        : []),
      ...(entitlements.reminders || !serverEntitlements
        ? [{ label: "Reminders", href: "/reminders", icon: ReceiptText }]
        : []),
      ...(entitlements.team
        ? [{ label: "Team", href: "/team", icon: UsersRound }]
        : []),
      ...(isOwner
        ? [{ label: "Billing", href: "/settings/billing", icon: ReceiptText }]
        : []),
    ],
    [entitlements, isOwner, serverEntitlements],
  );

  async function downloadExport() {
    setExportError("");
    try {
      const response = await apiClient.get("/export", { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "invoiceflow-records.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Data export could not be downloaded. Try again.");
    }
  }

  return (
    <AppLayout
      navigation={navigation}
      activePage={page}
      onNavigate={setPage}
      subscription={subscription}
      readOnly={readOnly}
      user={user}
      onSignOut={onSignOut}
      signOutError={signOutError}
      onOpenBilling={() => setPage("Billing")}
      onDownloadExport={downloadExport}
    >
      <NotificationCenter />
      {exportError && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {exportError}
        </p>
      )}
      <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
            Workspace overview
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink dark:text-white sm:text-4xl">
            {page}
          </h1>
          <p className="mt-2 text-sm text-muted dark:text-slate-400">
            A clear view of your business records.
          </p>
        </div>
        {page === "Dashboard" && !readOnly && (
          <Button
            className="w-full sm:w-auto"
            onClick={() => setPage("Invoices")}
          >
            Create invoice
          </Button>
        )}
      </header>

      {page === "Customers" ? (
        <CustomersPage readOnly={readOnly} />
      ) : page === "Invoices" ? (
        <InvoicesPage
          readOnly={readOnly}
          currency={workspace?.business?.currency ?? "INR"}
          gstRegistered={Boolean(workspace?.business?.tax?.gstRegistered)}
        />
      ) : page === "Expenses" ? (
        <ExpensesPage
          readOnly={readOnly}
          currency={workspace?.business?.currency ?? "INR"}
        />
      ) : page === "Reminders" ? (
        <RemindersPage readOnly={readOnly} />
      ) : page === "Reports" && entitlements.reports ? (
        <ReportsPage
          cashflowEnabled={entitlements.cashflow}
          exportEnabled={entitlements.fullExport}
        />
      ) : page === "Business settings" ? (
        <BusinessSettingsPage readOnly={readOnly} />
      ) : page === "Billing" && isOwner ? (
        <BillingPage />
      ) : page === "Dashboard" ? (
        <DashboardPage
          currency={workspace?.business?.currency ?? "INR"}
          readOnly={readOnly}
          loading={loading}
          canAddSampleData={isOwner}
          onOpenCustomers={() => setPage("Customers")}
          onOpenInvoices={() => setPage("Invoices")}
        />
      ) : page === "Tax settings" ? (
        <ProvisionalBanner signedOff={policySignedOff}>
          <TaxRatesPage readOnly={readOnly || !isOwner} />
          <p className="mt-2 text-sm leading-6 text-muted dark:text-slate-300">
            GST rates and HSN/SAC settings are configurable starting points.
            Confirm them with your accountant.
          </p>
          <p className="mt-3 text-xs leading-5 text-muted dark:text-slate-400">
            {disclaimer}
          </p>
        </ProvisionalBanner>
      ) : (
        <EmptyState
          icon={page === "Customers" ? UsersRound : FileText}
          title={
            page === "Customers"
              ? "No customers yet"
              : `No ${page.toLowerCase()} to show`
          }
          description={
            page === "Customers"
              ? "Customers you add will appear here, ready to use on your invoices."
              : "Records will appear here as you add them to your business."
          }
        />
      )}
    </AppLayout>
  );
}
