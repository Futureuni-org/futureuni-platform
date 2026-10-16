import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getPublishedForm } from "@/modules/forms/definitions";
import { FormView } from "@/modules/forms/ui/public/form-view";

import { submitFormAction } from "./actions";

/**
 * `/f/<slug>` — the form a prospect fills in. No session (allowlisted in `src/proxy.ts`), and
 * never indexed: the link is given to one client, not published.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const definition = getPublishedForm(slug);
  if (definition === undefined) return { title: "Form", robots: { index: false, follow: false } };
  return {
    title: `${definition.title} · FUTUREUNI`,
    description: definition.intro[0],
    robots: { index: false, follow: false },
  };
}

export default async function PublicFormPage({ params }: PageProps): Promise<ReactNode> {
  const { slug } = await params;
  const definition = getPublishedForm(slug);
  if (definition === undefined) notFound();

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <p className="font-display text-sm font-semibold tracking-[0.08em] text-primary uppercase">
          {definition.eyebrow ?? "FUTUREUNI"}
        </p>
        <h1 className="font-display text-[clamp(2rem,1.4rem+2vw,3rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-heading">
          {definition.title}
        </h1>
        {definition.intro.map((paragraph) => (
          <p key={paragraph} className="max-w-prose text-lg text-foreground">
            {paragraph}
          </p>
        ))}
        {definition.expectation !== undefined && (
          <p className="max-w-prose rounded-md bg-zone px-4 py-3 text-muted">
            {definition.expectation}
          </p>
        )}
      </header>

      {/* The action itself is the prop: only a "use server" function may cross into a client
          component, and the renderer stays unaware of routes either way. */}
      <FormView definition={definition} submit={submitFormAction} />

      <footer className="border-t border-border pt-6 text-sm text-muted">
        FUTUREUNI — Bridging the Digital Divide
      </footer>
    </div>
  );
}
