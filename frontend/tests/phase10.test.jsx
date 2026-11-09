import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../src/lib/apiClient.js";
import { CustomersPage } from "../src/features/customers/CustomersPage.jsx";
import { ReportsPage } from "../src/features/reports/ReportsPage.jsx";
import { RecurringExpenses } from "../src/features/expenses/RecurringExpenses.jsx";

vi.mock("../src/lib/apiClient.js", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.get.mockResolvedValue({
    data: { customers: [], months: [], recurringExpenses: [] },
  });
  apiClient.post.mockResolvedValue({ data: { customers: [] } });
  apiClient.patch.mockResolvedValue({ data: {} });
  apiClient.delete.mockResolvedValue({ data: {} });
});

describe("Phase 10 selected Tier 2 workflows", () => {
  it("shows cash-flow values using currency-aware minor-unit formatting", async () => {
    apiClient.get.mockImplementation(async (path) =>
      path === "/reports/cashflow"
        ? {
            data: {
              months: [
                {
                  month: "2026-11",
                  currency: "INR",
                  inflowMinor: "12345",
                  outflowMinor: "2500",
                },
              ],
            },
          }
        : { data: {} },
    );
    render(<ReportsPage cashflowEnabled />);
    expect(await screen.findByText("2026-11")).toBeInTheDocument();
    expect(screen.getByText(/123\.45/)).toBeInTheDocument();
    expect(screen.getByText(/25\.00/)).toBeInTheDocument();
  });

  it("shows possible customer duplicates and keeps Add anyway non-blocking", async () => {
    apiClient.post.mockImplementation(async (path) =>
      path === "/customers/check-duplicates"
        ? {
            data: {
              duplicates: [
                { name: "Existing Co", matches: ["email", "phone"] },
              ],
            },
          }
        : { data: { customer: {} } },
    );
    render(<CustomersPage />);
    fireEvent.change(screen.getByLabelText("Customer name"), {
      target: { value: "Existing Co" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "same@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "+91 98765 43210" },
    });
    fireEvent.change(screen.getByLabelText("Street address"), {
      target: { value: "1 Main Road" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "Mumbai" },
    });
    fireEvent.change(screen.getByLabelText("Two-digit state code"), {
      target: { value: "27" },
    });
    fireEvent.change(screen.getByLabelText("Postal code"), {
      target: { value: "400001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
    expect(await screen.findByText(/may already exist/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add anyway" }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/customers",
        expect.objectContaining({ name: "Existing Co" }),
      ),
    );
  });

  it("converts recurring expense amounts with the shared currency parser", async () => {
    render(
      <RecurringExpenses
        categories={[{ id: "507f1f77bcf86cd799439011", name: "Office" }]}
        currency="INR"
      />,
    );
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "507f1f77bcf86cd799439011" },
    });
    fireEvent.change(screen.getByLabelText("Vendor"), {
      target: { value: "Internet provider" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Monthly internet" },
    });
    fireEvent.change(screen.getByLabelText("Amount (INR)"), {
      target: { value: "125.50" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create recurring rule" }),
    );
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/recurring-expenses",
        expect.objectContaining({ amountMinor: 12550, frequency: "monthly" }),
      ),
    );
  });
});
