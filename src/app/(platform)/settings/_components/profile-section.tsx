"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Upload } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection, Field, Select } from "@/components/admin";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeAvatarAction, updateOwnProfileAction } from "../actions";
import { AvatarCropper } from "./avatar-cropper";
import { postAvatar } from "./avatar-upload";

/** Where each phase of an upload lands on the bar, so the number always moves forwards. */
const PREPARED_AT = 20;
const UPLOADED_AT = 90;

interface UploadProgress {
  stage: "Preparing" | "Uploading" | "Saving";
  percent: number;
}

/** The cropper exports a 512px square; this is only a guard against a surprising file. */
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

const COMMON_TIMEZONES = [
  "Africa/Lagos",
  "Europe/London",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Paris",
  "Asia/Dubai",
];

export function ProfileSection({
  userId,
  email,
  initialName,
  initialTimezone,
  initialImage,
}: {
  userId: string;
  email: string;
  initialName: string;
  initialTimezone: string;
  initialImage: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [image, setImage] = useState(initialImage);
  const [savePending, startSave] = useTransition();
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  /** What the cropper is framing: a new file, or the stored original being re-adjusted. */
  const [pending, setPending] = useState<File | string | null>(null);
  /** How to stop an upload in flight, held in state so the Cancel button appears while it runs. */
  const [cancelUpload, setCancelUpload] = useState<(() => void) | null>(null);
  const busy = progress !== null;

  const tzOptions = Array.from(new Set([initialTimezone, ...COMMON_TIMEZONES])).map((tz) => ({
    value: tz,
    label: tz,
  }));

  function save() {
    startSave(async () => {
      const result = await updateOwnProfileAction({ name, timezone });
      if (result.ok) {
        toast.success("Profile saved.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function choose(file: File | undefined) {
    if (file === undefined) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    setPending(file);
  }

  function adjust() {
    // The stored original, not the framed square: re-framing the square could only ever crop it
    // further, never recover what the last framing left out.
    setPending(`/api/avatars/${userId}/source`);
  }

  function upload(framed: File) {
    // Only a newly chosen file carries an original worth keeping; re-framing reuses the one on
    // record, so the person can keep adjusting without uploading anything again.
    const original = pending instanceof File ? pending : null;
    setPending(null);
    void (async () => {
      // A visible starting value: a bar sitting at 0 reads as "nothing is happening".
      setProgress({ stage: "Preparing", percent: 8 });
      try {
        if (framed.size > AVATAR_MAX_BYTES) {
          toast.error("That image is too large. Choose one under 3MB.");
          return;
        }
        const body = new FormData();
        body.append("file", framed);
        if (original !== null) body.append("source", original);

        setProgress({ stage: "Uploading", percent: PREPARED_AT });
        const handle = postAvatar(body, (fraction) => {
          // Once the bytes are sent the wait is the server storing them and writing the profile,
          // so the label says so rather than claiming to still be uploading at 90%.
          setProgress({
            stage: fraction >= 1 ? "Saving" : "Uploading",
            percent: PREPARED_AT + Math.round(fraction * (UPLOADED_AT - PREPARED_AT)),
          });
        });
        setCancelUpload(() => handle.cancel);
        const url = await handle.done;
        setImage(url);
        toast.success("Avatar updated.");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't upload that image.");
      } finally {
        setCancelUpload(null);
        setProgress(null);
      }
    })();
  }

  function removeAvatar() {
    void (async () => {
      setProgress({ stage: "Saving", percent: UPLOADED_AT });
      const result = await removeAvatarAction();
      setProgress(null);
      if (result.ok) {
        setImage(null);
        toast.success("Avatar removed.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    })();
  }

  return (
    <SettingsSection eyebrow="Profile" title="Your details" emphasized>
      <div className="flex items-center gap-4">
        {image === null ? (
          <Avatar name={name || email} src={image} size="lg" />
        ) : (
          /* The avatar itself is the way back into framing: the position is a property of the
             picture, so it is adjusted where the picture is, not behind "upload" again. */
          <button
            type="button"
            onClick={adjust}
            disabled={busy}
            title="Adjust your avatar"
            aria-label="Adjust your avatar"
            className="group relative shrink-0 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Avatar name={name || email} src={image} size="lg" />
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center rounded-full bg-scrim text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <Pencil className="size-4" />
            </span>
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <label
              className={cn(
                "inline-flex items-center gap-2 rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground",
                busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-primary-soft",
              )}
            >
              <Upload aria-hidden className="size-4" />
              {busy ? "Working…" : "Upload avatar"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  // Clear it, so choosing the same file again still fires a change.
                  e.target.value = "";
                }}
              />
            </label>
            {image !== null && !busy && (
              <>
                <Button variant="ghost" size="sm" onClick={adjust}>
                  Adjust
                </Button>
                <Button variant="ghost" size="sm" className="text-danger" onClick={removeAvatar}>
                  Remove
                </Button>
              </>
            )}
          </div>
          {progress !== null && (
            <div className="flex items-center gap-3">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
                aria-label={`${progress.stage} avatar`}
                className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-zone"
              >
                <div
                  className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-200"
                  style={{ width: `${String(progress.percent)}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-sm text-muted tabular-nums">
                {progress.stage} {progress.percent}%
              </span>
              {cancelUpload !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    cancelUpload();
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <AvatarCropper
        source={pending}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={upload}
        onUnavailable={() => {
          setPending(null);
          toast.error(
            "That avatar was uploaded before adjusting was possible. Upload it again to move it.",
          );
        }}
      />

      <Field label="Name">
        {({ id }) => (
          <Input
            id={id}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        )}
      </Field>

      <Field label="Email" description="Your email can only be changed by an administrator.">
        {({ id }) => <Input id={id} value={email} disabled />}
      </Field>

      <Field label="Timezone" description="Times across the platform show in this zone.">
        {({ id }) => (
          <Select
            id={id}
            value={timezone}
            options={tzOptions}
            onChange={(e) => {
              setTimezone(e.target.value);
            }}
          />
        )}
      </Field>

      <Button
        className="self-start"
        onClick={save}
        loading={savePending}
        disabled={name.trim() === "" || (name === initialName && timezone === initialTimezone)}
      >
        Save profile
      </Button>
    </SettingsSection>
  );
}
