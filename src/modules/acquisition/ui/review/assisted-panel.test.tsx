import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  prepareWhatsAppAction: vi.fn(() => Promise.resolve({ ok: true, data: { url: "https://wa.me/2348031234567?text=hi", text: "hi" } })),
  prepareLinkedInAction: vi.fn(() => Promise.resolve({ ok: true, data: { text: "", companyPageUrl: "" } })),
  createCallTaskAction: vi.fn(() => Promise.resolve({ ok: true, data: { phone: "", talkingPoints: [] } })),
  markAssistedSentAction: vi.fn(() => Promise.resolve({ ok: true, data: null })),
}));

import { AssistedPanel } from "./assisted-panel";
import { markAssistedSentAction, prepareWhatsAppAction } from "./actions";

describe("AssistedPanel WhatsApp flow", () => {
  const openMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockClear();
    vi.stubGlobal("open", openMock);
  });

  it("prepares the link, then confirms the send", async () => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    render(
      <AssistedPanel
        slug="web-development"
        channel="WHATSAPP_ASSISTED"
        messageId="m1"
        whatsappConfidence="CONFIRMED"
        canSendAssisted
        onSent={onSent}
      />,
    );

    expect(screen.getByText(/confirmed/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /send on whatsapp/i }));
    expect(prepareWhatsAppAction).toHaveBeenCalledWith("web-development", "m1");
    expect(openMock).toHaveBeenCalledWith("https://wa.me/2348031234567?text=hi", "_blank", "noopener,noreferrer");

    await user.click(screen.getByRole("button", { name: /mark as sent/i }));
    expect(markAssistedSentAction).toHaveBeenCalled();
    expect(onSent).toHaveBeenCalled();
  });

  it("hides sending when the user lacks permission", () => {
    render(
      <AssistedPanel
        slug="web-development"
        channel="WHATSAPP_ASSISTED"
        messageId="m1"
        whatsappConfidence={null}
        canSendAssisted={false}
        onSent={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /send on whatsapp/i })).not.toBeInTheDocument();
  });
});
