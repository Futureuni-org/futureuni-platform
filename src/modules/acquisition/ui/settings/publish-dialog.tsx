"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ServiceLineProfile, ProfileValidationIssue } from "@/contracts/service-line-profile";
import type { ProfileDiff } from "@/modules/acquisition/profiles";
import { DiffView } from "./diff-view";
import { diffProfileAction, publishDraftAction, validateDraftAction } from "./actions";

export function PublishDialog({
  slug,
  draft,
  open,
  onOpenChange,
  onPublished,
}: {
  slug: string;
  draft: ServiceLineProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: (version: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
        {open && (
          <PublishBody
            slug={slug}
            draft={draft}
            onOpenChange={onOpenChange}
            onPublished={onPublished}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PublishBody({
  slug,
  draft,
  onOpenChange,
  onPublished,
}: {
  slug: string;
  draft: ServiceLineProfile;
  onOpenChange: (open: boolean) => void;
  onPublished: (version: number) => void;
}) {
  const router = useRouter();
  const [diff, setDiff] = useState<ProfileDiff | null>(null);
  const [issues, setIssues] = useState<ProfileValidationIssue[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    void (async () => {
      const [d, v] = await Promise.all([
        diffProfileAction(slug, draft),
        validateDraftAction(draft),
      ]);
      if (d.ok) setDiff(d.data);
      if (v.ok) setIssues(v.data);
    })();
  }, [slug, draft]);

  const errors = (issues ?? []).filter((i) => i.severity === "error");
  const warnings = (issues ?? []).filter((i) => i.severity === "warning");
  const canPublish = issues !== null && errors.length === 0 && note.trim().length > 0 && !publishing;

  async function publish() {
    setPublishing(true);
    setError(null);
    const result = await publishDraftAction(slug, draft, note.trim());
    if (result.ok) {
      toast.success(`Published version ${String(result.data.version)}.`);
      onPublished(result.data.version);
      onOpenChange(false);
      router.refresh();
    } else {
      setError(result.error.message);
      setPublishing(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Review and publish</DialogTitle>
        <DialogDescription>
          Everything that changes from the active version. Publishing makes this the active profile
          for the line.
        </DialogDescription>
      </DialogHeader>

      {issues === null ? (
        <Skeleton className="h-6 w-40" />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Badge tone={errors.length > 0 ? "danger" : "success"}>
            {errors.length} {errors.length === 1 ? "error" : "errors"}
          </Badge>
          <Badge tone={warnings.length > 0 ? "warning" : "neutral"}>
            {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
          </Badge>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md bg-danger-soft/40 px-3 py-2 text-sm text-danger">
          {errors.map((e, i) => (
            <li key={i}>
              <span className="font-mono text-xs">{e.path.join(".")}</span> — {e.message}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md bg-warning-soft/40 px-3 py-2 text-sm text-warning">
          {warnings.map((w, i) => (
            <li key={i}>
              <span className="font-mono text-xs">{w.path.join(".")}</span> — {w.message}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md bg-surface p-1">
        {diff === null ? <Skeleton className="h-24 w-full" /> : <DiffView diff={diff} />}
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Changelog note (required)</span>
        <Textarea
          value={note}
          rows={2}
          aria-label="Changelog note"
          placeholder="What changed and why"
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </label>

      {error !== null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button
          variant="secondary"
          onClick={() => {
            onOpenChange(false);
          }}
          disabled={publishing}
        >
          Cancel
        </Button>
        <Button
          onClick={() => {
            void publish();
          }}
          loading={publishing}
          disabled={!canPublish}
        >
          Publish
        </Button>
      </DialogFooter>
    </>
  );
}
