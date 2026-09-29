import type { Metadata } from "next";

import { db } from "@/platform/db";
import { hashToken } from "@/platform/auth/tokens";

import AcceptInviteForm from "./accept-form";

export const metadata: Metadata = { title: "Accept your invitation" };

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await db.invite.findFirst({
    where: {
      tokenHash: hashToken(decodeURIComponent(token)),
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { email: true, role: true, serviceLines: true },
  });

  if (invite === null) {
    return (
      <>
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-semibold text-heading">Invitation not valid</h1>
          <p className="text-muted">
            This invitation link is invalid or has expired. Ask an administrator for a fresh one.
          </p>
        </header>
      </>
    );
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-heading">
          Join FUTUREUNI
        </h1>
        <p className="text-muted">
          You&apos;re joining as {invite.role.replace("_", " ").toLowerCase()}. Set a password to
          continue.
        </p>
      </header>
      <AcceptInviteForm token={token} email={invite.email} />
    </>
  );
}
