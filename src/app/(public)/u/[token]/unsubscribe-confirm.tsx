"use client";

/**
 * Confirms the unsubscribe on load by POSTing the one-click endpoint, then offers an optional
 * reason. Client-side only (no session). It never reveals whether the token matched a real contact.
 */

import { useEffect, useState } from "react";

type Phase = "working" | "done" | "error";

export function UnsubscribeConfirm({ token }: { token: string }): React.ReactNode {
  const [phase, setPhase] = useState<Phase>("working");
  const [reason, setReason] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/unsubscribe/${encodeURIComponent(token)}`, { method: "POST" })
      .then((res) => {
        if (!active) return;
        setPhase(res.ok ? "done" : "error");
      })
      .catch(() => {
        if (active) setPhase("error");
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function sendReason(): Promise<void> {
    try {
      await fetch(`/api/unsubscribe/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setFeedbackSent(true);
    } catch {
      setFeedbackSent(true);
    }
  }

  if (phase === "working") {
    return (
      <p className="mt-4 text-foreground" aria-live="polite">
        Processing your request…
      </p>
    );
  }

  if (phase === "error") {
    return (
      <p className="mt-4 text-foreground" aria-live="polite">
        This unsubscribe link is not valid. If you still receive email you did not ask for, reply to the message and
        we will remove you.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-foreground" aria-live="polite">
        You have been unsubscribed. We will not email you again from this campaign.
      </p>

      {feedbackSent ? (
        <p className="mt-6 text-sm text-muted">Thank you for the feedback.</p>
      ) : (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void sendReason();
          }}
        >
          <label htmlFor="reason" className="block text-sm font-medium text-foreground">
            If you would like, tell us why (optional)
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            rows={3}
            maxLength={500}
            className="mt-2 w-full rounded-md border border-input bg-background p-3 text-base text-foreground"
          />
          <button
            type="submit"
            className="mt-3 min-h-12 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
            disabled={reason.trim() === ""}
          >
            Send feedback
          </button>
        </form>
      )}
    </div>
  );
}
