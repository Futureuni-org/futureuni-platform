import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConditionBuilder } from "./condition-builder";
import type { Condition } from "@/contracts/service-line-profile";

function signalCondition(): Condition {
  return { all: [{ kind: "signal", signalId: "no_website", negate: false }] };
}

describe("ConditionBuilder", () => {
  it("adds an atom (AND) up to the cap", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ConditionBuilder condition={signalCondition()} signalIds={["no_website", "outdated"]} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /add condition/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Condition;
    expect(next.all).toHaveLength(2);
  });

  it("switches an atom to a field comparison", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ConditionBuilder condition={signalCondition()} signalIds={["no_website"]} onChange={onChange} />,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: /condition type/i }), "field");
    const next = onChange.mock.calls.at(-1)?.[0] as Condition;
    expect(next.all[0]?.kind).toBe("field");
  });

  it("is read-only when disabled", () => {
    render(
      <ConditionBuilder condition={signalCondition()} signalIds={["no_website"]} onChange={vi.fn()} disabled />,
    );
    expect(screen.queryByRole("button", { name: /add condition/i })).not.toBeInTheDocument();
  });
});
