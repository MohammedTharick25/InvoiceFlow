import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BillingPage } from "../src/features/billing/BillingPage.jsx";

vi.mock("../src/lib/apiClient.js", () => ({
  apiClient: {
    get: vi.fn((path) =>
      Promise.resolve({
        data:
          path === "/billing"
            ? {
                planKey: "king",
                planName: "King",
                status: "trialing",
                trialEndsAt: "2026-11-10T00:00:00.000Z",
                trialDaysLeft: 1,
                cancelAtPeriodEnd: false,
                usage: { finalizedInvoices: 0 },
                limits: { finalizedInvoicesPerMonth: 3000 },
                plans: {
                  basic: {
                    name: "Basic",
                    monthlyMinor: 29900,
                    annualMinor: 299000,
                    finalizedInvoicesPerMonth: 30,
                    activeCustomers: 50,
                    teamMembers: 1,
                  },
                  king: {
                    name: "King",
                    monthlyMinor: 149900,
                    annualMinor: 1499000,
                    finalizedInvoicesPerMonth: 3000,
                    activeCustomers: null,
                    teamMembers: 10,
                  },
                },
              }
            : { invoices: [] },
      }),
    ),
    post: vi.fn(),
  },
}));

describe("billing page", () => {
  it("shows the server plan and keeps paid checkout disabled during the no-card trial", async () => {
    render(<BillingPage />);
    expect(await screen.findByText("Current plan")).toBeInTheDocument();
    expect(screen.getByText(/1 day\(s\) remaining/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Available after trial" }),
    ).toHaveLength(2);
  });
});
