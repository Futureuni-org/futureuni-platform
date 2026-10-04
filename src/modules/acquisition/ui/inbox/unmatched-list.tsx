"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import { EmptyState } from "@/components/patterns/states";

import { SCROLLING_DIALOG } from "../leads/dialog-scroll";
import { linkReplyAction, searchLeadsAction, type LeadMatch } from "./actions";
import type { UnmatchedReplyView } from "./inbox-types";

/**
 * Replies that couldn't be matched to a lead. Each can be linked to one by searching for it; once
 * linked, the reply is processed like any other (classified, actioned, shown in the lead's thread).
 */
export function UnmatchedList({
  replies,
  serviceLine,
  timezone,
}: {
  replies: UnmatchedReplyView[];
  serviceLine: string;
  timezone: string;
}) {
  const [linking, setLinking] = useState<UnmatchedReplyView | null>(null);

  if (replies.length === 0) {
    return (
      <EmptyState
        title="No unmatched replies"
        description="Every reply has been matched to a lead."
      />
    );
  }

  return (
    <>
      <ul aria-label="Unmatched replies" className="flex max-w-3xl flex-col">
        {replies.map((reply) => (
          <li
            key={reply.id}
            className="flex flex-col gap-3 border-b border-border/60 py-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-medium break-all text-heading">
                {reply.fromAddress ?? "Unknown sender"}
              </span>
              {reply.subject !== null && (
                <span className="text-sm break-words text-foreground">{reply.subject}</span>
              )}
              {reply.summary !== null && (
                <span className="text-sm break-words text-muted">{reply.summary}</span>
              )}
              <RelativeTime value={reply.receivedAt} timezone={timezone} className="text-xs" />
            </div>
            <Button
              variant="secondary"
              className="shrink-0 self-start"
              onClick={() => {
                setLinking(reply);
              }}
            >
              <Link2 aria-hidden className="size-4" />
              Link to a lead
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={linking !== null}
        onOpenChange={(open) => {
          if (!open) setLinking(null);
        }}
      >
        <DialogContent className={SCROLLING_DIALOG}>
          {linking !== null && (
            <LinkBody
              reply={linking}
              serviceLine={serviceLine}
              onLinked={() => {
                setLinking(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function LinkBody({
  reply,
  serviceLine,
  onLinked,
}: {
  reply: UnmatchedReplyView;
  serviceLine: string;
  onLinked: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [matches, setMatches] = useState<LeadMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  // A search still waiting when the dialog closes is dropped rather than run for nobody.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      latest.current += 1;
    },
    [],
  );

  function search(query: string) {
    if (timer.current !== null) clearTimeout(timer.current);
    const term = query.trim();
    if (term.length < 2) {
      latest.current += 1;
      setMatches(null);
      setSearching(false);
      return;
    }
    const request = (latest.current += 1);
    setSearching(true);
    timer.current = setTimeout(() => {
      void searchLeadsAction(serviceLine, term).then((result) => {
        if (request !== latest.current) return; // a newer search superseded this one
        setSearching(false);
        if (result.ok) {
          setMatches(result.data);
          setError(null);
        } else {
          setError(result.error.message);
        }
      });
    }, 300);
  }

  function link(lead: LeadMatch) {
    setError(null);
    startTransition(async () => {
      const result = await linkReplyAction(reply.id, lead.id);
      if (result.ok) {
        toast.success(`Linked to ${lead.companyName}. The reply is being processed.`);
        onLinked();
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Link this reply to a lead</DialogTitle>
        <DialogDescription className="break-words">
          From {reply.fromAddress ?? "an unknown sender"}. Search this line&apos;s leads by company,
          contact or domain.
        </DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          aria-label="Search leads"
          placeholder="Company, contact or domain"
          className="pl-9"
          maxLength={80}
          onChange={(e) => {
            search(e.target.value);
          }}
        />
      </div>

      <div aria-live="polite" aria-busy={searching || pending} className="flex min-h-24 flex-col">
        {matches === null ? (
          <p className="text-sm text-muted">
            {searching ? "Searching…" : "Type at least two characters to search."}
          </p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-muted">No leads match that search.</p>
        ) : (
          <ul aria-label="Matching leads" className="flex flex-col">
            {matches.map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    link(lead);
                  }}
                  className="flex min-h-12 w-full flex-col items-start justify-center rounded-md px-3 py-2 text-left hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  <span className="font-medium break-words text-heading">{lead.companyName}</span>
                  {lead.place !== null && (
                    <span className="text-sm break-words text-muted">{lead.place}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending && (
        <p role="status" className="text-sm text-muted">
          Linking the reply…
        </p>
      )}

      {error !== null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
