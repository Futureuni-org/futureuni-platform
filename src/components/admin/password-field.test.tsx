import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PasswordField } from "./password-field";

describe("PasswordField", () => {
  it("renders a labelled password input with the policy hint", () => {
    render(<PasswordField label="New password" />);
    const input = screen.getByLabelText("New password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("minlength", "12");
    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
  });

  it("shows a strength meter once typing begins and reports value changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordField label="New password" onChange={onChange} />);
    await user.type(screen.getByLabelText("New password"), "a-very-strong-pass-9");
    expect(screen.getByText(/strength:/i)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalled();
  });
});
