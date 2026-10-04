"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/patterns/states";
import { MarketBadge } from "@/components/ui/market-badge";
import { lineHref, REFRESH_BADGES_EVENT } from "@/modules/acquisition/ui/shell/line-context";
import type { ServiceLine } from "@/contracts/common";

import { approveAction, getReviewContextAction } from "./actions";
import { DraftFlags } from "./flags";
import { ListMode } from "./list-mode";
import { ReviewCard } from "./review-card";
import { SegmentedControl } from "@/modules/acquisition/ui/search/segmented-control";
import type { ReviewContext, ReviewDraft, ReviewPermissions } from "./view";

/**
 * The review queue screen: a left rail of waiting drafts and a focus card (or a compact list for
 * bulk triage). Navigation and approve feel instant — approve is optimistic with rollback, and each
 * lead's heavy context is fetched on focus and cached.
 */

export function ReviewQueue({
  slug,
  line,
  initialDrafts,
  initialContext,
  initialLeadId,
  permissions,
  timezone,
  nextDraftsExpected,
}: {
  slug: string;
  line: ServiceLine;
  initialDrafts: ReviewDraft[];
  initialContext: ReviewContext | null;
  initialLeadId: string | null;
  permissions: ReviewPermissions;
  timezone: string;
  nextDraftsExpected: string | null;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [drafts, setDrafts] = useState<ReviewDraft[]>(initialDrafts);
  const startIndex = (() => {
    if (initialLeadId === null) return 0;
    const i = initialDrafts.findIndex((d) => d.leadId === initialLeadId);
    return i < 0 ? 0 : i;
  })();
  const [index, setIndex] = useState(startIndex);
  const [mode, setMode] = useState<"focus" | "list">(params.get("mode") === "list" ? "list" : "focus");
  const [contexts, setContexts] = useState<Map<string, ReviewContext>>(
    initialContext !== null ? new Map([[initialContext.leadId, initialContext]]) : new Map(),
  );
  const [loadingLead, setLoadingLead] = useState<string | null>(null);

  const current = drafts[index] ?? null;

  function syncLeadParam(leadId: string | null): void {
    const next = new URLSearchParams(params.toString());
    if (leadId === null) next.delete("lead");
    else next.set("lead", leadId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function ensureContext(leadId: string): void {
    if (contexts.has(leadId)) return;
    setLoadingLead(leadId);
    void getReviewContextAction(slug, leadId).then((res) => {
      if (res.ok) {
        setContexts((m) => new Map(m).set(leadId, res.data));
      }
      setLoadingLead((prev) => (prev === leadId ? null : prev));
    });
  }

  function focusIndex(nextIndex: number): void {
    const clamped = Math.max(0, Math.min(nextIndex, drafts.length - 1));
    setIndex(clamped);
    const draft = drafts[clamped];
    if (draft !== undefined) {
      ensureContext(draft.leadId);
      syncLeadParam(draft.leadId);
    }
  }

  function focusMessage(messageId: string): void {
    const i = drafts.findIndex((d) => d.messageId === messageId);
    if (i >= 0) {
      setMode("focus");
      focusIndex(i);
    }
  }

  function removeAt(i: number): ReviewDraft[] {
    const next = drafts.filter((_, j) => j !== i);
    setDrafts(next);
    const nextIndex = Math.max(0, Math.min(i, next.length - 1));
    setIndex(nextIndex);
    const draft = next[nextIndex];
    if (draft !== undefined) {
      ensureContext(draft.leadId);
      syncLeadParam(draft.leadId);
    } else {
      syncLeadParam(null);
    }
    window.dispatchEvent(new Event(REFRESH_BADGES_EVENT));
    return next;
  }

  function approveFromCard(confirmed: boolean): void {
    const i = index;
    const removed = drafts[i];
    if (removed === undefined) return;
    removeAt(i);
    void approveAction(slug, removed.messageId, confirmed).then((res) => {
      if (res.ok) {
        toast.success("Approved");
      } else {
        // Roll back: restore the draft where it was.
        setDrafts((ds) => {
          const copy = [...ds];
          copy.splice(i, 0, removed);
          return copy;
        });
        setIndex(i);
        toast.error(res.error.message);
      }
    });
  }

  function approveFromList(messageId: string): void {
    const i = drafts.findIndex((d) => d.messageId === messageId);
    if (i < 0) return;
    const removed = drafts[i];
    if (removed === undefined) return;
    setDrafts((ds) => ds.filter((d) => d.messageId !== messageId));
    window.dispatchEvent(new Event(REFRESH_BADGES_EVENT));
    void approveAction(slug, messageId, false).then((res) => {
      if (res.ok) {
        toast.success("Approved");
      } else {
        setDrafts((ds) => {
          const copy = [...ds];
          copy.splice(i, 0, removed);
          return copy;
        });
        toast.error(res.error.message);
      }
    });
  }

  function refreshCurrentContext(): void {
    if (current === null) return;
    void getReviewContextAction(slug, current.leadId).then((res) => {
      if (res.ok) setContexts((m) => new Map(m).set(current.leadId, res.data));
    });
  }

  if (drafts.length === 0) {
    return (
      <EmptyState
        title="Queue clear"
        description={
          nextDraftsExpected !== null
            ? `Nothing to review right now. New drafts are expected ${nextDraftsExpected}.`
            : "Nothing to review right now. Run a search to bring in new leads."
        }
        action={
          <a href={lineHref(line, "search")} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
            Go to Search
          </a>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          <span className="font-mono tabular-nums text-foreground">{drafts.length}</span> waiting
        </p>
        <SegmentedControl
          ariaLabel="View mode"
          size="sm"
          options={[
            { value: "focus", label: "Focus" },
            { value: "list", label: "List" },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            const next = new URLSearchParams(params.toString());
            next.set("mode", m);
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
          }}
        />
      </div>

      {mode === "list" ? (
        <ListMode drafts={drafts} permissions={permissions} onFocus={focusMessage} onApprove={approveFromList} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="order-2 lg:order-1">
            <ul className="flex max-h-[70vh] flex-col gap-1 overflow-auto">
              {drafts.map((draft, i) => (
                <li key={draft.messageId}>
                  <button
                    type="button"
                    onClick={() => { focusIndex(i); }}
                    aria-current={i === index ? "true" : undefined}
                    className={[
                      "flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      i === index ? "bg-primary-soft text-primary-soft-foreground" : "hover:bg-zone",
                    ].join(" ")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{draft.companyName}</span>
                      {draft.score !== null ? (
                        <span className="font-mono text-xs tabular-nums">{draft.score}</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MarketBadge market={draft.market} />
                      <DraftFlags draft={draft} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="order-1 min-w-0 lg:order-2">
            {current !== null ? (
              <ReviewCard
                key={current.messageId}
                slug={slug}
                draft={current}
                context={contexts.get(current.leadId) ?? null}
                contextLoading={loadingLead === current.leadId && !contexts.has(current.leadId)}
                permissions={permissions}
                position={{ index, total: drafts.length }}
                timezone={timezone}
                onApprove={approveFromCard}
                onRemoved={() => { removeAt(index); }}
                onRegenerated={() => { router.refresh(); }}
                onContextChanged={refreshCurrentContext}
                onNext={() => { focusIndex(index + 1); }}
                onPrev={() => { focusIndex(index - 1); }}
                onOpenLead={() => {
                  window.open(lineHref(line, `leads/${current.leadId}`), "_blank", "noopener,noreferrer");
                }}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
