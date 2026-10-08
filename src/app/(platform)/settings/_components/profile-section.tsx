"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection, Field, Select } from "@/components/admin";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeAvatarAction, updateOwnProfileAction, uploadAvatarAction } from "../actions";

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
  const [uploadPending, startUpload] = useTransition();

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
    startUpload(async () => {
      const prepared = await toAvatarFile(file);
      if (prepared.size > AVATAR_MAX_BYTES) {
        toast.error("That image is too large. Choose one under 3MB.");
        return;
      }
      const fd = new FormData();
      fd.append("file", prepared);
      const result = await uploadAvatarAction(fd);
      if (result.ok) {
        setImage(result.data.url);
        toast.success("Avatar updated.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function removeAvatar() {
    startUpload(async () => {
      const result = await removeAvatarAction();
      if (result.ok) {
        setImage(null);
        toast.success("Avatar removed.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <SettingsSection eyebrow="Profile" title="Your details" emphasized>
      <div className="flex items-center gap-4">
        <Avatar name={name || email} src={image} size="lg" />
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground hover:bg-primary-soft">
            <Upload aria-hidden className="size-4" />
            {uploadPending ? "Uploading…" : "Upload avatar"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploadPending}
              onChange={(e) => {
                upload(e.target.files?.[0]);
              }}
            />
          </label>
          {image !== null && (
            <Button variant="ghost" size="sm" className="text-danger" onClick={removeAvatar} disabled={uploadPending}>
              Remove
            </Button>
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
