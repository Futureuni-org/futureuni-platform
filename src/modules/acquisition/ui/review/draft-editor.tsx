"use client";

import { Sparkles, Undo2 } from "lucide-react";
import { useState } from "react";

import { Button, Input } from "@/components/ui";

import { channelLabel, draftLengthState, tokenizeBody } from "./draft-text";
import type { FindingChipView } from "./view";

/**
 * The draft editor. In view mode it renders the body with inline citation markers that highlight
 * their evidence chip (and the reverse). In edit mode it's a textarea with live length feedback.
 * AI assist streams changes in; an edit requires the "every statement is true" confirmation before
 * approval. The system footer (signature, unsubscribe, postal address) is shown read-only.
 */

const AI_PRESETS: { label: string; instruction: string }[] = [
  { label: "Shorter", instruction: "Make this noticeably shorter while keeping every cited fact." },
  { label: "Warmer", instruction: "Make the tone a little warmer and more personable." },
  { label: "More direct", instruction: "Make this more direct and get to the point faster." },
  { label: "Simplify", instruction: "Simplify the language for a non-technical business owner." },
];

export function DraftEditor({
  channel,
  isFirstTouch,
  subject,
  body,
  editing,
  streaming,
  confirmed,
  needsConfirm,
  canDraft,
  findings,
  activeFindingId,
  canUndo,
  aiBusy,
  onChangeSubject,
  onChangeBody,
  onSetEditing,
  onChangeConfirmed,
  onActiveFindingChange,
  onAiApply,
  onAiUndo,
}: {
  channel: string;
  isFirstTouch: boolean;
  subject: string | null;
  body: string;
  editing: boolean;
  streaming: boolean;
  confirmed: boolean;
  needsConfirm: boolean;
  canDraft: boolean;
  findings: FindingChipView[];
  activeFindingId: string | null;
  canUndo: boolean;
  aiBusy: boolean;
  onChangeSubject: (value: string) => void;
  onChangeBody: (value: string) => void;
  onSetEditing: (editing: boolean) => void;
  onChangeConfirmed: (value: boolean) => void;
  onActiveFindingChange: (id: string | null) => void;
  onAiApply: (instruction: string) => void;
  onAiUndo: () => void;
}): React.ReactElement {
  const [freeInstruction, setFreeInstruction] = useState("");
  const isEmail = channel.startsWith("EMAIL");
  const length = draftLengthState(channel, isFirstTouch, subject, body);
  const findingById = new Map(findings.map((f) => [f.id, f]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Draft · {channelLabel(channel)}
        </span>
        {canDraft ? (
          <Button variant="ghost" size="sm" onClick={() => { onSetEditing(!editing); }}>
            {editing ? "Done editing" : "Edit"}
          </Button>
        ) : null}
      </div>

      {isEmail ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Subject</span>
          {editing ? (
            <Input
              aria-label="Subject"
              value={subject ?? ""}
              onChange={(e) => { onChangeSubject(e.target.value); }}
              placeholder="Subject"
            />
          ) : (
            <p className="font-medium text-heading">{subject ?? "—"}</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Message</span>
        {editing || streaming ? (
          <textarea
            aria-label="Message body"
            value={body}
            readOnly={streaming}
            onChange={(e) => { onChangeBody(e.target.value); }}
            rows={isEmail ? 10 : 6}
            className="w-full rounded-md border border-input bg-surface p-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        ) : (
          <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
            {tokenizeBody(body).map((token, index) =>
              token.type === "text" ? (
                <span key={index}>{token.value}</span>
              ) : (
                <CitationMarker
                  key={index}
                  index={token.index}
                  active={activeFindingId === token.id}
                  severity={findingById.get(token.id)?.severity ?? null}
                  onActivate={() => { onActiveFindingChange(token.id); }}
                  onDeactivate={() => { onActiveFindingChange(null); }}
                />
              ),
            )}
          </p>
        )}
        {editing && length.issues.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-warning" aria-live="polite">
            {length.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {canDraft ? (
        <div className="flex flex-col gap-2 rounded-md bg-zone/60 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden />
            <span className="text-xs font-semibold text-foreground">AI assist</span>
            {canUndo ? (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={onAiUndo} disabled={aiBusy}>
                <Undo2 className="size-3.5" aria-hidden />
                Undo
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AI_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => { onAiApply(preset.instruction); }}
                disabled={aiBusy}
                className="inline-flex h-8 items-center rounded-md bg-surface px-3 text-xs font-medium text-foreground shadow-soft transition-colors hover:bg-primary-soft disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={freeInstruction}
              onChange={(e) => { setFreeInstruction(e.target.value); }}
              placeholder="Or describe a change…"
              className="h-9"
            />
            <Button
              size="sm"
              onClick={() => {
                if (freeInstruction.trim().length > 0) onAiApply(freeInstruction.trim());
              }}
              disabled={aiBusy || freeInstruction.trim().length === 0}
            >
              {aiBusy ? "Applying…" : "Apply"}
            </Button>
          </div>
        </div>
      ) : null}

      {isEmail ? (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted">
          <p className="font-medium text-foreground">Added automatically when this sends</p>
          <p>Your signature, a one-click unsubscribe link, and FUTUREUNI&apos;s postal address.</p>
        </div>
      ) : null}

      {needsConfirm ? (
        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => { onChangeConfirmed(e.target.checked); }}
            style={{ accentColor: "var(--primary)" }}
            className="mt-0.5 size-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          I confirm every statement about this business is true.
        </label>
      ) : null}
    </div>
  );
}

function CitationMarker({
  index,
  active,
  severity,
  onActivate,
  onDeactivate,
}: {
  index: number;
  active: boolean;
  severity: string | null;
  onActivate: () => void;
  onDeactivate: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
      aria-label={`Citation ${String(index)}${severity !== null ? `, ${severity.toLowerCase()} finding` : ""}`}
      className={[
        "mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 align-super text-[0.65rem] font-semibold transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary-soft-foreground",
      ].join(" ")}
    >
      {index}
    </button>
  );
}
