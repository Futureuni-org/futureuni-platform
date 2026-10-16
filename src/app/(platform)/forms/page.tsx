import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { canFromUser, requireUser } from "@/platform/auth";
import { submissionStats } from "@/modules/forms/core/submissions.repo";
import { listForms } from "@/modules/forms/definitions";
import { CopyFormLink } from "@/modules/forms/ui/internal/copy-link";

export const metadata: Metadata = { title: "Client Forms" };

/** `/forms` — every form, its public link and how many briefs have come back. */
export default async function FormsPage() {
  const user = await requireUser();
  if (!canFromUser(user, "forms.form.read")) {
    return <PermissionState description="Ask an administrator for access to Client Forms." />;
  }

  const forms = listForms();
  const stats = await submissionStats();

  return (
    <>
      <PageHeader
        eyebrow="Client Forms"
        title="Forms"
        description="Send a prospect the link, and their brief comes back here."
      />

      {forms.length === 0 ? (
        <EmptyState
          title="No forms yet"
          description="Forms are defined in src/modules/forms/definitions. The builder arrives in phase F2 — see docs/specs/module-forms.md."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {forms.map((form) => {
            const stat = stats.get(form.slug);
            const count = stat?.count ?? 0;
            return (
              <li
                key={form.slug}
                className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6"
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-semibold text-heading">
                        <Link className="hover:underline" href={`/forms/${form.slug}`}>
                          {form.title}
                        </Link>
                      </h2>
                      <Badge tone={form.status === "PUBLISHED" ? "success" : "neutral"}>
                        {form.status === "PUBLISHED" ? "Live" : form.status.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="max-w-prose text-sm text-muted">{form.intro[0]}</p>
                    <p className="font-mono text-xs text-subtle">/f/{form.slug}</p>
                  </div>
                  <CopyFormLink slug={form.slug} />
                </div>

                <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-4 text-sm">
                  <div className="flex items-baseline gap-2">
                    <dt className="text-muted">Briefs</dt>
                    <dd className="font-mono text-foreground tabular-nums">{count}</dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="text-muted">Newest</dt>
                    <dd className="text-foreground">
                      {stat?.newest == null ? (
                        "—"
                      ) : (
                        <RelativeTime value={stat.newest} timezone={user.timezone} />
                      )}
                    </dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="text-muted">Questions</dt>
                    <dd className="font-mono text-foreground tabular-nums">
                      {form.sections.reduce((total, section) => total + section.fields.length, 0)}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
