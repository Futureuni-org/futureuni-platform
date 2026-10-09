"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection, Field, Select } from "@/components/admin";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeAvatarAction, updateOwnProfileAction } from "../actions";

/** The longest edge an avatar is stored at, and the ceiling the action will accept. */
const AVATAR_MAX_EDGE = 512;
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Shrinks the chosen photo in the browser before it is uploaded. A phone photo is several
 * megabytes, which a Server Action refuses outright, and an avatar is never shown above 512px.
 * Falls back to the original file when the browser cannot decode or encode it.
 */
async function toAvatarFile(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => { resolve(result); }, "image/webp", 0.85);
    });
    if (blob === null || blob.size === 0) return file;
    return new File([blob], "avatar.webp", { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}

/** Where each phase of an upload lands on the bar, so the number always moves forwards. */
const PREPARED_AT = 20;
const UPLOADED_AT = 90;

interface UploadProgress {
  stage: "Preparing" | "Uploading" | "Saving";
  percent: number;
}

/**
 * Posts the avatar and reports progress. XMLHttpRequest rather than fetch: only it exposes
 * `upload.onprogress`, which is the whole point of showing a percentage.
 */
function postAvatar(file: File, onProgress: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/avatars");
    xhr.responseType = "json";
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded / event.total);
    });
    xhr.addEventListener("load", () => {
      const payload: unknown = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) {
        const url = (payload as { url?: unknown } | null)?.url;
        if (typeof url === "string") resolve(url);
        else reject(new Error("The upload returned no image."));
        return;
      }
      const message = (payload as { error?: { message?: unknown } } | null)?.error?.message;
      reject(new Error(typeof message === "string" ? message : "Couldn't upload that image."));
    });
    xhr.addEventListener("error", () => { reject(new Error("The upload failed. Check your connection.")); });
    xhr.addEventListener("abort", () => { reject(new Error("The upload was cancelled.")); });
    xhr.send(body);
  });
}

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
  email,
  initialName,
  initialTimezone,
  initialImage,
}: {
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

  function upload(file: File | undefined) {
    if (file === undefined) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    void (async () => {
      // A visible starting value: a bar sitting at 0 reads as "nothing is happening".
      setProgress({ stage: "Preparing", percent: 8 });
      try {
        const prepared = await toAvatarFile(file);
        if (prepared.size > AVATAR_MAX_BYTES) {
          toast.error("That image is too large. Choose one under 3MB.");
          return;
        }
        setProgress({ stage: "Uploading", percent: PREPARED_AT });
        const url = await postAvatar(prepared, (fraction) => {
          // Once the bytes are sent the wait is the server storing them and writing the profile,
          // so the label says so rather than claiming to still be uploading at 90%.
          setProgress({
            stage: fraction >= 1 ? "Saving" : "Uploading",
            percent: PREPARED_AT + Math.round(fraction * (UPLOADED_AT - PREPARED_AT)),
          });
        });
        setImage(url);
        toast.success("Avatar updated.");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't upload that image.");
      } finally {
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
        <Avatar name={name || email} src={image} size="lg" />
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
                  upload(e.target.files?.[0]);
                  // Clear it, so choosing the same file again still fires a change.
                  e.target.value = "";
                }}
              />
            </label>
            {image !== null && !busy && (
              <Button variant="ghost" size="sm" className="text-danger" onClick={removeAvatar}>
                Remove
              </Button>
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
              <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                {progress.stage} {progress.percent}%
              </span>
            </div>
          )}
        </div>
      </div>

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
