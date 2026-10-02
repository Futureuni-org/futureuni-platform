"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin";
import { cn } from "@/lib/cn";
import type { ProfileValidationIssue, ServiceLineProfile } from "@/contracts/service-line-profile";

import { ProfileDraftProvider } from "./profile-draft-context";
import { discardDraftAction, saveDraftAction, validateDraftAction } from "./actions";
import { PublishDialog } from "./publish-dialog";
import { VersionHistory, type VersionRow } from "./version-history";
import { CapacityPanel, type CapacitySummary } from "./capacity-panel";
import { OverviewSection } from "./sections/overview-section";
import { SignalsSection } from "./sections/signals-section";
import { SourcesSection } from "./sections/sources-section";
import { AuditsSection } from "./sections/audits-section";
import { ScoringSection } from "./sections/scoring-section";
import { PitchAnglesSection } from "./sections/pitch-angles-section";
import { PortfolioSection } from "./sections/portfolio-section";
import { PricingSection } from "./sections/pricing-section";
import { SequencesSection } from "./sections/sequences-section";
import { DisqualifiersSection } from "./sections/disqualifiers-section";
import { AdvancedSection } from "./sections/advanced-section";

export interface ProfileEditorProps {
  slug: string;
  lineLabel: string;
  active: ServiceLineProfile;
  initialDraft: ServiceLineProfile | null;
  activeVersion: number | null;
  canEdit: boolean;
  canPublish: boolean;
  canRollback: boolean;
  isAdmin: boolean;
  teamUsers: { id: string; name: string | null; email: string }[];
  versions: VersionRow[];
  capacity: CapacitySummary | null;
  timezone: string;
  initialSection: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function ProfileEditor(props: ProfileEditorProps) {
  const router = useRouter();
  const sections = [
    { key: "overview", label: "Overview" },
    { key: "signals", label: "Signals" },
    { key: "sources", label: "Sources" },
    { key: "audits", label: "Audits" },
    { key: "scoring", label: "Scoring" },
    { key: "pitch-angles", label: "Pitch angles" },
    { key: "portfolio", label: "Portfolio" },
    { key: "pricing", label: "Pricing" },
    { key: "sequences", label: "Sequences" },
    { key: "disqualifiers", label: "Disqualifiers" },
    ...(props.isAdmin ? [{ key: "advanced", label: "Advanced" }] : []),
    { key: "history", label: "History" },
    ...(props.capacity !== null ? [{ key: "capacity", label: "Capacity" }] : []),
  ];

  const [draft, setDraft] = useState<ServiceLineProfile>(props.initialDraft ?? props.active);
  const [editing, setEditing] = useState(props.initialDraft !== null);
  const [section, setSection] = useState(
    sections.some((s) => s.key === props.initialSection) ? props.initialSection : "overview",
  );
  const [issues, setIssues] = useState<ProfileValidationIssue[] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const [savedJson, setSavedJson] = useState(JSON.stringify(props.initialDraft ?? props.active));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftJson = JSON.stringify(draft);
  const dirty = draftJson !== savedJson;

  // Debounced validate (always) + autosave (when editing and changed).
  useEffect(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (async () => {
        const profile = JSON.parse(draftJson) as unknown;
        const v = await validateDraftAction(profile);
        if (v.ok) setIssues(v.data);
        if (editing && draftJson !== savedJson) {
          setSaveState("saving");
          const r = await saveDraftAction(props.slug, profile);
          if (r.ok) {
            setSavedJson(draftJson);
            setSaveState("saved");
          } else {
            setSaveState("error");
          }
        }
      })();
    }, 700);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [draftJson, savedJson, editing, props.slug]);

  // Warn before leaving with an unsaved or in-flight draft.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (editing && (dirty || saveState === "saving")) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [editing, dirty, saveState]);

  function goto(key: string) {
    setSection(key);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/acquisition/${props.slug}/settings?section=${key}`);
    }
  }

  function startEditing() {
    setEditing(true);
    // Persist an initial draft immediately so "Edit" creates the draft row.
    setSaveState("saving");
    void saveDraftAction(props.slug, draft).then((r) => {
      if (r.ok) {
        setSavedJson(JSON.stringify(draft));
        setSaveState("saved");
      } else {
        setSaveState("error");
        toast.error(r.error.message);
      }
    });
  }

  const errors = (issues ?? []).filter((i) => i.severity === "error");
  const warnings = (issues ?? []).filter((i) => i.severity === "warning");
  const hasErrors = errors.length > 0;

  const contextValue = {
    draft,
    canEdit: editing && props.canEdit,
    setField: <K extends keyof ServiceLineProfile>(key: K, value: ServiceLineProfile[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    update: (updater: (d: ServiceLineProfile) => ServiceLineProfile) => {
      setDraft((prev) => updater(prev));
    },
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={props.lineLabel}
        title="Line settings"
        description="The profile that tells the acquisition engine how FUTUREUNI sells this line."
        actions={
          !editing && props.canEdit ? (
            <Button className="gap-2" onClick={startEditing}>
              <PencilLine aria-hidden className="size-4" />
              Edit
            </Button>
          ) : undefined
        }
      />

      {!editing && (
        <p className="text-sm text-muted">
          Viewing the active version
          {props.activeVersion !== null && (
            <span className="font-mono"> v{props.activeVersion}</span>
          )}
          {props.canEdit ? ". Choose Edit to open a draft." : " (read-only)."}
        </p>
      )}

      {/* Section nav */}
      <nav aria-label="Profile sections" className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              goto(s.key);
            }}
            aria-current={section === s.key ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-t-md px-3 py-2 text-sm transition-colors",
              section === s.key
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Sticky draft bar */}
      {editing && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-4 py-3 shadow-lift">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone="info">Draft</Badge>
            <SaveIndicator state={saveState} dirty={dirty} />
            <span className="flex gap-2">
              <Badge tone={hasErrors ? "danger" : "success"}>
                {errors.length} {errors.length === 1 ? "error" : "errors"}
              </Badge>
              <Badge tone={warnings.length > 0 ? "warning" : "neutral"}>
                {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
              </Badge>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => {
                setDiscardOpen(true);
              }}
            >
              Discard
            </Button>
            {props.canPublish && (
              <Button
                size="sm"
                disabled={hasErrors || saveState === "saving"}
                onClick={() => {
                  setPublishOpen(true);
                }}
              >
                Review and publish
              </Button>
            )}
          </div>
        </div>
      )}

      <ProfileDraftProvider value={contextValue}>
        {section === "overview" && <OverviewSection teamUsers={props.teamUsers} />}
        {section === "signals" && (
          <SignalsSection publishedSignalIds={props.active.signals.map((s) => s.id)} />
        )}
        {section === "sources" && <SourcesSection />}
        {section === "audits" && <AuditsSection />}
        {section === "scoring" && <ScoringSection slug={props.slug} />}
        {section === "pitch-angles" && <PitchAnglesSection />}
        {section === "portfolio" && <PortfolioSection slug={props.slug} />}
        {section === "pricing" && <PricingSection />}
        {section === "sequences" && <SequencesSection />}
        {section === "disqualifiers" && <DisqualifiersSection />}
        {section === "advanced" && props.isAdmin && <AdvancedSection />}
      </ProfileDraftProvider>

      {section === "history" && (
        <VersionHistory
          slug={props.slug}
          versions={props.versions}
          canRollback={props.canRollback}
          timezone={props.timezone}
        />
      )}
      {section === "capacity" && props.capacity !== null && (
        <CapacityPanel summary={props.capacity} />
      )}

      <PublishDialog
        slug={props.slug}
        draft={draft}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublished={() => {
          setEditing(false);
          setSaveState("idle");
        }}
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        tone="danger"
        title="Discard this draft"
        description="This deletes the draft and returns to the active version. It can't be undone."
        confirmLabel="Discard draft"
        onConfirm={async () => {
          const result = await discardDraftAction(props.slug);
          if (result.ok) {
            toast.success("Draft discarded.");
            setEditing(false);
            setDraft(props.active);
            setSavedJson(JSON.stringify(props.active));
            setSaveState("idle");
            router.refresh();
          }
          return result;
        }}
      />
    </div>
  );
}

function SaveIndicator({ state, dirty }: { state: SaveState; dirty: boolean }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-danger">Couldn&apos;t save — retrying on the next change.</span>;
  }
  if (dirty) {
    return <span className="text-muted">Unsaved changes…</span>;
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1 text-success">
        <Check aria-hidden className="size-4" /> Saved
      </span>
    );
  }
  return null;
}
