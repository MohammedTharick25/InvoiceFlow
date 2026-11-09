import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));
vi.mock("../src/lib/apiClient.js", () => ({ apiClient: mocks }));

import { RemindersPage } from "../src/features/reminders/RemindersPage.jsx";

const reminderSettings = {
  enabled: true,
  sendTimeLocal: "09:00",
  schedule: [
    { key: "before_due_3", offsetDays: 3, when: "before_due" },
    { key: "on_due", offsetDays: 0, when: "on_due" },
    { key: "after_due_3", offsetDays: 3, when: "after_due" },
  ],
};

describe("reminder settings page", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.patch.mockReset();
    mocks.post.mockReset();
    mocks.get.mockImplementation((path) =>
      Promise.resolve(
        path.includes("/settings/")
          ? { data: { reminders: reminderSettings } }
          : {
              data: {
                status: {
                  healthy: true,
                  dueUnprocessed: 0,
                  failed: 0,
                  cancelled: 0,
                },
              },
            },
      ),
    );
  });

  it("confirms the exact pending count before permanently disabling reminders", async () => {
    mocks.patch
      .mockRejectedValueOnce({
        response: {
          data: {
            error: {
              code: "REMINDERS_DISABLE_CONFIRMATION_REQUIRED",
              details: { pendingCount: 3 },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: { reminders: { ...reminderSettings, enabled: false } },
      });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RemindersPage />);
    const control = await screen.findByRole("switch", {
      name: "Send reminders",
    });
    fireEvent.click(control);
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(2));
    expect(window.confirm).toHaveBeenCalledWith(
      "3 scheduled reminders will be cancelled. Turning reminders back on will not restore them.",
    );
    expect(mocks.patch).toHaveBeenLastCalledWith("/settings/reminders", {
      enabled: false,
      confirmCancelPending: 3,
    });
  });
});
