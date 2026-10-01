/**
 * Renders a proposal to a PDF buffer with `@react-pdf/renderer` (ADR-022). Called from a service or
 * job; the heavy renderer is imported lazily by callers. Brand fonts are registered once per process.
 */

import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import { registerBrandFonts } from "./fonts";
import { ProposalDocument, type ProposalPdfData } from "./proposal-pdf";

export type { ProposalPdfData, ProposalPdfLine } from "./proposal-pdf";

export async function renderProposalPdf(data: ProposalPdfData): Promise<Buffer> {
  registerBrandFonts();
  return renderToBuffer(<ProposalDocument data={data} />);
}
