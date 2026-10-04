import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

const ok = { ok: true as const, data: null };

vi.mock("./actions", () => ({
  getReviewContextAction: vi.fn(() => Promise.resolve(ok)),
  approveAction: vi.fn(() => Promise.resolve(ok)),
  editAction: vi.fn(() => Promise.resolve(ok)),
  rejectAction: vi.fn(() => Promise.resolve(ok)),
  regenerateAction: vi.fn(() => Promise.resolve({ ok: true, data: { messageId: "m2" } })),
  snoozeAction: vi.fn(() => Promise.resolve(ok)),
  prepareWhatsAppAction: vi.fn(() => Promise.resolve({ ok: true, data: { url: "https://wa.me/1", text: "x" } })),
  prepareLinkedInAction: vi.fn(() => Promise.resolve({ ok: true, data: { text: "x", companyPageUrl: "x" } })),
  createCallTaskAction: vi.fn(() => Promise.resolve({ ok: true, data: { phone: "x", talkingPoints: [] } })),
  markAssistedSentAction: vi.fn(() => Promise.resolve(ok)),
  acceptReviewAction: vi.fn(() => Promise.resolve(ok)),
  overrideReviewAction: vi.fn(() => Promise.resolve(ok)),
}));

import { ReviewCard } from "./review-card";
import { editAction } from "./actions";
import type { ReviewDraft, ReviewPermissions } from "./view";

function draft(): ReviewDraft {
  return {
    messageId: "m1",
    leadId: "l1",
    companyId: "c1",
    contactId: "ct1",
    channel: "EMAIL",
    stepIndex: 0,
    isFirstTouch: true,
    subject: "Quick note on your site",
    body: "Your homepage is slow.",
    citedFindingIds: [],
    status: "DRAFT",
    humanEdited: false,
    companyName: "Acme",
    companyCountry: "Nigeria",
    companyCity: "Lagos",
    contactName: "Ada",
    contactRole: "Owner",
    market: "NIGERIA",
    serviceLine: "WEB_DEVELOPMENT",
    score: 72,
    scoreBand: "QUALIFIED",
    brief: "A fast-growing restaurant with a slow site.",
    needsHumanReview: false,
    complianceReview: false,
    heldByCrossSell: false,
  };
}

const permissions: ReviewPermissions = {
  canApprove: true,
  canReject: true,
  canDraft: true,
  canSendAssisted: true,
  canDecideReview: true,
};

function renderCard(): { onApprove: ReturnType<typeof vi.fn> } {
  const onApprove = vi.fn();
  render(
    <TooltipProvider>
      <ReviewCard
        slug="web-development"
        draft={draft()}
        context={null}
        contextLoading={false}
        permissions={permissions}
        position={{ index: 0, total: 1 }}
        timezone="Africa/Lagos"
        onApprove={onApprove}
        onRemoved={vi.fn()}
        onRegenerated={vi.fn()}
        onContextChanged={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        onOpenLead={vi.fn()}
      />
    </TooltipProvider>,
  );
  return { onApprove };
}

describe("ReviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toggles edit mode with the E shortcut", async () => {
    const user = userEvent.setup();
    renderCard();
    expect(screen.queryByRole("textbox", { name: /message body/i })).not.toBeInTheDocument();
    await user.keyboard("e");
    expect(screen.getByRole("textbox", { name: /message body/i })).toBeInTheDocument();
  });

  it("disables Approve until the truth confirmation is ticked after an edit", async () => {
    const user = userEvent.setup();
    const { onApprove } = renderCard();

    await user.keyboard("e");
    const body = screen.getByRole("textbox", { name: /message body/i });
    await user.type(body, " It loads in 7s.");

    const confirm = screen.getByLabelText(/i confirm every statement/i);
    expect(confirm).not.toBeChecked();

    const approve = screen.getByRole("button", { name: /approve/i });
    expect(approve).toBeDisabled();

    await user.click(confirm);
    expect(approve).toBeEnabled();

    await user.click(approve);
    await waitFor(() => {
      expect(editAction).toHaveBeenCalledTimes(1);
      expect(onApprove).toHaveBeenCalledWith(true);
    });
  });
});
