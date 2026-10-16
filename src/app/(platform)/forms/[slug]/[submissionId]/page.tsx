import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { canFromUser, requireUser } from "@/platform/auth";
import { normalizeAnswers } from "@/modules/forms/core/answers";
import { briefSections, renderBrief } from "@/modules/forms/core/brief";
import { getFormSubmission } from "@/modules/forms/core/submissions";
import { getForm } from "@/modules/forms/definitions";
import { BriefView } from "@/modules/forms/ui/internal/brief-view";

interface PageProps {
  params: Promise<{ slug: string; submissionId: string }>;
}

export const metadata: Metadata = { title: "Brief" };

/** `/forms/<slug>/<id>` — one brief, section by section, with copy-as-text. */
export default async function BriefPage({ params }: PageProps) {
  const { slug, submissionId } = await params;
  const definition = getForm(slug);
  if (definition === undefined) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "forms.submission.read")) {
    return <PermissionState description="You cannot read briefs from client forms." />;
  }

  const submission = await getFormSubmission(slug, submissionId);
  if (submission === null) notFound();

  // The stored answers were validated on write, but the definition may have moved on since; this
  // re-normalises against today's questions so a renamed choice can never render as raw JSON.
  const answers = normalizeAnswers(definition, submission.answers);
  const submittedAt = submission.submittedAt.toISOString().replace("T", " ").slice(0, 16);

  return (
    <>
      <PageHeader
        eyebrow={submission.formTitle}
        title={submission.contactName ?? "Brief"}
        description={[
          submission.contactEmail,
          `Sent ${submittedAt} UTC`,
          `Version ${String(submission.formVersion)}`,
        ]
          .filter((part) => part !== null && part !== "")
          .join(" · ")}
        breadcrumbs={
          <Link className="text-sm text-muted hover:underline" href={`/forms/${slug}`}>
            ← {submission.formTitle}
          </Link>
        }
      />

      <BriefView
        sections={briefSections(definition, answers)}
        text={renderBrief(definition, answers, {
          subtitle: `From ${submission.contactName ?? "a prospect"} · ${submittedAt} UTC`,
          includeUnanswered: true,
        })}
      />
    </>
  );
}
