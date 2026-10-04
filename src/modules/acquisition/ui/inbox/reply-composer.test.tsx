import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/lib/result";

import type { SendResult } from "../leads/send-outcome";
import { sendReplyAction } from "./actions";
import type { ComposerDraft } from "./inbox-types";
import { ReplyComposer } from "./reply-composer";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ regenerateDraftAction: vi.fn(), sendReplyAction: vi.fn() }));
vi.mock("../pipeline/actions", () => ({ boardBookingLinkAction: vi.fn() }));

type Props = Parameters<typeof ReplyComposer>[0];

const DRAFT: ComposerDraft = {
  id: "cdraft1234567",
  subject: "Re: your website",
  body: "Thanks for getting back to us. Here is a time to talk.",
  needsPricingApproval: false,
  citations: [{ id: "f1", claim: "Largest Contentful Paint is 7.2s on mobile" }],
};

const NEWER_DRAFT: ComposerDraft = {
  id: "cdraft7654321",
  subject: "Re: your website",
  body: "A shorter answer, with the price range you asked about.",
  needsPricingApproval: false,
  citations: [],
};

const BASE: Props = {
  replyId: "creply1234567",
  leadId: "clead12345678",
  channel: "EMAIL",
  classification: "INTERESTED",
  draft: DRAFT,
  canBookMeeting: false,
  timezone: "Africa/Lagos",
};

/** Renders the composer; `update` re-renders it with changed props, as a page refresh would. */
function renderComposer(overrides: Partial<Props> = {}) {
  const view = render(<ReplyComposer {...BASE} {...overrides} />);
  return {
    update(next: Partial<Props>) {
      view.rerender(<ReplyComposer {...BASE} {...overrides} {...next} />);
    },
  };
}

function sent(delivery: SendResult["delivery"]): SendResult {
  return { messageId: "cmsg123456789", delivery, scheduledFor: null };
}

const confirmBox = () => screen.getByRole("checkbox", { name: /every claim in it is accurate/i });
const message = () => screen.getByRole("textbox", { name: /message/i });
const sendButton = () => screen.getByRole("button", { name: "Send reply" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendReplyAction).mockResolvedValue(ok(sent("sent")));
});

describe("ReplyComposer", () => {
  it("opens with the suggested response and the findings it relies on", () => {
    renderComposer();
    expect(message()).toHaveValue(DRAFT.body);
    expect(screen.getByRole("textbox", { name: /subject/i })).toHaveValue("Re: your website");
    expect(screen.getByText("Largest Contentful Paint is 7.2s on mobile")).toBeInTheDocument();
  });

  it("won't send until a person confirms the reply", async () => {
    renderComposer();
    expect(sendButton()).toBeDisabled();

    await userEvent.click(sendButton());
    expect(sendReplyAction).not.toHaveBeenCalled();

    await userEvent.click(confirmBox());
    expect(sendButton()).toBeEnabled();
  });

  it("sends the confirmed text with the confirmation recorded", async () => {
    renderComposer();
    await userEvent.click(confirmBox());
    await userEvent.click(sendButton());

    await waitFor(() => {
      expect(sendReplyAction).toHaveBeenCalledWith("creply1234567", {
        body: DRAFT.body,
        humanConfirmedClaims: true,
        subject: "Re: your website",
      });
    });
  });

  it("asks for confirmation again once the text is edited", async () => {
    renderComposer();
    await userEvent.click(confirmBox());
    expect(confirmBox()).toBeChecked();

    await userEvent.type(message(), " One more thing.");
    expect(confirmBox()).not.toBeChecked();
    expect(sendButton()).toBeDisabled();
  });

  it("won't send an empty reply, even when confirmed", async () => {
    renderComposer({ draft: null });
    await userEvent.click(confirmBox());
    expect(sendButton()).toBeDisabled();
  });

  it("empties the composer once the reply has gone out", async () => {
    renderComposer();
    await userEvent.click(confirmBox());
    await userEvent.click(sendButton());

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Reply sent.");
    });
    expect(message()).toHaveValue("");
    expect(confirmBox()).not.toBeChecked();
  });

  it("says a reply was scheduled rather than sent when it couldn't go out yet", async () => {
    vi.mocked(sendReplyAction).mockResolvedValue(ok(sent("scheduled")));
    renderComposer();
    await userEvent.click(confirmBox());
    await userEvent.click(sendButton());

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/scheduled/i));
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps the text and says so when the send was blocked", async () => {
    vi.mocked(sendReplyAction).mockResolvedValue(ok(sent("blocked")));
    renderComposer();
    await userEvent.click(confirmBox());
    await userEvent.click(sendButton());

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/not sent/i));
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(message()).toHaveValue(DRAFT.body);
    expect(confirmBox()).not.toBeChecked();
  });

  it("shows a new suggested response when the person hasn't typed anything", () => {
    const view = renderComposer();
    view.update({ draft: NEWER_DRAFT });
    expect(message()).toHaveValue(NEWER_DRAFT.body);
  });

  it("doesn't carry a confirmation over to a new suggested response", async () => {
    const view = renderComposer();
    await userEvent.click(confirmBox());
    expect(confirmBox()).toBeChecked();

    view.update({ draft: NEWER_DRAFT });
    expect(confirmBox()).not.toBeChecked();
    expect(sendButton()).toBeDisabled();
  });

  it("never overwrites what the person typed: a new suggestion is offered instead", async () => {
    const view = renderComposer();
    await userEvent.type(message(), " One more thing.");
    const typed = `${DRAFT.body} One more thing.`;

    view.update({ draft: NEWER_DRAFT });
    expect(message()).toHaveValue(typed);

    await userEvent.click(screen.getByRole("button", { name: "Use suggested response" }));
    expect(message()).toHaveValue(NEWER_DRAFT.body);
    expect(
      screen.queryByRole("button", { name: "Use suggested response" }),
    ).not.toBeInTheDocument();
  });

  it("flags a response that needs pricing approval", () => {
    renderComposer({ draft: { ...DRAFT, needsPricingApproval: true } });
    expect(screen.getByRole("status")).toHaveTextContent("Needs pricing approval");
  });

  it("offers a WhatsApp reply to copy, within 600 characters", async () => {
    renderComposer({ channel: "WHATSAPP" });
    const copy = screen.getByRole("button", { name: "Copy for WhatsApp" });
    expect(copy).toBeEnabled();
    expect(screen.getByText(/of 600 characters for WhatsApp/)).toBeInTheDocument();

    await userEvent.clear(message());
    await userEvent.click(message());
    await userEvent.paste("x".repeat(601));
    expect(copy).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Shorten it to 600 characters");
  });

  it("only offers to draft a reply for classes that get one", () => {
    renderComposer({ draft: null, classification: "BOUNCE" });
    expect(
      screen.queryByRole("button", { name: /draft a reply|regenerate/i }),
    ).not.toBeInTheDocument();
  });
});
