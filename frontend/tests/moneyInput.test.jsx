import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MoneyInput } from "../src/components/ui/MoneyInput.jsx";

describe("MoneyInput", () => {
  it("parses major currency units into integer minor units", () => {
    const onMinorChange = vi.fn();
    render(<MoneyInput aria-label="Amount" onMinorChange={onMinorChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Amount" }), {
      target: { value: "10.01" },
    });
    expect(onMinorChange).toHaveBeenLastCalledWith(1001);
  });

  it("returns null for an invalid amount instead of using float arithmetic", () => {
    const onMinorChange = vi.fn();
    render(<MoneyInput aria-label="Amount" onMinorChange={onMinorChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Amount" }), {
      target: { value: "10.001" },
    });
    expect(onMinorChange).toHaveBeenLastCalledWith(null);
  });
});
