"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Copy, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";

import type { ReplyChannel, ReplyClass } from "@/contracts/common";
import { Field } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { deliveryNotice } from "../leads/send-outcome";
import { boardBookingLinkAction } from "../pipeline/actions";
import { regenerateDraftAction, sendReplyAction } from "./actions";
import { DRAFTABLE_CLASSES, WHATSAPP_LIMIT, type ComposerDraft } from "./inbox-types";

const COUNT = new Intl.NumberFormat("en-GB");

/** What the person has typed, and the suggested response (if any) they started from. */
interface Edit {
  subject: string;
  body: string;
  base: ComposerDraft | null;
}

/** Copies text to the clipboard. False when there is no clipboard here or the browser refused. */
async function writeClipboard(text: string): Promise<boolean> {
  // Not every context has a clipboard: an insecure origin or an embedded webview has none.
  if (!("clipboard" in navigator)) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The reply composer. It shows the suggested response when there is one, and the person can edit
 * it, regenerate it or insert the booking link. Nothing is sent until they tick the confirmation: a
 * reply is only ever sent by a human who has checked it (INV-5), and the server refuses a send
 * without that confirmation. For a WhatsApp thread it offers the text to copy instead, within the
 * 600-character limit, because WhatsApp is never sent automatically (INV-7).
 *
 * The page keys this component by the lead, so it survives the inbox's refreshes. While the person
 * hasn't typed, it simply mirrors the latest suggested response. Once they have, their text is
 * theirs: a newer suggestion (from "Regenerate", or one that arrives with a refresh) is offered
 * beside it and never written over it. The confirmation is tied to the exact text that was ticked,
 * so any change to the text, whoever makes it, has to be confirmed again.
 */
export function ReplyComposer({
  replyId,
  leadId,
  channel,
  classification,
  draft,
  canBookMeeting,
  timezone,
}: {
  replyId: string;
  leadId: string;
  channel: ReplyChannel;
  classification: ReplyClass | null;
  draft: ComposerDraft | null;
  canBookMeeting: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  // A response just generated here, shown until the page's own refresh delivers it (or a newer one).
  const [generated, setGenerated] = useState<{ draft: ComposerDraft; over: string | null } | null>(
    null,
  );
  // The suggestion a sent reply was written from. Sending cancels it, so it isn't shown again.
  const [usedDraftId, setUsedDraftId] = useState<string | null>(null);
  const [confirmedText, setConfirmedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latest =
    generated !== null && (draft?.id ?? null) === generated.over ? generated.draft : draft;
  const suggestion = latest !== null && latest.id !== usedDraftId ? latest : null;
  // The suggested response the text on screen came from: its findings and warnings apply to it.
  const based = edit === null ? suggestion : edit.base;
  const subject = edit === null ? (suggestion?.subject ?? "") : edit.subject;
  const body = edit === null ? (suggestion?.body ?? "") : edit.body;
  // A suggestion newer than the one the person's own text started from.
  const offer = edit !== null && suggestion !== null && suggestion.id !== based?.id;

  const signature = JSON.stringify([subject, body]);
  const confirmed = confirmedText === signature;

  const isWhatsApp = channel === "WHATSAPP";
  const draftable = classification !== null && DRAFTABLE_CLASSES.includes(classification);
  const hasText = body.trim() !== "";
  const tooLongForWhatsApp = body.length > WHATSAPP_LIMIT;
  const canSend = hasText && confirmed && !pending;

  function change(next: { subject?: string; body?: string }) {
    setEdit({ subject: next.subject ?? subject, body: next.body ?? body, base: based });
  }

  function regenerate() {
    setError(null);
    const typed = edit !== null;
    startTransition(async () => {
      const result = await regenerateDraftAction(replyId);
      if (result.ok) {
        setGenerated({ draft: result.data, over: draft?.id ?? null });
        toast.success(
          typed
            ? "A new suggested response is ready. Your text hasn't been changed."
            : "A new suggested response is ready.",
        );
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  function insertBookingLink() {
    setError(null);
    startTransition(async () => {
      const result = await boardBookingLinkAction(leadId);
      if (result.ok) {
        change({
          body: `${body.trimEnd()}${body.trim() === "" ? "" : "\n\n"}${result.data.url}`,
        });
      } else {
        setError(result.error.message);
      }
    });
  }

  async function copyForWhatsApp() {
    setError(null);
    if (await writeClipboard(body)) {
      toast.success("Copied. Paste it into WhatsApp to send.");
      return;
    }
    // No clipboard here: select the text so one keystroke copies it.
    bodyRef.current?.focus();
    bodyRef.current?.select();
    setError(
      "Couldn't copy it for you. The text is selected: copy it with Ctrl+C, or Cmd+C on a Mac.",
    );
  }

  function send() {
    if (!canSend) return;
    setError(null);
    startTransition(async () => {
      const result = await sendReplyAction(replyId, {
        body,
        humanConfirmedClaims: true,
        ...(subject.trim() === "" ? {} : { subject }),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const notice = deliveryNotice("Reply", result.data, timezone);
      if (result.data.delivery === "blocked") {
        // Nothing went out, so the text stays where it is.
        toast.error(notice.text);
        setConfirmedText(null);
      } else {
        if (notice.tone === "success") toast.success(notice.text);
        else toast.info(notice.text);
        // The reply is on its way: start the next one from an empty composer.
        setEdit(null);
        setUsedDraftId(suggestion?.id ?? based?.id ?? null);
        setConfirmedText(null);
      }
      router.refresh();
    });
  }

  return (
    <section aria-label="Reply" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          {based === null ? "Write a reply" : "Suggested response"}
        </h2>
        <div className="flex flex-wrap gap-2">
          {draftable && (
            <Button variant="ghost" loading={pending} onClick={regenerate}>
              <RefreshCw aria-hidden className="size-4" />
              {suggestion === null && based === null ? "Draft a reply" : "Regenerate"}
            </Button>
          )}
          {canBookMeeting && (
            <Button variant="ghost" disabled={pending} onClick={insertBookingLink}>
              <CalendarPlus aria-hidden className="size-4" />
              Insert booking link
            </Button>
          )}
        </div>
      </div>

      {offer && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-info-soft px-3 py-2 text-sm text-info"
        >
          <span className="flex min-w-0 items-start gap-2">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>A new suggested response is ready. Your text hasn&apos;t been changed.</span>
          </span>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setEdit(null);
            }}
          >
            Use suggested response
          </Button>
        </div>
      )}

      {based?.needsPricingApproval === true && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Needs pricing approval.</span> This response discusses a
            price outside the line&apos;s ranges. Check it with a manager before sending.
          </span>
        </p>
      )}

      {!isWhatsApp && (
        <Field label="Subject" description="Leave it empty to reply under the original subject.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={subject}
              maxLength={200}
              readOnly={pending}
              onChange={(e) => {
                change({ subject: e.target.value });
              }}
            />
          )}
        </Field>
      )}

      <Field
        label="Message"
        required
        description={
          isWhatsApp
            ? `${COUNT.format(body.length)} of ${COUNT.format(WHATSAPP_LIMIT)} characters for WhatsApp.`
            : "The unsubscribe link, your signature and the postal address are added automatically."
        }
        error={
          isWhatsApp && tooLongForWhatsApp
            ? `Shorten it to ${COUNT.format(WHATSAPP_LIMIT)} characters to send it on WhatsApp.`
            : null
        }
      >
        {({ id, describedBy }) => (
          <Textarea
            ref={bodyRef}
            id={id}
            aria-describedby={describedBy}
            rows={9}
            value={body}
            // Locked while a request is in flight, so what is sent is exactly what was confirmed.
            readOnly={pending}
            onChange={(e) => {
              change({ body: e.target.value });
            }}
          />
        )}
      </Field>

      {based !== null && based.citations.length > 0 && (
        <details className="text-sm">
          <summary className="w-fit cursor-pointer rounded py-3.5 text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Findings this response relies on ({String(based.citations.length)})
          </summary>
          <ul className="flex list-disc flex-col gap-1 pl-5 break-words text-foreground">
            {based.citations.map((citation) => (
              <li key={citation.id}>{citation.claim}</li>
            ))}
          </ul>
        </details>
      )}

      <label className="flex min-h-12 items-center gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            // The tick belongs to this exact text. Any later change to it clears the tick.
            setConfirmedText(e.target.checked ? signature : null);
          }}
          className="size-5 shrink-0 accent-[var(--primary)]"
        />
        <span>I have read this reply, and every claim in it is accurate and supported.</span>
      </label>

      {error !== null && (
        <p role="alert" aria-live="polite" className="text-sm break-words text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {isWhatsApp && (
          <Button
            variant="secondary"
            disabled={!hasText || tooLongForWhatsApp}
            onClick={() => {
              void copyForWhatsApp();
            }}
          >
            <Copy aria-hidden className="size-4" />
            Copy for WhatsApp
          </Button>
        )}
        <Button onClick={send} loading={pending} disabled={!canSend}>
          {isWhatsApp ? "Send as email" : "Send reply"}
        </Button>
      </div>
    </section>
  );
}
