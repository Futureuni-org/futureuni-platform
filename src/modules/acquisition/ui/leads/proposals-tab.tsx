"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle2,
  Clock,
  FilePlus2,
  FileText,
  Send,
  ShieldAlert,
  ThumbsUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { Currency, ProposalStatus } from "@/contracts/common";
import { ConfirmDialog, Field, Select } from "@/components/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/patterns/states";
import type { ActionResult } from "@/lib/result";

import { DownloadLink } from "./button-link";
import {
  acceptProposalAction,
  approveProposalAction,
  createProposalAction,
  declineProposalAction,
  diffProposalAction,
  priceQuoteAction,
  reviseProposalAction,
  sendProposalAction,
} from "./detail-actions";
import type { DetailCapabilities, PackageOption, ProposalView } from "./detail-types";
import { SCROLLING_DIALOG } from "./dialog-scroll";
import { formatDate, formatDay } from "./format";
import { QuoteBuilder } from "./quote-builder";
import { deliveryNotice, type SendResult } from "./send-outcome";
import { ToneBadge, type Tone } from "./tone-badge";

// One row per status: label, colour and icon travel together (never colour alone).
const STATUS_META: Record<ProposalStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: FileText },
  PENDING_APPROVAL: { label: "Waiting for approval", tone: "warning", icon: Clock },
  APPROVED: { label: "Approved", tone: "info", icon: ThumbsUp },
  SENT: { label: "Sent", tone: "primary", icon: Send },
  ACCEPTED: { label: "Accepted", tone: "success", icon: CheckCircle2 },
  DECLINED: { label: "Declined", tone: "danger", icon: XCircle },
  EXPIRED: { label: "Expired", tone: "neutral", icon: Clock },
  SUPERSEDED: { label: "Superseded", tone: "neutral", icon: Archive },
};

/**
 * The PDF preview. The frame is only created once the preview is opened: a closed `<details>` still
 * loads an `<iframe>` inside it, so every version on the tab would otherwise download its PDF.
 */
function PdfPreview({ url, version }: { url: string; version: number }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="max-w-3xl text-sm"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="flex min-h-12 w-fit cursor-pointer items-center rounded text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Preview the PDF
      </summary>
      {opened && (
        <iframe
          src={url}
          title={`Proposal version ${String(version)} PDF`}
          loading="lazy"
          className="mt-3 h-[70vh] w-full rounded-md bg-zone"
        />
      )}
    </details>
  );
}

// Section order and headings follow the proposal PDF (project-rules §"Output/document rules").
const SECTIONS = [
  ["understanding", "1 Understanding your situation"],
  ["solution", "2 Proposed solution"],
  ["scope", "3 Scope and deliverables"],
  ["timeline", "4 Timeline"],
  ["investmentIntro", "5 Investment"],
  ["whyFutureuni", "6 Why FUTUREUNI"],
  ["terms", "7 Terms and validity"],
  ["nextSteps", "8 Next steps and acceptance"],
] as const;

type Builder = { mode: "create" } | { mode: "revise"; proposal: ProposalView } | null;

function VersionDiff({ proposal }: { proposal: ProposalView }) {
  const [pending, startTransition] = useTransition();
  const [diff, setDiff] = useState<{
    from: number;
    to: number;
    delta: number;
    fromVersion: number;
    sameCurrency: boolean;
  } | null>(null);

  if (proposal.version < 2) return null;

  if (diff !== null) {
    return (
      <p className="text-sm text-muted">
        Version {String(diff.fromVersion)} was{" "}
        <Money value={{ amountMinor: diff.from, currency: proposal.currency }} />, this version is{" "}
        <Money value={{ amountMinor: diff.to, currency: proposal.currency }} />
        {diff.sameCurrency && (
          <>
            {" "}
            (a change of <Money value={{ amountMinor: diff.delta, currency: proposal.currency }} />)
          </>
        )}
        .
      </p>
    );
  }

  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await diffProposalAction(
            proposal.groupId,
            proposal.version - 1,
            proposal.version,
          );
          if (result.ok) {
            setDiff({
              from: result.data.from.totalMinor,
              to: result.data.to.totalMinor,
              delta: result.data.totalDeltaMinor,
              fromVersion: result.data.from.version,
              sameCurrency: result.data.sameCurrency,
            });
          } else {
            toast.error(result.error.message);
          }
        });
      }}
    >
      Compare with version {String(proposal.version - 1)}
    </Button>
  );
}

function SendDialog({
  proposal,
  contacts,
  onOpenChange,
  onSend,
}: {
  proposal: ProposalView | null;
  contacts: { id: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onSend: (
    proposalId: string,
    contactId: string,
    message: string,
  ) => Promise<ActionResult<unknown>>;
}) {
  return (
    <Dialog open={proposal !== null} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {proposal !== null && (
          <SendBody
            proposal={proposal}
            contacts={contacts}
            onOpenChange={onOpenChange}
            onSend={onSend}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SendBody({
  proposal,
  contacts,
  onOpenChange,
  onSend,
}: {
  proposal: ProposalView;
  contacts: { id: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onSend: (
    proposalId: string,
    contactId: string,
    message: string,
  ) => Promise<ActionResult<unknown>>;
}) {
  const [pending, startTransition] = useTransition();
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = contactId !== "" && message.trim() !== "" && confirmed;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Send proposal version {String(proposal.version)}</DialogTitle>
      </DialogHeader>
      {contacts.length === 0 ? (
        <p className="text-sm text-muted">
          This lead has no contact with an email address, so the proposal can&apos;t be sent yet.
        </p>
      ) : (
        <>
          <Field label="Send to" required>
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
          <Field label="Covering message" required>
            {({ id }) => (
              <Textarea
                id={id}
                rows={6}
                maxLength={5000}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
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
            <span>I have read the proposal and the message, and both are accurate.</span>
          </label>
        </>
      )}
      {error !== null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button
          loading={pending}
          disabled={!ready}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await onSend(proposal.id, contactId, message);
              if (result.ok) onOpenChange(false);
              else setError(result.error.message);
            });
          }}
        >
          Send proposal
        </Button>
      </DialogFooter>
    </>
  );
}

function DeclineDialog({
  proposal,
  onOpenChange,
  onDecline,
}: {
  proposal: ProposalView | null;
  onOpenChange: (open: boolean) => void;
  onDecline: (
    proposalId: string,
    reason: string,
    keepOpen: boolean,
  ) => Promise<ActionResult<unknown>>;
}) {
  return (
    <Dialog open={proposal !== null} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {proposal !== null && (
          <DeclineBody proposal={proposal} onOpenChange={onOpenChange} onDecline={onDecline} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeclineBody({
  proposal,
  onOpenChange,
  onDecline,
}: {
  proposal: ProposalView;
  onOpenChange: (open: boolean) => void;
  onDecline: (
    proposalId: string,
    reason: string,
    keepOpen: boolean,
  ) => Promise<ActionResult<unknown>>;
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [keepOpen, setKeepOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark version {String(proposal.version)} declined</DialogTitle>
      </DialogHeader>
      <Field label="Reason" required>
        {({ id }) => (
          <Input
            id={id}
            value={reason}
            maxLength={300}
            onChange={(e) => {
              setReason(e.target.value);
            }}
          />
        )}
      </Field>
      <label className="flex min-h-12 items-center gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={keepOpen}
          onChange={(e) => {
            setKeepOpen(e.target.checked);
          }}
          className="size-5 shrink-0 accent-[var(--primary)]"
        />
        <span>Keep the conversation open (the lead moves back to replied).</span>
      </label>
      {error !== null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={pending}
          disabled={reason.trim() === ""}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await onDecline(proposal.id, reason, keepOpen);
              if (result.ok) onOpenChange(false);
              else setError(result.error.message);
            });
          }}
        >
          Mark declined
        </Button>
      </DialogFooter>
    </>
  );
}

/** The Proposals tab: the quote builder and every proposal version with its actions. */
export function ProposalsTab({
  leadId,
  proposals,
  packages,
  currency,
  contacts,
  capabilities,
  openNew,
  timezone,
}: {
  leadId: string;
  proposals: ProposalView[];
  packages: PackageOption[] | null;
  currency: Currency | null;
  contacts: { id: string; label: string }[];
  capabilities: DetailCapabilities;
  openNew: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canBuild = capabilities.createProposal && packages !== null && currency !== null;
  const [builder, setBuilder] = useState<Builder>(openNew && canBuild ? { mode: "create" } : null);
  const [approving, setApproving] = useState<ProposalView | null>(null);
  const [sending, setSending] = useState<ProposalView | null>(null);
  const [declining, setDeclining] = useState<ProposalView | null>(null);

  function done<T>(result: ActionResult<T>, success: string): ActionResult<T> {
    if (result.ok) {
      toast.success(success);
      router.refresh();
    }
    return result;
  }

  function accept(proposal: ProposalView) {
    startTransition(async () => {
      const result = done(await acceptProposalAction(proposal.id), "Proposal marked accepted.");
      if (!result.ok) toast.error(result.error.message);
    });
  }

  /** Reports what really happened to the email: sent, scheduled for later, or blocked. */
  function sent(result: ActionResult<SendResult>): ActionResult<SendResult> {
    if (result.ok) {
      const notice = deliveryNotice("Proposal", result.data, timezone);
      if (notice.tone === "success") toast.success(notice.text);
      else if (notice.tone === "error") toast.error(notice.text);
      else toast.info(notice.text);
      router.refresh();
    }
    return result;
  }

  return (
    <div className="flex flex-col gap-10">
      {capabilities.createProposal && builder === null && (
        <div className="flex flex-col gap-2">
          <div>
            <Button
              disabled={!canBuild}
              onClick={() => {
                setBuilder({ mode: "create" });
              }}
            >
              <FilePlus2 aria-hidden className="size-4" />
              New proposal
            </Button>
          </div>
          {!canBuild && (
            <p className="text-sm text-muted">
              This line has no pricing for this lead&apos;s market yet. Add it in the line settings.
            </p>
          )}
        </div>
      )}

      {builder !== null && packages !== null && currency !== null && (
        <section className="flex flex-col gap-6" aria-label="Quote builder">
          <h2 className="font-display text-2xl font-semibold text-heading">
            {builder.mode === "create"
              ? "New proposal"
              : `Revise version ${String(builder.proposal.version)}`}
          </h2>
          <QuoteBuilder
            // Keyed by what is being built, so switching from one version's revision to another
            // (or to a new proposal) starts from that version instead of keeping the last form.
            key={builder.mode === "create" ? "create" : builder.proposal.id}
            leadId={leadId}
            packages={packages}
            currency={currency}
            {...(builder.mode === "revise"
              ? {
                  seed: {
                    lines: builder.proposal.lines,
                    discount: builder.proposal.discount,
                    validUntil: builder.proposal.validUntil,
                    notes: builder.proposal.notes,
                  },
                }
              : {})}
            saveLabel={builder.mode === "create" ? "Generate proposal" : "Save as a new version"}
            canApproveException={capabilities.approveException}
            priceQuote={priceQuoteAction}
            onSave={(input) =>
              builder.mode === "create"
                ? createProposalAction(leadId, input)
                : reviseProposalAction(builder.proposal.id, input)
            }
            onSaved={() => {
              setBuilder(null);
              router.refresh();
            }}
            onCancel={() => {
              setBuilder(null);
            }}
          />
        </section>
      )}

      {proposals.length === 0 ? (
        builder === null && (
          <EmptyState
            title="No proposals yet"
            description="Build a quote from this line's packages. The price is worked out for you."
          />
        )
      ) : (
        <ul className="flex flex-col gap-12">
          {proposals.map((proposal) => {
            const open = proposal.status === "DRAFT" || proposal.status === "PENDING_APPROVAL";
            const mayApprove = proposal.requiresApproval
              ? capabilities.approveException
              : capabilities.approveProposal;
            const revisable = open || proposal.status === "APPROVED" || proposal.status === "SENT";

            return (
              <li key={proposal.id} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <h2 className="font-display text-2xl font-semibold text-heading">
                    Version {String(proposal.version)}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                    <ToneBadge
                      tone={STATUS_META[proposal.status].tone}
                      icon={STATUS_META[proposal.status].icon}
                    >
                      {STATUS_META[proposal.status].label}
                    </ToneBadge>
                    <span className="text-base text-heading">
                      <Money
                        value={{ amountMinor: proposal.totalMinor, currency: proposal.currency }}
                      />
                    </span>
                    <span>Valid until {formatDay(proposal.validUntil)}</span>
                    {proposal.sentAt !== null && (
                      <span>Sent {formatDate(proposal.sentAt, timezone)}</span>
                    )}
                  </div>
                </div>

                {proposal.requiresApproval && open && (
                  <div
                    role="status"
                    className="flex max-w-prose flex-col gap-1 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
                  >
                    <p className="flex items-center gap-2 font-semibold">
                      <ShieldAlert aria-hidden className="size-4" />
                      Manager approval needed
                    </p>
                    {proposal.approvalReason !== null && <p>{proposal.approvalReason}</p>}
                    {!mayApprove && <p>A manager or admin has been asked to approve it.</p>}
                  </div>
                )}

                {proposal.declineReason !== null && (
                  <p className="max-w-prose text-sm break-words text-muted">
                    Declined: {proposal.declineReason}
                  </p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full max-w-2xl border-collapse text-sm">
                    <caption className="sr-only">
                      Line items for version {String(proposal.version)}
                    </caption>
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted">
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Item
                        </th>
                        <th scope="col" className="py-2 pr-4 text-right font-medium">
                          Qty
                        </th>
                        <th scope="col" className="py-2 pr-4 text-right font-medium">
                          Unit price
                        </th>
                        <th scope="col" className="py-2 text-right font-medium">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Saved lines in their saved order; two can be identical, so the position
                          is part of the key. The list is never reordered or edited in place. */}
                      {proposal.lines.map((line, position) => (
                        <tr
                          key={`${String(position)}-${line.description}`}
                          className="border-b border-border/60"
                        >
                          <td className="py-2 pr-4 break-words text-foreground">
                            {line.description}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums">
                            {String(line.quantity)}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            <Money
                              value={{
                                amountMinor: line.unitPriceMinor,
                                currency: proposal.currency,
                              }}
                            />
                          </td>
                          <td className="py-2 text-right">
                            <Money
                              value={{ amountMinor: line.totalMinor, currency: proposal.currency }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {proposal.discountMinor > 0 && (
                        <tr>
                          <th
                            scope="row"
                            colSpan={3}
                            className="py-1 pr-4 text-right font-normal text-muted"
                          >
                            Discount
                          </th>
                          <td className="py-1 text-right">
                            <span aria-hidden className="font-mono">
                              −
                            </span>
                            <span className="sr-only">minus </span>
                            <Money
                              value={{
                                amountMinor: proposal.discountMinor,
                                currency: proposal.currency,
                              }}
                            />
                          </td>
                        </tr>
                      )}
                      {proposal.taxMinor > 0 && (
                        <tr>
                          <th
                            scope="row"
                            colSpan={3}
                            className="py-1 pr-4 text-right font-normal text-muted"
                          >
                            Tax
                          </th>
                          <td className="py-1 text-right">
                            <Money
                              value={{
                                amountMinor: proposal.taxMinor,
                                currency: proposal.currency,
                              }}
                            />
                          </td>
                        </tr>
                      )}
                      <tr>
                        <th
                          scope="row"
                          colSpan={3}
                          className="py-2 pr-4 text-right font-semibold text-heading"
                        >
                          Total
                        </th>
                        <td className="py-2 text-right font-semibold text-heading">
                          <Money
                            value={{
                              amountMinor: proposal.totalMinor,
                              currency: proposal.currency,
                            }}
                          />
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {open && mayApprove && (
                    <Button
                      onClick={() => {
                        setApproving(proposal);
                      }}
                    >
                      Approve
                    </Button>
                  )}
                  {proposal.status === "APPROVED" && capabilities.sendProposal && (
                    <Button
                      onClick={() => {
                        setSending(proposal);
                      }}
                    >
                      Send
                    </Button>
                  )}
                  {proposal.status === "SENT" && capabilities.sendProposal && (
                    <>
                      <Button
                        loading={pending}
                        onClick={() => {
                          accept(proposal);
                        }}
                      >
                        Mark accepted
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDeclining(proposal);
                        }}
                      >
                        Mark declined
                      </Button>
                    </>
                  )}
                  {revisable && canBuild && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setBuilder({ mode: "revise", proposal });
                      }}
                    >
                      Revise
                    </Button>
                  )}
                  {proposal.pdfUrl !== null && (
                    <DownloadLink
                      href={proposal.pdfUrl}
                      variant="ghost"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open PDF
                    </DownloadLink>
                  )}
                  <VersionDiff proposal={proposal} />
                </div>

                {proposal.pdfUrl !== null && (
                  <PdfPreview url={proposal.pdfUrl} version={proposal.version} />
                )}

                {proposal.sections !== null && (
                  <details className="max-w-prose text-sm">
                    <summary className="flex min-h-12 w-fit cursor-pointer items-center rounded text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      Read the proposal text
                    </summary>
                    <div className="mt-3 flex flex-col gap-4">
                      {SECTIONS.map(([key, heading]) => (
                        <div key={key} className="flex flex-col gap-1">
                          <h3 className="font-semibold text-heading">{heading}</h3>
                          <p className="break-words whitespace-pre-wrap text-foreground">
                            {proposal.sections?.[key]}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(next) => {
          if (!next) setApproving(null);
        }}
        title={`Approve version ${String(approving?.version ?? "")}?`}
        description={
          approving?.requiresApproval === true
            ? `This is an exception approval. ${approving.approvalReason ?? ""}`
            : "Once approved, the proposal can be sent to the prospect."
        }
        confirmLabel="Approve"
        onConfirm={async () => {
          if (approving === null) return { ok: true, data: null };
          return done(await approveProposalAction(approving.id), "Proposal approved.");
        }}
      />

      <SendDialog
        proposal={sending}
        contacts={contacts}
        onOpenChange={(next) => {
          if (!next) setSending(null);
        }}
        onSend={async (proposalId, contactId, message) =>
          sent(await sendProposalAction(proposalId, contactId, message, true))
        }
      />

      <DeclineDialog
        proposal={declining}
        onOpenChange={(next) => {
          if (!next) setDeclining(null);
        }}
        onDecline={async (proposalId, reason, keepOpen) =>
          done(
            await declineProposalAction(proposalId, reason, keepOpen),
            "Proposal marked declined.",
          )
        }
      />
    </div>
  );
}
