/**
 * The branded handoff PDF for the delivery team (project-rules §Output/document rules). Rendered
 * with `@react-pdf/renderer`, reusing the proposal brand palette and fonts.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import type { JSX } from "react";

import type { HandoffContent } from "@/contracts/acquisition-records";
import { formatMoney } from "@/lib/money";

import { PDF_COLOR } from "../proposals/pdf/brand";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, registerBrandFonts } from "../proposals/pdf/fonts";

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontFamily: FONT_BODY, fontSize: 10.5, lineHeight: 1.5, color: PDF_COLOR.ink, backgroundColor: PDF_COLOR.surface },
  wordmark: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14, color: PDF_COLOR.navy, letterSpacing: 1 },
  title: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, color: PDF_COLOR.navy, marginTop: 10, marginBottom: 2 },
  meta: { color: PDF_COLOR.muted, marginBottom: 14 },
  value: { fontFamily: FONT_MONO, color: PDF_COLOR.navy },
  heading: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, color: PDF_COLOR.navy, marginTop: 14, marginBottom: 4 },
  bullet: { flexDirection: "row", marginBottom: 2 },
  dot: { color: PDF_COLOR.primary, marginRight: 6 },
});

function HandoffDocument({ content, reference }: { content: HandoffContent; reference: string }): JSX.Element {
  return (
    <Document title={`FUTUREUNI Handoff ${reference}`} author="FUTUREUNI">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.wordmark}>FUTUREUNI</Text>
        <Text style={styles.title}>Delivery handoff — {content.company.name}</Text>
        <Text style={styles.meta}>
          {content.market} · {content.services.join(", ")} ·{" "}
          <Text style={styles.value}>{formatMoney(content.value, { showMinor: "always" })}</Text>
          {content.timeline.startDate === null ? "" : ` · start ${content.timeline.startDate}`}
        </Text>

        <Text style={styles.heading}>Contacts</Text>
        {content.contacts.map((c, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.dot}>•</Text>
            <Text>
              {c.name ?? "Unnamed"}
              {c.role === null ? "" : ` (${c.role})`}
              {c.email === null ? "" : ` — ${c.email}`}
            </Text>
          </View>
        ))}

        <Text style={styles.heading}>Scope and deliverables</Text>
        {content.scope.map((item, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.dot}>•</Text>
            <Text>{item}</Text>
          </View>
        ))}

        {content.keyFindings.length > 0 ? (
          <>
            <Text style={styles.heading}>Key findings and context</Text>
            {content.keyFindings.map((f, i) => (
              <View key={i} style={styles.bullet}>
                <Text style={styles.dot}>•</Text>
                <Text>{f.claim}</Text>
              </View>
            ))}
          </>
        ) : null}

        {content.meetingSummaries.some((s) => s.summary !== "") ? (
          <>
            <Text style={styles.heading}>Meeting summaries</Text>
            {content.meetingSummaries
              .filter((s) => s.summary !== "")
              .map((s, i) => (
                <View key={i} style={styles.bullet}>
                  <Text style={styles.dot}>•</Text>
                  <Text>{s.summary}</Text>
                </View>
              ))}
          </>
        ) : null}

        {content.paymentNotes === "" ? null : (
          <>
            <Text style={styles.heading}>Payment notes</Text>
            <Text>{content.paymentNotes}</Text>
          </>
        )}
      </Page>
    </Document>
  );
}

export async function renderHandoffPdf(content: HandoffContent, ref: string): Promise<Buffer> {
  registerBrandFonts();
  return renderToBuffer(<HandoffDocument content={content} reference={ref} />);
}
