import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { describe, expect, it } from "vitest";

function SampleForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(z.object({ name: z.string().min(2) })) });
  return (
    <form onSubmit={handleSubmit(() => {})}>
      <label>
        Name
        <input {...register("name")} />
      </label>
      {errors.name && <p role="alert">{errors.name.message}</p>}
      <button type="submit">Save</button>
    </form>
  );
}

describe("Zod 4 resolver smoke", () => {
  it("validates a form field", async () => {
    render(<SampleForm />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "expected string to have >=2 characters",
      ),
    );
  });
});
