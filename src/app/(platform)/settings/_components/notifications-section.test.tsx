import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationsSection, type NotificationTypeRow } from "./notifications-section";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const updateMock = vi.fn(() => Promise.resolve({ ok: true as const, data: { ok: true as const } }));
vi.mock("../actions", () => ({
  updateNotificationPreferencesAction: (updates: unknown) => updateMock(updates),
}));

afterEach(() => {
  updateMock.mockClear();
});

const TYPES: NotificationTypeRow[] = [
  { id: "reply.interested", label: "Interested reply", description: "x", category: "product", critical: true },
  { id: "deal.lost", label: "Deal lost", description: "y", category: "product", critical: false },
];
const PREFS = {
  "reply.interested": { IN_APP: true, EMAIL: true, critical: true },
  "deal.lost": { IN_APP: true, EMAIL: false, critical: false },
};

function renderMatrix() {
  render(
    <TooltipProvider>
      <NotificationsSection types={TYPES} initialPrefs={PREFS} />
    </TooltipProvider>,
  );
}

describe("NotificationsSection", () => {
  it("locks critical types (no toggles) and shows the real labels", () => {
    renderMatrix();
    expect(screen.getByText("Interested reply")).toBeInTheDocument();
    // Critical type exposes no toggle checkbox for either channel.
    expect(screen.queryByLabelText(/In-app for Interested reply/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Email for Interested reply/i)).not.toBeInTheDocument();
  });

  it("renders toggles for non-critical types and saves on change", async () => {
    const user = userEvent.setup();
    renderMatrix();
    const emailToggle = screen.getByLabelText(/Email for Deal lost/i);
    expect(emailToggle).not.toBeChecked();
    await user.click(emailToggle);
    expect(updateMock).toHaveBeenCalledWith([{ type: "deal.lost", channel: "EMAIL", enabled: true }]);
  });
});
