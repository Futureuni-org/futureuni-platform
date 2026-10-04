"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Copy,
  HelpCircle,
  Printer,
  RefreshCw,
  UserX,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { MeetingSummary, PrecallBrief } from "@/contracts/acquisition-records";
import type { MeetingStatus } from "@/contracts/common";
import { Field, Select } from "@/components/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/patterns/states";
import type { ActionResult } from "@/lib/result";

import {
  createMeetingAction,
  recordOutcomeAction,
  regeneratePrecallAction,
} from "./detail-actions";
import type { MeetingView } from "./detail-types";
import { SCROLLING_DIALOG } from "./dialog-scroll";
import { enumLabel, formatDateTime, formatDay, localInputToIso } from "./format";
import { ToneBadge, type Tone } from "./tone-badge";

// One row per status: label, colour and icon travel together (never colour alone).
const STATUS_META: Record<MeetingStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  SCHEDULED: { label: "Scheduled", tone: "info", icon: CalendarClock },
  HELD: { label: "Held", tone: "success", icon: CheckCircle2 },
  NO_SHOW: { label: "No-show", tone: "warning", icon: UserX },
  CANCELLED: { label: "Cancelled", tone: "neutral", icon: XCircle },
  UNMATCHED: { label: "Not matched to a lead", tone: "warning", icon: HelpCircle },
};

const SOURCE_LABEL: Record<string, string> = {
  CAL_COM: "Booked online",
  GOOGLE_CALENDAR: "Google Calendar",
  MANUAL: "Logged manually",
};

const OUTCOMES = ["HELD", "NO_SHOW", "RESCHEDULED"] as const;
type Outcome = (typeof OUTCOMES)[number];

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-semibold text-heading">{title}</h4>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground">
        {/* A fixed list from a saved brief or summary; two items can read the same. */}
        {items.map((item, position) => (
          <li key={`${String(position)}-${item}`} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrecallBriefView({ brief }: { brief: PrecallBrief }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="break-words text-foreground">{brief.summary}</p>
      <BulletList title="What they care about" items={brief.whatTheyCareAbout} />
      <BulletList title="Likely needs" items={brief.likelyNeeds} />
      <BulletList title="Suggested questions" items={brief.suggestedQuestions} />
      {brief.suggestedPackage !== null && (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-heading">Suggested package</h4>
          <p className="text-foreground">
            <span className="font-mono text-sm">{brief.suggestedPackage.packageId}</span>
            {" · "}
            {brief.suggestedPackage.why}
          </p>
        </div>
      )}
      {brief.priceRangeToDiscuss !== null && (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-heading">Price range to discuss</h4>
          <p className="text-foreground">
            <Money
              value={{
                amountMinor: brief.priceRangeToDiscuss.minMinor,
                currency: brief.priceRangeToDiscuss.currency,
              }}
            />
            {" to "}
            <Money
              value={{
                amountMinor: brief.priceRangeToDiscuss.maxMinor,
                currency: brief.priceRangeToDiscuss.currency,
              }}
            />
          </p>
        </div>
      )}
      <BulletList title="Risks" items={brief.risks} />
      {brief.citedFindingIds.length > 0 && (
        <p className="text-sm text-muted">
          Based on {String(brief.citedFindingIds.length)} audit{" "}
          {brief.citedFindingIds.length === 1 ? "finding" : "findings"}. See the Evidence tab.
        </p>
      )}
    </div>
  );
}

function MeetingSummaryView({ summary }: { summary: MeetingSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="break-words text-foreground">{summary.summary}</p>
      <BulletList title="Needs" items={summary.needs} />
      <BulletList title="Budget signals" items={summary.budgetSignals} />
      <BulletList title="Decision makers" items={summary.decisionMakers} />
      <BulletList title="Objections" items={summary.objections} />
      {summary.nextSteps.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-heading">Next steps</h4>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground">
            {summary.nextSteps.map((step, position) => (
              <li key={`${String(position)}-${step.action}`} className="break-words">
                {step.action} <span className="text-muted">· {step.owner}</span>
                {/* A due date has no time, so it is shown as a plain day. */}
                {step.due !== null && (
                  <span className="text-muted"> · due {formatDay(step.due)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OutcomeForm({
  meetingId,
  pending,
  onDone,
}: {
  meetingId: string;
  pending: boolean;
  onDone: (action: () => Promise<ActionResult<unknown>>, success: string) => void;
}) {
  const [outcome, setOutcome] = useState<Outcome>("HELD");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");

  return (
    <div className="flex max-w-prose flex-col gap-4">
      <Field label="Outcome" required>
        {({ id }) => (
          <Select
            id={id}
            value={outcome}
            options={[
              { value: "HELD", label: "Held" },
              { value: "NO_SHOW", label: "No-show" },
              { value: "RESCHEDULED", label: "Rescheduled" },
            ]}
            onChange={(e) => {
              setOutcome(OUTCOMES.find((value) => value === e.target.value) ?? "HELD");
            }}
          />
        )}
      </Field>
      <Field label="Notes">
        {({ id }) => (
          <Textarea
            id={id}
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
        )}
      </Field>
      {outcome === "HELD" && (
        <Field
          label="Transcript"
          description="Optional. Paste it to get a summary with next steps."
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              rows={5}
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
              }}
            />
          )}
        </Field>
      )}
      <div>
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => {
            onDone(
              () =>
                recordOutcomeAction(meetingId, {
                  outcome,
                  notes: notes.trim() === "" ? null : notes,
                  transcript: transcript.trim() === "" ? null : transcript,
                }),
              "Outcome recorded.",
            );
          }}
        >
          Record outcome
        </Button>
      </div>
    </div>
  );
}

interface NewMeetingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  timezone: string;
  onCreate: (input: {
    startsAt: string;
    endsAt: string;
    location: string | null;
    notes: string | null;
  }) => void;
}

function NewMeetingDialog(props: NewMeetingProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {/* Mounted only while open, so the form starts empty each time it is opened. */}
        {props.open && <NewMeetingBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function NewMeetingBody({ onOpenChange, pending, timezone, onCreate }: NewMeetingProps) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  // Read in the viewer's profile timezone, the one the meeting times are then shown in.
  const startIso = localInputToIso(start, timezone);
  const endIso = localInputToIso(end, timezone);
  const valid = startIso !== null && endIso !== null && endIso > startIso;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Log a manual meeting</DialogTitle>
        <DialogDescription>
          For a meeting arranged by phone or WhatsApp. This moves the lead to meeting booked and
          stops outreach to the company. Times are in your timezone ({timezone}).
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Starts" required>
          {({ id }) => (
            <Input
              id={id}
              type="datetime-local"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label="Ends"
          required
          error={
            startIso !== null && endIso !== null && !valid ? "It must end after it starts." : null
          }
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="datetime-local"
              aria-describedby={describedBy}
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
              }}
            />
          )}
        </Field>
      </div>
      <Field label="Location or link">
        {({ id }) => (
          <Input
            id={id}
            value={location}
            maxLength={300}
            onChange={(e) => {
              setLocation(e.target.value);
            }}
          />
        )}
      </Field>
      <Field label="Notes">
        {({ id }) => (
          <Textarea
            id={id}
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
        )}
      </Field>
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
          disabled={!valid}
          onClick={() => {
            if (startIso !== null && endIso !== null) {
              onCreate({
                startsAt: startIso,
                endsAt: endIso,
                location: location.trim() === "" ? null : location,
                notes: notes.trim() === "" ? null : notes,
              });
            }
          }}
        >
          Log meeting
        </Button>
      </DialogFooter>
    </>
  );
}

/** The Meetings tab: upcoming and past meetings, the pre-call brief, and the outcome form. */
export function MeetingsTab({
  leadId,
  meetings,
  canManage,
  bookingLink,
  openNew,
  timezone,
}: {
  leadId: string;
  meetings: MeetingView[];
  canManage: boolean;
  bookingLink: string | null;
  openNew: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(openNew && canManage);
  const [printingId, setPrinting] = useState<string | null>(null);
  // The id is interpolated into a style rule, so keep only id characters (ids are cuids).
  const printing = printingId === null ? null : printingId.replace(/[^a-zA-Z0-9]/g, "");

  // Print one brief on its own page: while `printing` is set, a print-only rule hides the rest.
  useEffect(() => {
    if (printing === null) return;
    const done = () => {
      setPrinting(null);
    };
    window.addEventListener("afterprint", done);
    window.print();
    return () => {
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  function run(action: () => Promise<ActionResult<unknown>>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        after?.();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function copyLink() {
    if (bookingLink === null) return;
    // The clipboard is missing on an insecure origin and can be refused by the browser. Either
    // way the link is shown, so it can still be copied by hand.
    const showLink = () =>
      toast.message("Copy the booking link", { description: bookingLink, duration: 20_000 });
    if (!("clipboard" in navigator)) {
      showLink();
      return;
    }
    void navigator.clipboard
      .writeText(bookingLink)
      .then(() => toast.success("Booking link copied."), showLink);
  }

  return (
    <div className="flex flex-col gap-10">
      {printing !== null && (
        <style>{`@media print { body * { visibility: hidden !important; } [data-print-brief="${printing}"], [data-print-brief="${printing}"] * { visibility: visible !important; } [data-print-brief="${printing}"] { position: absolute; inset: 0; padding: 1.5rem; } }`}</style>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setNewOpen(true);
            }}
          >
            <CalendarPlus aria-hidden className="size-4" />
            Log a manual meeting
          </Button>
          {bookingLink !== null && (
            <Button variant="ghost" onClick={copyLink}>
              <Copy aria-hidden className="size-4" />
              Copy booking link
            </Button>
          )}
        </div>
      )}

      {meetings.length === 0 ? (
        <EmptyState
          title="No meetings yet"
          description="Meetings booked through the booking link appear here, or log one you arranged yourself."
        />
      ) : (
        <ul className="flex flex-col gap-12">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-2xl font-semibold text-heading">
                  {formatDateTime(meeting.startsAt, timezone)}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <ToneBadge
                    tone={STATUS_META[meeting.status].tone}
                    icon={STATUS_META[meeting.status].icon}
                  >
                    {STATUS_META[meeting.status].label}
                  </ToneBadge>
                  <span>{SOURCE_LABEL[meeting.source] ?? enumLabel(meeting.source)}</span>
                  {meeting.attendeeName !== null && (
                    <span className="min-w-0 break-words">· with {meeting.attendeeName}</span>
                  )}
                  {meeting.location !== null && (
                    <span className="min-w-0 break-words">· {meeting.location}</span>
                  )}
                </div>
                {meeting.videoUrl !== null && (
                  <a
                    href={meeting.videoUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-12 w-fit items-center text-sm text-primary hover:underline"
                  >
                    Join the call
                  </a>
                )}
                {meeting.notes !== null && (
                  <p className="max-w-prose break-words whitespace-pre-wrap text-foreground">
                    {meeting.notes}
                  </p>
                )}
              </div>

              <section
                data-print-brief={meeting.id}
                className="flex max-w-prose flex-col gap-4"
                aria-label="Pre-call brief"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    Pre-call brief
                  </h3>
                  <div className="flex flex-wrap gap-2 print:hidden">
                    {meeting.precallBrief !== null && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setPrinting(meeting.id);
                        }}
                      >
                        <Printer aria-hidden className="size-4" />
                        Print
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        loading={pending}
                        onClick={() => {
                          run(
                            () => regeneratePrecallAction(meeting.id),
                            "Pre-call brief regenerated.",
                          );
                        }}
                      >
                        <RefreshCw aria-hidden className="size-4" />
                        Regenerate brief
                      </Button>
                    )}
                  </div>
                </div>
                {meeting.precallBrief === null ? (
                  <p className="text-muted">
                    No brief yet. One is written two hours before the meeting, or regenerate it now.
                  </p>
                ) : (
                  <PrecallBriefView brief={meeting.precallBrief} />
                )}
              </section>

              {meeting.summary !== null && (
                <section className="flex max-w-prose flex-col gap-4" aria-label="Meeting summary">
                  <h3 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    Meeting summary
                  </h3>
                  <MeetingSummaryView summary={meeting.summary} />
                </section>
              )}

              {meeting.outcomeNotes !== null && (
                <p className="max-w-prose text-sm break-words whitespace-pre-wrap text-muted">
                  {meeting.outcomeNotes}
                </p>
              )}

              {canManage && meeting.status === "SCHEDULED" && (
                <section className="flex flex-col gap-3" aria-label="Record the outcome">
                  <h3 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    Record the outcome
                  </h3>
                  <OutcomeForm meetingId={meeting.id} pending={pending} onDone={run} />
                </section>
              )}
            </li>
          ))}
        </ul>
      )}

      <NewMeetingDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        pending={pending}
        timezone={timezone}
        onCreate={(input) => {
          run(
            () => createMeetingAction(leadId, input),
            "Meeting logged.",
            () => {
              setNewOpen(false);
            },
          );
        }}
      />
    </div>
  );
}
