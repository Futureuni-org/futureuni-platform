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
    const fd = new FormData();
    fd.append("file", file);
    startUpload(async () => {
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
