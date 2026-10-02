import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettingField, type SettingFieldDescriptor } from "./setting-field";
import { ok } from "@/lib/result";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderField(
  descriptor: SettingFieldDescriptor,
  overrides: Partial<Parameters<typeof SettingField>[0]> = {},
) {
  const onSave = vi.fn(() => Promise.resolve(ok({})));
  render(
    <SettingField
      settingKey="platform.test"
      label="Test setting"
      descriptor={descriptor}
      value={overrides.value ?? ""}
      defaultValue={overrides.defaultValue ?? ""}
      isDefault={overrides.isDefault ?? true}
      canEdit={overrides.canEdit ?? true}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onSave };
}

describe("SettingField control per schema type", () => {
  it("renders a text input for a string setting", () => {
    renderField({ kind: "string" }, { value: "hello" });
    expect(screen.getByRole("textbox")).toHaveValue("hello");
  });

  it("renders a number input for a number setting", () => {
    renderField({ kind: "number", min: 1, max: 10 }, { value: 7 });
    expect(screen.getByRole("spinbutton")).toHaveValue(7);
  });

  it("renders a checkbox for a boolean setting", () => {
    renderField({ kind: "boolean" }, { value: true });
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("renders a select for an enum setting", () => {
    renderField(
      { kind: "enum", options: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }] },
      { value: "dark" },
    );
    expect(screen.getByRole("combobox")).toHaveValue("dark");
  });

  it("renders a textarea for a string array setting", () => {
    renderField({ kind: "stringArray" }, { value: ["a.com", "b.com"] });
    expect(screen.getByRole("textbox")).toHaveValue("a.com\nb.com");
  });

  it("renders a url input for a url setting", () => {
    renderField({ kind: "url" }, { value: "https://x.test" });
    expect(screen.getByRole("textbox")).toHaveValue("https://x.test");
  });
});

describe("SettingField editing", () => {
  it("shows reset-to-default only when the value is not the default", () => {
    const { rerender } = renderFieldWithRerender({ kind: "string" }, { value: "x", isDefault: false });
    expect(screen.getByRole("button", { name: /reset to default/i })).toBeInTheDocument();
    rerender({ kind: "string" }, { value: "", isDefault: true });
    expect(screen.queryByRole("button", { name: /reset to default/i })).not.toBeInTheDocument();
  });

  it("saves the parsed value through the action", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve(ok({})));
    render(
      <SettingField
        settingKey="platform.companyName"
        label="Company name"
        descriptor={{ kind: "string" }}
        value="FUTUREUNI"
        defaultValue="FUTUREUNI"
        isDefault
        canEdit
        onSave={onSave}
      />,
    );
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "FUTUREUNI Ltd");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith("platform.companyName", "FUTUREUNI Ltd");
  });

  it("disables controls and hides Save when the viewer cannot edit", () => {
    renderField({ kind: "string" }, { value: "x", canEdit: false });
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });
});

function renderFieldWithRerender(
  descriptor: SettingFieldDescriptor,
  overrides: Partial<Parameters<typeof SettingField>[0]>,
) {
  const props = {
    settingKey: "platform.test",
    label: "Test setting",
    descriptor,
    value: overrides.value ?? "",
    defaultValue: overrides.defaultValue ?? "",
    isDefault: overrides.isDefault ?? true,
    canEdit: overrides.canEdit ?? true,
    onSave: vi.fn(() => Promise.resolve(ok({}))),
  };
  const utils = render(<SettingField {...props} />);
  return {
    rerender: (
      d: SettingFieldDescriptor,
      o: Partial<Parameters<typeof SettingField>[0]>,
    ) => {
      utils.rerender(
        <SettingField
          {...props}
          descriptor={d}
          value={o.value ?? ""}
          isDefault={o.isDefault ?? true}
        />,
      );
    },
  };
}
