"use client";

import { Check, ChevronLeft, ChevronRight, Clock, ExternalLink, RefreshCw, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Button, Kbd, Skeleton } from "@/components/ui";
import { MarketBadge } from "@/components/ui/market-badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/admin";
import { useShortcut } from "@/components/patterns";

import { AssistedPanel } from "./assisted-panel";
import { ContextPanel } from "./context-panel";
import { DraftEditor } from "./draft-editor";
import { EvidencePanel } from "./evidence-panel";
import { RejectDialog } from "./reject-dialog";
import {
  acceptReviewAction,
  editAction,
  overrideReviewAction,
  regenerateAction,
  rejectAction,
  snoozeAction,
} from "./actions";
import type { ReviewContext, ReviewDraft, ReviewPermissions, RejectReason } from "./view";

/**
 * The focus-mode review card: context, evidence and the draft, with keyboard-first actions. Approve
 * is optimistic (handled by the queue); the rest run here and tell the queue to advance or refresh.
 */

const ASSISTED_CHANNELS = new Set(["WHATSAPP_ASSISTED", "LINKEDIN_ASSISTED", "CALL_TASK"]);

export function ReviewCard({
  slug,
  draft,
  context,
  contextLoading,
  permissions,
  position,
  timezone,
  onApprove,
  onRemoved,
  onRegenerated,
  onContextChanged,
  onNext,
  onPrev,
  onOpenLead,
}: {
  slug: string;
  draft: ReviewDraft;
  context: ReviewContext | null;
  contextLoading: boolean;
  permissions: ReviewPermissions;
  position: { index: number; total: number };
  timezone: string;
  onApprove: (confirmed: boolean) => void;
  onRemoved: () => void;
  onRegenerated: () => void;
  onContextChanged: () => void;
  onNext: () => void;
  onPrev: () => void;
  onOpenLead: () => void;
}): React.ReactElement {
  const [subject, setSubject] = useState<string | null>(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const previousBody = useRef<string | null>(null);

  const isAssisted = ASSISTED_CHANNELS.has(draft.channel);
  const dirty = subject !== draft.subject || body !== draft.body;
  const needsConfirm = dirty || draft.humanEdited || draft.status === "NEEDS_EDIT";

  // --- actions -------------------------------------------------------------

  const approve = useCallback(async () => {
    if (!permissions.canApprove || busy) return;
    if (needsConfirm && !confirmed) {
      toast.error("Tick the confirmation before approving an edited draft.");
      setEditing(true);
      return;
    }
    if (dirty) {
      setBusy(true);
      const edited = await editAction(slug, draft.messageId, subject, body);
      setBusy(false);
      if (!edited.ok) {
        toast.error(edited.error.message);
        return;
      }
    }
    onApprove(confirmed);
  }, [permissions.canApprove, busy, needsConfirm, confirmed, dirty, slug, draft.messageId, subject, body, onApprove]);

  async function reject(input: { reason: RejectReason; note: string; disqualify: boolean }): Promise<void> {
    setBusy(true);
    const res = await rejectAction(slug, draft.messageId, input);
    setBusy(false);
    if (res.ok) {
      setRejectOpen(false);
      toast.success(input.disqualify ? "Lead disqualified" : "Draft rejected");
      onRemoved();
    } else {
      toast.error(res.error.message);
    }
  }

  async function regenerate(): Promise<void> {
    if (!permissions.canDraft || busy) return;
    setBusy(true);
    const res = await regenerateAction(slug, draft.messageId, "");
    setBusy(false);
    if (res.ok) {
      toast.success("Regenerating a new draft");
      onRegenerated();
    } else {
      toast.error(res.error.message);
    }
  }

  async function snooze(until: Date): Promise<void> {
    setBusy(true);
    const res = await snoozeAction(slug, draft.leadId, until.toISOString());
    setBusy(false);
    if (res.ok) {
      toast.success("Snoozed");
      onRemoved();
    } else {
      toast.error(res.error.message);
    }
  }

  async function acceptReview(): Promise<void> {
    setBusy(true);
    const res = await acceptReviewAction(slug, draft.leadId);
    setBusy(false);
    if (res.ok) {
      toast.success("Recommendation accepted");
      onContextChanged();
    } else {
      toast.error(res.error.message);
    }
  }

  async function applyOverride(decision: "QUALIFY" | "DISQUALIFY", note: string): Promise<void> {
    setBusy(true);
    const res = await overrideReviewAction(slug, draft.leadId, decision, note);
    setBusy(false);
    if (res.ok) {
      setOverrideOpen(false);
      toast.success("Decision recorded");
      onContextChanged();
    } else {
      toast.error(res.error.message);
    }
  }

  const applyAi = useCallback(
    async (instruction: string) => {
      if (aiBusy) return;
      previousBody.current = body;
      setAiBusy(true);
      setStreaming(true);
      setEditing(true);
      try {
        const response = await fetch(`/acquisition/${slug}/review/draft-edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: draft.messageId, instruction }),
        });
        if (!response.ok || response.body === null) {
          toast.error("Couldn't start the edit.");
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.replace(/^data: /, "").trim();
            if (line.length === 0) continue;
            const event = JSON.parse(line) as
              | { type: "delta"; text: string }
              | { type: "final"; output: { subject: string | null; body: string } }
              | { type: "error"; message: string };
            if (event.type === "final") {
              setSubject(event.output.subject);
              setBody(event.output.body);
            } else if (event.type === "error") {
              toast.error(event.message);
            }
          }
        }
      } catch {
        toast.error("The edit stream failed.");
      } finally {
        setStreaming(false);
        setAiBusy(false);
      }
    },
    [aiBusy, body, slug, draft.messageId],
  );

  function undoAi(): void {
    if (previousBody.current !== null) {
      setBody(previousBody.current);
      previousBody.current = null;
    }
  }

  // --- keyboard ------------------------------------------------------------

  useShortcut("a", () => void approve(), { description: "Approve" });
  useShortcut("e", () => { setEditing((v) => !v); }, { description: "Edit draft" });
  useShortcut("r", () => { if (permissions.canReject) setRejectOpen(true); }, { description: "Reject" });
  useShortcut("g", () => void regenerate(), { description: "Regenerate" });
  useShortcut("j", onNext, { description: "Next lead" });
  useShortcut("k", onPrev, { description: "Previous lead" });
  useShortcut("o", onOpenLead, { description: "Open lead" });
  useShortcut(
    "y",
    () => {
      if (permissions.canDecideReview && context?.recommendation != null) void acceptReview();
    },
    { description: "Accept recommendation" },
  );
  useShortcut(
    "n",
    () => {
      if (permissions.canDecideReview && context?.recommendation != null) setOverrideOpen(true);
    },
    { description: "Override recommendation" },
  );

  // --- render --------------------------------------------------------------

  return (
    <div className="flex flex-col gap-5 rounded-lg bg-surface p-5 shadow-soft">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-heading">{draft.companyName}</h2>
            <MarketBadge market={draft.market} />
          </div>
          <p className="text-sm text-muted">
            {[draft.companyCity, draft.companyCountry].filter((v) => v !== null && v.length > 0).join(", ") || "—"}
            {draft.contactName !== null ? ` · ${draft.contactName}` : ""}
            {draft.contactRole !== null ? `, ${draft.contactRole}` : ""}
          </p>
          {draft.brief !== null ? <p className="max-w-prose text-sm text-foreground">{draft.brief}</p> : null}
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
          {position.index + 1} of {position.total}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Evidence</p>
            {contextLoading || context === null ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <EvidencePanel
                findings={context.findings}
                citedFindingIds={draft.citedFindingIds}
                activeFindingId={activeFindingId}
                onActiveFindingChange={setActiveFindingId}
                timezone={timezone}
              />
            )}
          </section>

          <section className="border-t border-border pt-5">
            <DraftEditor
              channel={draft.channel}
              isFirstTouch={draft.isFirstTouch}
              subject={subject}
              body={body}
              editing={editing}
              streaming={streaming}
              confirmed={confirmed}
              needsConfirm={needsConfirm}
              canDraft={permissions.canDraft}
              findings={context?.findings ?? []}
              activeFindingId={activeFindingId}
              canUndo={previousBody.current !== null}
              aiBusy={aiBusy}
              onChangeSubject={setSubject}
              onChangeBody={setBody}
              onSetEditing={setEditing}
              onChangeConfirmed={setConfirmed}
              onActiveFindingChange={setActiveFindingId}
              onAiApply={(instruction) => void applyAi(instruction)}
              onAiUndo={undoAi}
            />
          </section>

          {isAssisted ? (
            <section className="border-t border-border pt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Send</p>
              <AssistedPanel
                slug={slug}
                channel={draft.channel}
                messageId={draft.messageId}
                whatsappConfidence={context?.whatsappConfidence ?? null}
                canSendAssisted={permissions.canSendAssisted}
                onSent={onRemoved}
              />
            </section>
          ) : null}
        </div>

        <aside className="order-1 lg:order-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Context</p>
          {contextLoading || context === null ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <ContextPanel
              context={context}
              website={context.companyWebsite}
              canDecideReview={permissions.canDecideReview}
              decideBusy={busy}
              onAcceptReview={() => void acceptReview()}
              onOverrideReview={() => { setOverrideOpen(true); }}
            />
          )}
        </aside>
      </div>

      <footer className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur">
        {!isAssisted && permissions.canApprove ? (
          <Button onClick={() => void approve()} disabled={busy || (needsConfirm && !confirmed)}>
            <Check className="size-4" aria-hidden />
            Approve <Kbd>A</Kbd>
          </Button>
        ) : null}
        {permissions.canDraft ? (
          <Button variant="ghost" onClick={() => { setEditing((v) => !v); }}>
            Edit <Kbd>E</Kbd>
          </Button>
        ) : null}
        {permissions.canReject ? (
          <Button variant="ghost" onClick={() => { setRejectOpen(true); }}>
            <X className="size-4" aria-hidden />
            Reject <Kbd>R</Kbd>
          </Button>
        ) : null}
        {permissions.canDraft ? (
          <Button variant="ghost" onClick={() => void regenerate()} disabled={busy}>
            <RefreshCw className="size-4" aria-hidden />
            Regenerate <Kbd>G</Kbd>
          </Button>
        ) : null}
        <SnoozeButton onSnooze={(d) => void snooze(d)} disabled={busy} />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onPrev} aria-label="Previous lead">
            <ChevronLeft className="size-4" aria-hidden />
            <Kbd>K</Kbd>
          </Button>
          <Button variant="ghost" size="sm" onClick={onNext} aria-label="Next lead">
            <Kbd>J</Kbd>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenLead}>
            <ExternalLink className="size-4" aria-hidden />
            Open <Kbd>O</Kbd>
          </Button>
        </div>
      </footer>

      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} busy={busy} onConfirm={(input) => void reject(input)} />
      <OverrideDialog open={overrideOpen} onOpenChange={setOverrideOpen} busy={busy} onConfirm={(d, note) => void applyOverride(d, note)} />
    </div>
  );
}

function SnoozeButton({ onSnooze, disabled }: { onSnooze: (until: Date) => void; disabled: boolean }): React.ReactElement {
  const [custom, setCustom] = useState("");
  function at9(daysFromNow: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" disabled={disabled}>
          <Clock className="size-4" aria-hidden />
          Snooze <Kbd>S</Kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-56 flex-col gap-2">
        <Button variant="ghost" size="sm" onClick={() => { onSnooze(at9(1)); }}>Tomorrow</Button>
        <Button variant="ghost" size="sm" onClick={() => { onSnooze(at9(7)); }}>Next week</Button>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Pick a date
          <input
            type="date"
            value={custom}
            onChange={(e) => { setCustom(e.target.value); }}
            className="h-9 rounded-md border border-input bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <Button
          size="sm"
          disabled={custom.length === 0}
          onClick={() => {
            const d = new Date(`${custom}T09:00:00`);
            if (!Number.isNaN(d.getTime())) onSnooze(d);
          }}
        >
          Snooze to date
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function OverrideDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: (decision: "QUALIFY" | "DISQUALIFY", note: string) => void;
}): React.ReactElement {
  const [decision, setDecision] = useState<"QUALIFY" | "DISQUALIFY">("QUALIFY");
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override the recommendation</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Decision</span>
            <Select
              options={[
                { value: "QUALIFY", label: "Qualify" },
                { value: "DISQUALIFY", label: "Disqualify" },
              ]}
              value={decision}
              onChange={(e) => { setDecision(e.target.value as "QUALIFY" | "DISQUALIFY"); }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Why (required)</span>
            <input
              value={note}
              onChange={(e) => { setNote(e.target.value); }}
              className="h-11 rounded-md border border-input bg-surface px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onOpenChange(false); }}>Cancel</Button>
          <Button onClick={() => { onConfirm(decision, note); }} disabled={busy || note.trim().length === 0}>
            Record decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
