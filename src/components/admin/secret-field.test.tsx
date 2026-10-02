import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SecretField } from "./secret-field";
import { ok } from "@/lib/result";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("SecretField (INV-21)", () => {
  it("shows only the masked hint and never a stored value", () => {
    render(
      <SecretField
        label="SerpAPI key"
        configured
        maskedHint="••••1a2b"
        status="OK"
        onSave={() => Promise.resolve(ok({}))}
      />,
    );
    // The masked hint is visible…
    expect(screen.getByText("••••1a2b")).toBeInTheDocument();
    // …and there is no input (nothing reveals the stored secret) until "Replace" is pressed.
    expect(screen.queryByLabelText(/new value/i)).not.toBeInTheDocument();
  });

  it("reveals an empty password input on Replace — never the existing value", async () => {
    const user = userEvent.setup();
    render(
      <SecretField
        label="SerpAPI key"
        configured
        maskedHint="••••1a2b"
        onSave={() => Promise.resolve(ok({}))}
      />,
    );
    await user.click(screen.getByRole("button", { name: /replace/i }));
    const input = screen.getByLabelText(/new value for SerpAPI key/i);
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
  });

  it("shows 'Not configured' and an Add button when no secret is stored", () => {
    render(<SecretField label="Resend key" configured={false} onSave={() => Promise.resolve(ok({}))} />);
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("hides the replace control when the viewer cannot edit", () => {
    render(
      <SecretField
        label="Resend key"
        configured
        maskedHint="••••9z"
        canEdit={false}
        onSave={() => Promise.resolve(ok({}))}
      />,
    );
    expect(screen.queryByRole("button", { name: /replace/i })).not.toBeInTheDocument();
  });
});
