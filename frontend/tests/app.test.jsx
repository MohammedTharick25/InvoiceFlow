import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../src/app/App.jsx";

vi.mock("../src/lib/apiClient.js", () => ({
  apiClient: {
    get: vi.fn((path) => {
      if (path === "/reports/dashboard")
        return Promise.resolve({
          data: {
            issuedThisMonth: 2,
            outstandingCount: 1,
            outstandingMinor: "7500",
            overdueCount: 1,
            overdueMinor: "7500",
            activeCustomers: 1,
            recentInvoices: [],
          },
        });
      if (path === "/notifications")
        return Promise.resolve({ data: { notifications: [], unread: 0 } });
      return Promise.resolve({
        data: { status: { healthy: true, dueUnprocessed: 0, failed: 0 } },
      });
    }),
  },
}));

describe("app shell", () => {
  it("renders the dashboard and provisional tax policy notice", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tax settings" }));
    expect(
      screen.getByText("Calculation policy provisional"),
    ).toBeInTheDocument();
  });

  it("shows dashboard totals returned by the API", async () => {
    render(<App />);
    const overview = await screen.findByRole("region", {
      name: "Business overview",
    });
    expect(within(overview).getByText("2")).toBeInTheDocument();
    expect(within(overview).getAllByText("₹75.00")).toHaveLength(2);
    expect(
      within(overview).getByText("1 overdue invoices"),
    ).toBeInTheDocument();
  });

  it("shows phase features before billing and then follows server entitlements", () => {
    const { rerender } = render(<App />);
    expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reminders" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Expenses" }),
    ).not.toBeInTheDocument();
    rerender(<App entitlements={{ expenses: true, reports: true }} />);
    expect(
      screen.getByRole("button", { name: "Expenses" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Team" }),
    ).not.toBeInTheDocument();
  });

  it("shows subscription notices from supplied server state only", () => {
    const { rerender } = render(<App />);
    expect(screen.queryByLabelText("Trial status")).not.toBeInTheDocument();
    rerender(
      <App
        subscription={{
          status: "trialing",
          trialEndsAt: "2027-01-01T00:00:00.000Z",
        }}
      />,
    );
    expect(
      screen.getByText("Your 14-day King trial is active"),
    ).toBeInTheDocument();
  });

  it("hides invoice creation and explains read-only access", () => {
    render(<App readOnly />);
    expect(screen.getByLabelText("Read-only account")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create invoice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a customer" }),
    ).not.toBeInTheDocument();
  });

  it("shows loading skeletons with a busy status", () => {
    render(<App loading />);
    expect(
      screen.getByRole("region", { name: "Loading business overview" }),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("hides the provisional banner after policy sign-off", () => {
    render(<App policySignedOff />);
    fireEvent.click(screen.getByRole("button", { name: "Tax settings" }));
    expect(
      screen.queryByText("Calculation policy provisional"),
    ).not.toBeInTheDocument();
  });

  it("persists the theme choice", () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("invoiceflow-theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument();
  });
});
