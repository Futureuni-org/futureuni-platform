import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/lib/result";

import { reclassifyReplyAction } from "./actions";
import { ReclassifyControl } from "./reclassify-control";

const refresh = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({ reclassifyReplyAction: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(reclassifyReplyAction).mockResolvedValue(ok({ ok: true }));
});

async function choose(option: string) {
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Reply class" }), option);
  return screen.findByRole("dialog");
}

describe("ReclassifyControl", () => {
  it("shows what unsubscribing does and changes nothing until it is confirmed", async () => {
    render(<ReclassifyControl replyId="creply1234567" current="INTERESTED" />);
    const dialog = await choose("UNSUBSCRIBE");

    expect(dialog).toHaveTextContent("Reclassify as unsubscribe?");
    expect(dialog).toHaveTextContent(
      "This will suppress this contact and stop all outreach to the company",
    );
    expect(reclassifyReplyAction).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Suppress and reclassify" }));
    await waitFor(() => {
      expect(reclassifyReplyAction).toHaveBeenCalledWith("creply1234567", "UNSUBSCRIBE", null);
    });
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("does not reclassify when the confirmation is cancelled", async () => {
    render(<ReclassifyControl replyId="creply1234567" current="INTERESTED" />);
    const dialog = await choose("UNSUBSCRIBE");

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(reclassifyReplyAction).not.toHaveBeenCalled();
    // The reply keeps the class it had.
    expect(screen.getByRole("combobox", { name: "Reply class" })).toHaveValue("INTERESTED");
  });

  it("explains that moving away from unsubscribe leaves the suppression in place", async () => {
    render(<ReclassifyControl replyId="creply1234567" current="UNSUBSCRIBE" />);
    const dialog = await choose("QUESTION");

    expect(dialog).toHaveTextContent("The suppression stays in place");
    expect(dialog).toHaveTextContent("until an admin removes the suppression");
    expect(within(dialog).getByRole("button", { name: "Reclassify" })).toBeInTheDocument();
  });
});
