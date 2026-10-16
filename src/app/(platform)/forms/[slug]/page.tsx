import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { RelativeTime } from "@/components/ui/relative-time";
import { canFromUser, requireUser } from "@/platform/auth";
import { answeredCount, questionCount } from "@/modules/forms/core/answers";
import { listFormSubmissions } from "@/modules/forms/core/submissions";
import { getForm } from "@/modules/forms/definitions";
import { CopyFormLink } from "@/modules/forms/ui/internal/copy-link";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: getForm(slug)?.title ?? "Form" };
}

/** `/forms/<slug>` — the briefs that came back from one form, newest first. */
export default async function FormSubmissionsPage({ params }: PageProps) {
  const { slug } = await params;
  const definition = getForm(slug);
  if (definition === undefined) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "forms.submission.read")) {
    return <PermissionState description="You cannot read briefs from client forms." />;
  }

  const submissions = await listFormSubmissions(slug);
  const total = questionCount(definition);

  return (
    <>
      <PageHeader
        eyebrow="Client Forms"
        title={definition.title}
        description={`${String(submissions.length)} ${submissions.length === 1 ? "brief" : "briefs"} · ${String(total)} questions · /f/${definition.slug}`}
        breadcrumbs={
          <Link className="text-sm text-muted hover:underline" href="/forms">
            ← All forms
          </Link>
        }
        actions={<CopyFormLink slug={definition.slug} label="Copy the form link" />}
      />

      {submissions.length === 0 ? (
        <EmptyState
          title="No one has filled this in yet"
          description="Copy the link above and send it to the client. Their brief appears here the moment they finish."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {submissions.map((submission) => (
            <li key={submission.id}>
              <Link
                href={`/forms/${definition.slug}/${submission.id}`}
                className="flex flex-col gap-2 px-5 py-4 hover:bg-zone sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-medium text-heading">
                    {submission.contactName ?? "Someone"}
                  </span>
                  <span className="text-sm text-muted">
                    {submission.contactEmail ?? "No email"}
                  </span>
                </span>
                <span className="flex items-center gap-4 text-sm text-muted">
                  <span className="font-mono tabular-nums">
                    {answeredCount(definition, submission.answers)}/{total}
                  </span>
                  <RelativeTime value={submission.submittedAt} timezone={user.timezone} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
