import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../src/components/ui/Button.jsx";
import { Modal } from "../src/components/ui/Modal.jsx";

describe("Radix and Tailwind smoke", () => {
  it("opens a wrapped Radix dialog with Tailwind utility classes", () => {
    render(
      <Modal title="Dialog smoke" trigger={<Button>Open dialog</Button>}>
        <p>Dialog content</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog")).toHaveClass("rounded-2xl");
    expect(screen.getByText("Dialog content")).toBeInTheDocument();
  });
});
