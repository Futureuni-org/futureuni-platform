/**
 * `/u/[token]` — the public unsubscribe page (Phase 12, R-A15). It confirms the unsubscribe
 * immediately on load (the client component POSTs the one-click endpoint), shows FUTUREUNI's name,
 * and offers an optional reason. No session, no tracking; WCAG AA and works at 375px.
 */

import type { ReactNode } from "react";

import { UnsubscribeConfirm } from "./unsubscribe-confirm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Unsubscribe · FUTUREUNI",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function UnsubscribePage({ params }: PageProps): Promise<ReactNode> {
  const { token } = await params;
  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold tracking-wide text-primary">FUTUREUNI</p>
      <h1 className="mt-2 text-2xl font-semibold text-heading">Unsubscribe</h1>
      <UnsubscribeConfirm token={token} />
      <p className="mt-6 text-xs text-muted">
        FUTUREUNI sends occasional, relevant messages to businesses. You will not receive any more email from this
        campaign.
      </p>
    </section>
  );
}
