import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getPublishedForm } from "@/modules/forms/definitions";
import { FormView } from "@/modules/forms/ui/public/form-view";

import { submitFormAction } from "./actions";

/**
 * `/f/<slug>` — the form a prospect fills in. No session (allowlisted in `src/proxy.ts`), and
 * never indexed: the link is given to one client, not published.
 *
 * The page resolves the form and hands it to the renderer, which owns the whole viewport: the
 * brand rail, the step it is on, and the masthead copy on step one.
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

  // The action itself is the prop: only a "use server" function may cross into a client
  // component, and the renderer stays unaware of routes either way.
  return <FormView definition={definition} submit={submitFormAction} />;
}
