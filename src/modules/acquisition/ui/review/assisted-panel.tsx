"use client";

import { Copy, ExternalLink, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui";
import { Select } from "@/components/admin";

import {
  createCallTaskAction,
  markAssistedSentAction,
  prepareLinkedInAction,
  prepareWhatsAppAction,
} from "./actions";

/**
 * Assisted-channel flows. Nothing is ever sent by an API (INV-7): FUTUREUNI prepares the message
 * and a human sends it, then confirms. WhatsApp opens a wa.me link; LinkedIn offers copy + open;
 * a call shows talking points and an outcome.
 */

type CallOutcome = "CONNECTED" | "NO_ANSWER" | "VOICEMAIL" | "WRONG_NUMBER" | "CALLBACK_REQUESTED";

export function AssistedPanel({
  slug,
  channel,
  messageId,
  whatsappConfidence,
  canSendAssisted,
  onSent,
}: {
  slug: string;
  channel: string;
  messageId: string;
  whatsappConfidence: "CONFIRMED" | "LIKELY" | null;
  canSendAssisted: boolean;
  onSent: () => void;
}): React.ReactElement | null {
  const [prepared, setPrepared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkedin, setLinkedin] = useState<{ text: string; companyPageUrl: string } | null>(null);
  const [call, setCall] = useState<{ phone: string; talkingPoints: string[] } | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome>("CONNECTED");

  if (!canSendAssisted) {
    return <p className="text-sm text-muted">You don&apos;t have permission to send on this channel.</p>;
  }

  async function markSent(callOutcome?: CallOutcome): Promise<void> {
    setBusy(true);
    const res = await markAssistedSentAction(slug, messageId, callOutcome === undefined ? {} : { callOutcome });
    setBusy(false);
    if (res.ok) {
      toast.success("Marked as sent");
      onSent();
    } else {
      toast.error(res.error.message);
    }
  }

  async function startWhatsApp(): Promise<void> {
    setBusy(true);
    const res = await prepareWhatsAppAction(slug, messageId);
    setBusy(false);
    if (res.ok) {
      window.open(res.data.url, "_blank", "noopener,noreferrer");
      setPrepared(true);
    } else {
      toast.error(res.error.message);
    }
  }

  async function startLinkedIn(): Promise<void> {
    setBusy(true);
    const res = await prepareLinkedInAction(slug, messageId);
    setBusy(false);
    if (res.ok) setLinkedin(res.data);
    else toast.error(res.error.message);
  }

  async function startCall(): Promise<void> {
    setBusy(true);
    const res = await createCallTaskAction(slug, messageId);
    setBusy(false);
    if (res.ok) setCall(res.data);
    else toast.error(res.error.message);
  }

  if (channel === "WHATSAPP_ASSISTED") {
    return (
      <div className="flex flex-col gap-3">
        {whatsappConfidence !== null ? (
          <p className="text-xs text-muted">
            WhatsApp number is{" "}
            <span className="font-medium text-foreground">
              {whatsappConfidence === "CONFIRMED" ? "confirmed" : "likely"}
            </span>
            .
          </p>
        ) : null}
        {!prepared ? (
          <Button onClick={() => void startWhatsApp()} disabled={busy}>
            <MessageCircle className="size-4" aria-hidden />
            Send on WhatsApp
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">Did you send it?</p>
            <div className="flex gap-2">
              <Button onClick={() => void markSent()} disabled={busy}>Mark as sent</Button>
              <Button variant="ghost" onClick={() => { setPrepared(false); }} disabled={busy}>Not sent</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (channel === "LINKEDIN_ASSISTED") {
    return (
      <div className="flex flex-col gap-3">
        {linkedin === null ? (
          <Button onClick={() => void startLinkedIn()} disabled={busy}>
            Prepare LinkedIn note
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="whitespace-pre-wrap rounded-md bg-zone p-3 text-sm text-foreground">{linkedin.text}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(linkedin.text);
                  toast.success("Copied");
                }}
              >
                <Copy className="size-4" aria-hidden />
                Copy message
              </Button>
              <a
                href={linkedin.companyPageUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm font-semibold text-foreground hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="size-4" aria-hidden />
                Open company page
              </a>
              <Button size="sm" onClick={() => void markSent()} disabled={busy}>Mark as sent</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (channel === "CALL_TASK") {
    return (
      <div className="flex flex-col gap-3">
        {call === null ? (
          <Button onClick={() => void startCall()} disabled={busy}>
            <Phone className="size-4" aria-hidden />
            Prepare call task
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="font-mono text-sm text-foreground">{call.phone}</p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground">
              {call.talkingPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                options={[
                  { value: "CONNECTED", label: "Connected" },
                  { value: "NO_ANSWER", label: "No answer" },
                  { value: "VOICEMAIL", label: "Voicemail" },
                  { value: "WRONG_NUMBER", label: "Wrong number" },
                  { value: "CALLBACK_REQUESTED", label: "Callback requested" },
                ]}
                value={outcome}
                onChange={(e) => { setOutcome(e.target.value as CallOutcome); }}
              />
              <Button size="sm" onClick={() => void markSent(outcome)} disabled={busy}>Log outcome</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
