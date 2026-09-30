import "server-only";

/**
 * Profile validation (contract §3 rule 2). Runs the Zod schema and reference checks:
 *
 *  - Errors (block publishing): unknown adapter/audit/check/signal/angle refs, wrong
 *    currency for market.
 *  - Warnings (do not block): placeholder-only proof, pricing.needsReview, future signals
 *    with no derivedFrom, detectingSources naming an adapter that doesn't emit the signal.
 */

import { ADAPTER_SIGNAL_TYPES, SourceAdapterIdSchema } from "@/contracts/source-adapter";
import { AuditCheckIdSchema } from "@/contracts/audit-agent";
import {
  ServiceLineProfileSchema,
  type ProfileKnownRefs,
  type ProfileValidationIssue,
  type ServiceLineProfile,
} from "@/contracts/service-line-profile";

/** Default `known` — falls back to the enum members exported by the contracts. */
function defaultKnownRefs(): ProfileKnownRefs {
  const adapterIds = SourceAdapterIdSchema.options as readonly string[];
  const auditChecks = AuditCheckIdSchema.options.reduce<Record<string, string[]>>((acc, id) => {
    const agent = id.split(".")[0] ?? "";
    acc[agent] ??= [];
    acc[agent].push(id);
    return acc;
  }, {});
  return { adapterIds, auditChecks, userIds: [] };
}

function error(
  path: (string | number)[],
  code: string,
  message: string,
): ProfileValidationIssue {
  return { path, severity: "error", code, message };
}

function warning(
  path: (string | number)[],
  code: string,
  message: string,
): ProfileValidationIssue {
  return { path, severity: "warning", code, message };
}

export function validateProfile(
  profile: unknown,
  known?: Partial<ProfileKnownRefs>,
): ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];

  // 1. Schema
  const parsed = ServiceLineProfileSchema.safeParse(profile);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(error(issue.path.map(String), "SCHEMA", issue.message));
    }
    return issues;
  }
  const p: ServiceLineProfile = parsed.data;

  const defaults = defaultKnownRefs();
  const refs: ProfileKnownRefs = {
    adapterIds: known?.adapterIds ?? defaults.adapterIds,
    auditChecks: known?.auditChecks ?? defaults.auditChecks,
    userIds: known?.userIds ?? defaults.userIds,
  };
  const knownAdapters = new Set(refs.adapterIds);
  const knownAuditChecks = new Set(Object.values(refs.auditChecks).flat());

  // Collect declared IDs
  const knownSignalIds = new Set(p.signals.map((s) => s.id));
  const knownAngleIds = {
    NIGERIA: new Set(p.pitchAngles.NIGERIA.map((a) => a.id)),
    INTERNATIONAL: new Set(p.pitchAngles.INTERNATIONAL.map((a) => a.id)),
  };
  const nonPlaceholderPortfolioTags = new Set(
    p.portfolio.filter((it) => !it.isPlaceholder).flatMap((it) => it.tags),
  );

  // 2. Sources — adapter IDs, and signal-emission table
  p.sources.forEach((src, idx) => {
    if (!knownAdapters.has(src.adapterId)) {
      issues.push(
        error(["sources", idx, "adapterId"], "UNKNOWN_ADAPTER", `Unknown adapter "${src.adapterId}"`),
      );
    }
  });

  // 3. Signals — detectingSources warning if adapter doesn't emit the signal per ADAPTER_SIGNAL_TYPES
  p.signals.forEach((sig, idx) => {
    for (const [srcIdx, adapterId] of sig.detectingSources.entries()) {
      if (!knownAdapters.has(adapterId)) {
        issues.push(
          error(
            ["signals", idx, "detectingSources", srcIdx],
            "UNKNOWN_ADAPTER",
            `Unknown adapter "${adapterId}"`,
          ),
        );
        continue;
      }
      const emitted: readonly string[] = ADAPTER_SIGNAL_TYPES[adapterId];
      if (!emitted.includes(sig.id)) {
        issues.push(
          warning(
            ["signals", idx, "detectingSources", srcIdx],
            "ADAPTER_DOES_NOT_EMIT",
            `Adapter "${adapterId}" doesn't emit signal "${sig.id}"; is this a derived signal?`,
          ),
        );
      }
    }
    for (const [chkIdx, checkId] of sig.confirmedBy.entries()) {
      if (!knownAuditChecks.has(checkId)) {
        issues.push(
          error(
            ["signals", idx, "confirmedBy", chkIdx],
            "UNKNOWN_CHECK",
            `Unknown audit check "${checkId}"`,
          ),
        );
      }
    }
    if (sig.future && sig.detectingSources.length === 0 && sig.derivedFrom === undefined) {
      issues.push(
        warning(
          ["signals", idx],
          "FUTURE_SIGNAL_NO_DETECTOR",
          `Future signal "${sig.id}" has no detector or derivedFrom.`,
        ),
      );
    }
  });

  // 4. Audits — every check id known
  p.audits.forEach((a, idx) => {
    a.checks.forEach((c, checkIdx) => {
      if (!knownAuditChecks.has(c.checkId)) {
        issues.push(
          error(
            ["audits", idx, "checks", checkIdx, "checkId"],
            "UNKNOWN_CHECK",
            `Unknown audit check "${c.checkId}"`,
          ),
        );
      }
    });
  });

  // 5. Scoring rules — condition refs
  p.scoring.rules.forEach((rule, idx) => {
    rule.condition.all.forEach((atom, atomIdx) => {
      if (atom.kind === "signal" && !knownSignalIds.has(atom.signalId)) {
        issues.push(
          error(
            ["scoring", "rules", idx, "condition", "all", atomIdx, "signalId"],
            "UNKNOWN_SIGNAL",
            `Rule "${rule.id}" references unknown signal "${atom.signalId}"`,
          ),
        );
      }
      if (atom.kind === "finding" && !knownAuditChecks.has(atom.checkId)) {
        issues.push(
          error(
            ["scoring", "rules", idx, "condition", "all", atomIdx, "checkId"],
            "UNKNOWN_CHECK",
            `Rule "${rule.id}" references unknown check "${atom.checkId}"`,
          ),
        );
      }
    });
  });

  // 6. Disqualifiers — condition refs
  p.disqualifiers.forEach((dq, idx) => {
    if (dq.condition === undefined) return;
    dq.condition.all.forEach((atom, atomIdx) => {
      if (atom.kind === "signal" && !knownSignalIds.has(atom.signalId)) {
        issues.push(
          error(
            ["disqualifiers", idx, "condition", "all", atomIdx, "signalId"],
            "UNKNOWN_SIGNAL",
            `Disqualifier "${dq.id}" references unknown signal "${atom.signalId}"`,
          ),
        );
      }
      if (atom.kind === "finding" && !knownAuditChecks.has(atom.checkId)) {
        issues.push(
          error(
            ["disqualifiers", idx, "condition", "all", atomIdx, "checkId"],
            "UNKNOWN_CHECK",
            `Disqualifier "${dq.id}" references unknown check "${atom.checkId}"`,
          ),
        );
      }
    });
  });

  // 7. Pitch angles — signal / check refs, and placeholder-only proof warning
  for (const market of ["NIGERIA", "INTERNATIONAL"] as const) {
    p.pitchAngles[market].forEach((angle, idx) => {
      for (const sigId of angle.whenToUse.signals) {
        if (!knownSignalIds.has(sigId)) {
          issues.push(
            error(
              ["pitchAngles", market, idx, "whenToUse", "signals"],
              "UNKNOWN_SIGNAL",
              `Angle "${angle.id}" references unknown signal "${sigId}"`,
            ),
          );
        }
      }
      for (const chk of angle.whenToUse.findingChecks) {
        if (!knownAuditChecks.has(chk)) {
          issues.push(
            error(
              ["pitchAngles", market, idx, "whenToUse", "findingChecks"],
              "UNKNOWN_CHECK",
              `Angle "${angle.id}" references unknown check "${chk}"`,
            ),
          );
        }
      }
      const hasRealProof = angle.proofTags.some((t) => nonPlaceholderPortfolioTags.has(t));
      if (angle.proofTags.length > 0 && !hasRealProof) {
        issues.push(
          warning(
            ["pitchAngles", market, idx],
            "NO_NON_PLACEHOLDER_PROOF",
            `Angle "${angle.id}" has no non-placeholder portfolio item for its proof tags.`,
          ),
        );
      }
    });
  }

  // 8. Sequences — pitchAngleId refs
  for (const market of ["NIGERIA", "INTERNATIONAL"] as const) {
    p.sequences[market].forEach((seq, seqIdx) => {
      seq.steps.forEach((step, stepIdx) => {
        if (step.pitchAngleId !== undefined && !knownAngleIds[market].has(step.pitchAngleId)) {
          issues.push(
            error(
              ["sequences", market, seqIdx, "steps", stepIdx, "pitchAngleId"],
              "UNKNOWN_ANGLE",
              `Step ${String(stepIdx)} of "${seq.id}" references unknown angle "${step.pitchAngleId}"`,
            ),
          );
        }
      });
    });
  }

  // 9. Pricing — currency-market fit is enforced by PriceRangeSchema; still surface a
  //    warning when needsReview is true (launch gate).
  if (p.pricing.needsReview) {
    issues.push(
      warning(
        ["pricing", "needsReview"],
        "PRICING_NEEDS_REVIEW",
        "Pricing is marked needsReview — figures are placeholders until confirmed.",
      ),
    );
  }

  // 10. Portfolio — every placeholder is fine, but flag when the whole portfolio is placeholders
  const allPlaceholders = p.portfolio.length > 0 && p.portfolio.every((it) => it.isPlaceholder);
  if (allPlaceholders) {
    issues.push(
      warning(
        ["portfolio"],
        "ALL_PLACEHOLDERS",
        "Every portfolio item is a placeholder (INV-19); real items are needed for outreach.",
      ),
    );
  }

  return issues;
}

/** True when no error-level issues exist; warnings do not block. */
export function hasErrors(issues: readonly ProfileValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
