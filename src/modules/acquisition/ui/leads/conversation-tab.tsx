"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Field, Select } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "@/components/patterns/section";
import { ConversationThread } from "@/modules/acquisition/ui/inbox/conversation-thread";
import type { ThreadView } from "@/modules/acquisition/ui/inbox/thread-types";

import { sendOneOffAction } from "./detail-actions";
import { deliveryNotice } from "./send-outcome";

/**
 * The Conversation tab: the full thread, plus a composer for a one-off email. A person wrote the
 * text, so it can only be sent once they confirm its claims (INV-5); the send button stays disabled
 * until they do, and the server refuses a send without the confirmation.
 */
export function ConversationTab({
  leadId,
  thread,
  contacts,
  canSend,
  timezone,
}: {
  leadId: string;
  thread: ThreadView;
  contacts: { id: string; label: string }[];
  canSend: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = contactId !== "" && subject.trim() !== "" && body.trim() !== "" && confirmed;

  function send() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = await sendOneOffAction({
        leadId,
        contactId,
        subject,
        body,
        humanConfirmedClaims: true,
      });
      if (result.ok) {
        // Says what happened to the email: sent, scheduled for the next sending window, or blocked.
        const notice = deliveryNotice("Email", result.data, timezone);
        if (notice.tone === "success") toast.success(notice.text);
        else if (notice.tone === "error") toast.error(notice.text);
        else toast.info(notice.text);
        setSubject("");
        setBody("");
        setConfirmed(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-12">
      <ConversationThread thread={thread} timezone={timezone} className="max-w-3xl" />

      {canSend && (
        <Section eyebrow="Send a one-off email" className="max-w-3xl">
          {contacts.length === 0 ? (
            <p className="text-muted">
              This lead has no contact with an email address, so there is no one to send to.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <Field label="To" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={contactId}
                    options={contacts.map((c) => ({ value: c.id, label: c.label }))}
                    onChange={(e) => {
                      setContactId(e.target.value);
                    }}
                  />
                )}
              </Field>
              <Field label="Subject" required>
                {({ id }) => (
                  <Input
                    id={id}
                    value={subject}
                    maxLength={200}
                    onChange={(e) => {
                      setSubject(e.target.value);
                    }}
                  />
                )}
              </Field>
              <Field
                label="Message"
                required
                description="The unsubscribe link, your signature and the postal address are added automatically."
              >
                {({ id, describedBy }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    rows={8}
                    maxLength={20000}
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                    }}
                  />
                )}
              </Field>

              <label className="flex min-h-12 items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => {
                    setConfirmed(e.target.checked);
                  }}
                  className="size-5 shrink-0 accent-[var(--primary)]"
                />
                <span>
                  I wrote or checked this message, and every claim in it is accurate and supported.
                </span>
              </label>

              {error !== null && (
                <p role="alert" aria-live="polite" className="text-sm text-danger">
                  {error}
                </p>
              )}

              <div>
                <Button onClick={send} loading={pending} disabled={!ready}>
                  Send email
                </Button>
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
