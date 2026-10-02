"use client";

import { useTransition } from "react";
import { ExternalLink, Upload } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/admin";
import { EmptyState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDraft } from "../profile-draft-context";
import { MARKETS, type PortfolioItem } from "../profile-types";
import {
  AddButton,
  CheckboxField,
  ChipMultiSelect,
  ItemCard,
  StringListField,
  TextAreaField,
  TextField,
} from "../editor-fields";
import { portfolioMediaUrlAction, uploadPortfolioMediaAction } from "../upload-actions";

export function PortfolioSection({ slug }: { slug: string }) {
  const { draft, canEdit, setField } = useDraft();

  function set(next: PortfolioItem[]) {
    setField("portfolio", next);
  }

  return (
    <SettingsSection
      eyebrow="Portfolio"
      title="Work to show"
      description="Real FUTUREUNI work. Placeholders are clearly marked and never attached to outreach or proposals (INV-19)."
      emphasized
      actions={
        canEdit ? (
          <AddButton
            label="Add item"
            onClick={() => {
              let n = draft.portfolio.length + 1;
              const existing = new Set(draft.portfolio.map((p) => p.id));
              while (existing.has(`portfolio_${String(n)}`)) n += 1;
              set([
                ...draft.portfolio,
                {
                  id: `portfolio_${String(n)}`,
                  title: "New item",
                  description: "",
                  tags: ["sample"],
                  markets: ["NIGERIA", "INTERNATIONAL"],
                  isPlaceholder: true,
                },
              ]);
            }}
          />
        ) : undefined
      }
    >
      {draft.portfolio.length === 0 ? (
        <EmptyState title="No portfolio items" description="Add real work, or a clearly-marked placeholder." />
      ) : (
        <div className="flex flex-col gap-4">
          {draft.portfolio.map((item, i) => {
            function patch(change: Partial<PortfolioItem>) {
              set(draft.portfolio.map((p, idx) => (idx === i ? { ...p, ...change } : p)));
            }
            return (
              <ItemCard
                key={i}
                title={item.title || item.id}
                badge={item.isPlaceholder ? <Badge tone="warning">Placeholder</Badge> : undefined}
                canEdit={canEdit}
                onRemove={() => {
                  set(draft.portfolio.filter((_, idx) => idx !== i));
                }}
              >
                <TextField
                  label="Title"
                  value={item.title}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch({ title: v });
                  }}
                />
                <TextAreaField
                  label="Description"
                  value={item.description}
                  rows={2}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch({ description: v });
                  }}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="URL"
                    value={item.url ?? ""}
                    placeholder="https://…"
                    disabled={!canEdit}
                    onChange={(v) => {
                      patch({ url: v === "" ? undefined : v });
                    }}
                  />
                  <TextField
                    label="Outcome metric"
                    value={item.outcomeMetric ?? ""}
                    placeholder="Bookings up 38% in 3 months"
                    disabled={!canEdit}
                    onChange={(v) => {
                      patch({ outcomeMetric: v === "" ? undefined : v });
                    }}
                  />
                </div>
                <StringListField
                  label="Tags"
                  description="Proof tags that pitch angles match on."
                  values={item.tags}
                  lowercaseSlug
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch({ tags: v });
                  }}
                />
                <ChipMultiSelect
                  label="Markets"
                  values={item.markets}
                  options={MARKETS}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch({ markets: v as PortfolioItem["markets"] });
                  }}
                />
                <MediaUpload
                  slug={slug}
                  value={item.mediaFileKey}
                  disabled={!canEdit}
                  onChange={(key) => {
                    patch({ mediaFileKey: key });
                  }}
                />
                <CheckboxField
                  label="Placeholder (never attached to outreach or proposals)"
                  checked={item.isPlaceholder}
                  disabled={!canEdit}
                  onChange={(checked) => {
                    patch({ isPlaceholder: checked });
                  }}
                />
              </ItemCard>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}

function MediaUpload({
  slug,
  value,
  onChange,
  disabled,
}: {
  slug: string;
  value: string | undefined;
  onChange: (key: string | undefined) => void;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function upload(file: File | undefined) {
    if (file === undefined) return;
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const result = await uploadPortfolioMediaAction(slug, fd);
      if (result.ok) {
        onChange(result.data.key);
        toast.success("Media uploaded.");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function view() {
    if (value === undefined) return;
    startTransition(async () => {
      const result = await portfolioMediaUrlAction(value);
      if (result.ok) {
        window.open(result.data.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">Media</span>
      {value !== undefined ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted">{value}</span>
          <Button variant="secondary" size="sm" className="gap-1" onClick={view} loading={pending}>
            <ExternalLink aria-hidden className="size-4" />
            View
          </Button>
          {!disabled && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => {
                onChange(undefined);
              }}
            >
              Remove
            </Button>
          )}
        </div>
      ) : (
        !disabled && (
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground hover:bg-primary-soft">
            <Upload aria-hidden className="size-4" />
            {pending ? "Uploading…" : "Upload media"}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                upload(e.target.files?.[0]);
              }}
            />
          </label>
        )
      )}
    </div>
  );
}
