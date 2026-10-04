import type { ReviewDraft } from "./view";

/** The small flag chips a draft carries: needs human review, compliance review, cross-sell hold. */
export function DraftFlags({ draft }: { draft: ReviewDraft }): React.ReactElement | null {
  const flags: { label: string; tone: string }[] = [];
  if (draft.needsHumanReview) flags.push({ label: "Needs review", tone: "bg-warning-soft text-warning" });
  if (draft.complianceReview) flags.push({ label: "Compliance", tone: "bg-danger-soft text-danger" });
  if (draft.heldByCrossSell) flags.push({ label: "Cross-sell", tone: "bg-info-soft text-info" });
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span key={flag.label} className={`rounded-full px-2 py-0.5 text-xs font-medium ${flag.tone}`}>
          {flag.label}
        </span>
      ))}
    </span>
  );
}
