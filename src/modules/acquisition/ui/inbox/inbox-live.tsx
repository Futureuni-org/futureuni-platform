"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markThreadReadAction } from "./actions";
import { overlayOpen } from "./overlay";

const REFRESH_MS = 30_000;

/**
 * Keeps the inbox current without a manual reload. It renders nothing.
 * - Every 30 seconds it asks the server for fresh threads. A refresh re-renders the server parts of
 *   the page only: focus stays where it is, and the composer (keyed by the lead, with its text in
 *   client state) keeps what the person is typing. It is skipped while the tab is hidden, so a
 *   background tab makes no requests, and while a dialog or sheet is open, so the data a half-filled
 *   dialog is about can't change underneath it.
 * - When a thread with unread replies is open, it marks them read and refreshes the list.
 */
export function InboxLive({
  openLeadId,
  openUnread,
}: {
  openLeadId: string | null;
  openUnread: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && !overlayOpen()) router.refresh();
    }, REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [router]);

  useEffect(() => {
    if (openLeadId === null || openUnread === 0) return;
    let cancelled = false;
    void markThreadReadAction(openLeadId).then((result) => {
      if (!cancelled && result.ok) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [openLeadId, openUnread, router]);

  return null;
}
