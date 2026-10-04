"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";

import type { SelectOption } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/patterns/states";
import { cn } from "@/lib/cn";

import { addNoteAction } from "./detail-actions";
import type { NoteView } from "./detail-types";

/**
 * The Notes tab: plain notes with line breaks, plus teammate mentions (each mentioned teammate is
 * notified by the notes service). Note bodies render as text, never as HTML.
 */
export function NotesTab({
  leadId,
  notes,
  teammates,
  canAdd,
  timezone,
}: {
  leadId: string;
  notes: NoteView[];
  teammates: SelectOption[];
  canAdd: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);

  function toggleMention(id: string) {
    setMentions((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function submit() {
    if (body.trim() === "") return;
    startTransition(async () => {
      const result = await addNoteAction(leadId, body, mentions);
      if (result.ok) {
        toast.success("Note added.");
        setBody("");
        setMentions([]);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex max-w-prose flex-col gap-8">
      {canAdd && (
        <div className="flex flex-col gap-3">
          <label htmlFor="lead-note" className="text-sm font-medium text-foreground">
            Add a note
          </label>
          <Textarea
            id="lead-note"
            rows={4}
            value={body}
            maxLength={4000}
            placeholder="What happened, or what should the next person know?"
            onChange={(e) => {
              setBody(e.target.value);
            }}
          />
          {teammates.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-medium text-muted">Mention teammates</legend>
              <div className="flex flex-wrap gap-1.5">
                {teammates.map((teammate) => {
                  const on = mentions.includes(teammate.value);
                  return (
                    <button
                      key={teammate.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        toggleMention(teammate.value);
                      }}
                      className={cn(
                        "inline-flex min-h-12 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        on
                          ? "border-primary bg-primary-soft text-primary-soft-foreground"
                          : "border-border text-muted hover:text-foreground",
                      )}
                    >
                      {/* A chosen teammate is marked by the tick as well as the colour. */}
                      {on && <Check aria-hidden className="size-4" />}
                      {teammate.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <div>
            <Button onClick={submit} loading={pending} disabled={body.trim() === ""}>
              Add note
            </Button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          description="Notes keep context with the lead, so the next person doesn't have to ask."
        />
      ) : (
        <ul className="flex flex-col gap-6">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-heading">{note.authorName}</span>
                <RelativeTime value={note.createdAt} timezone={timezone} />
              </div>
              <p className="break-words whitespace-pre-wrap text-foreground">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
