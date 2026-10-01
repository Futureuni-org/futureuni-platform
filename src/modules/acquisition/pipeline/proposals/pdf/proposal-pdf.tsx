/**
 * The branded proposal PDF (project-rules §Output/document rules, ADR-022). A4 portrait, FUTUREUNI
 * palette and typefaces, numbered sections. The investment table is rendered from the computed
 * figures (never the prose). Prose arrives with citation markers already stripped.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { JSX } from "react";

import type { ProposalSections } from "@/contracts/acquisition-records";
import type { Currency } from "@/contracts/common";
import { formatMoney } from "@/lib/money";

import { PDF_COLOR } from "./brand";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO } from "./fonts";

export interface ProposalPdfLine {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface ProposalPdfData {
  ref: string;
  version: number;
  companyName: string;
  preparedOn: string;
  validUntil: string;
  currency: Currency;
  sections: ProposalSections;
  lines: ProposalPdfLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxRateBps: number;
  taxMinor: number;
  totalMinor: number;
  portfolio: { title: string; outcomeMetric: string | null }[];
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 48,
    fontFamily: FONT_BODY,
    fontSize: 10.5,
    lineHeight: 1.5,
    color: PDF_COLOR.ink,
    backgroundColor: PDF_COLOR.surface,
  },
  wordmark: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16, color: PDF_COLOR.navy, letterSpacing: 1 },
  coverBand: { backgroundColor: PDF_COLOR.lavender, borderRadius: 8, padding: 24, marginTop: 20, marginBottom: 28 },
  coverTitle: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 26, color: PDF_COLOR.navy, marginBottom: 6 },
  coverSub: { fontSize: 11, color: PDF_COLOR.muted },
  coverMeta: { flexDirection: "row", gap: 24, marginTop: 14 },
  coverMetaLabel: { fontSize: 8, color: PDF_COLOR.muted, textTransform: "uppercase", letterSpacing: 1 },
  coverMetaValue: { fontSize: 11, color: PDF_COLOR.navy, fontFamily: FONT_MONO },
  section: { marginBottom: 16 },
  heading: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14, color: PDF_COLOR.navy, marginBottom: 6 },
  body: { marginBottom: 4 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { color: PDF_COLOR.primary, marginRight: 6 },
  table: { marginTop: 6, borderTopWidth: 1, borderColor: PDF_COLOR.border },
  tableHeader: { flexDirection: "row", backgroundColor: PDF_COLOR.lavender },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: PDF_COLOR.border },
  cellItem: { flex: 3, padding: 6 },
  cellQty: { flex: 1, padding: 6, textAlign: "right" },
  cellPrice: { flex: 1.4, padding: 6, textAlign: "right", fontFamily: FONT_MONO },
  cellHeaderText: { fontSize: 9, color: PDF_COLOR.navy, fontWeight: 600 },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  totalsLabel: { width: 120, textAlign: "right", paddingRight: 10, color: PDF_COLOR.muted },
  totalsValue: { width: 110, textAlign: "right", fontFamily: FONT_MONO },
  grandTotalLabel: { width: 120, textAlign: "right", paddingRight: 10, color: PDF_COLOR.navy, fontWeight: 600 },
  grandTotalValue: { width: 110, textAlign: "right", fontFamily: FONT_MONO, color: PDF_COLOR.navy, fontWeight: 600, fontSize: 12 },
  validity: { marginTop: 8, color: PDF_COLOR.muted, fontSize: 9 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: PDF_COLOR.border,
    paddingTop: 6,
    fontSize: 8,
    color: PDF_COLOR.muted,
  },
});

function money(amountMinor: number, currency: Currency): string {
  return formatMoney({ amountMinor, currency }, { showMinor: "always" });
}

function Section({ index, title, children }: { index: string; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.heading}>
        {index} {title}
      </Text>
      {children}
    </View>
  );
}

function Paragraphs({ text }: { text: string }): JSX.Element {
  const parts = text.split(/\n{2,}/).filter((p) => p.trim() !== "");
  return (
    <>
      {parts.map((part, i) => (
        <Text key={i} style={styles.body}>
          {part.trim()}
        </Text>
      ))}
    </>
  );
}

export function ProposalDocument({ data }: { data: ProposalPdfData }): JSX.Element {
  const { currency, sections } = data;
  return (
    <Document title={`FUTUREUNI Proposal ${data.ref}`} author="FUTUREUNI">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.wordmark}>FUTUREUNI</Text>

        <View style={styles.coverBand}>
          <Text style={styles.coverTitle}>Proposal for {data.companyName}</Text>
          <Text style={styles.coverSub}>Prepared by FUTUREUNI</Text>
          <View style={styles.coverMeta}>
            <View>
              <Text style={styles.coverMetaLabel}>Reference</Text>
              <Text style={styles.coverMetaValue}>{data.ref}</Text>
            </View>
            <View>
              <Text style={styles.coverMetaLabel}>Prepared</Text>
              <Text style={styles.coverMetaValue}>{data.preparedOn}</Text>
            </View>
            <View>
              <Text style={styles.coverMetaLabel}>Valid until</Text>
              <Text style={styles.coverMetaValue}>{data.validUntil}</Text>
            </View>
          </View>
        </View>

        <Section index="1" title="Understanding your situation">
          <Paragraphs text={sections.understanding} />
        </Section>
        <Section index="2" title="Proposed solution">
          <Paragraphs text={sections.solution} />
        </Section>
        <Section index="3" title="Scope and deliverables">
          <Paragraphs text={sections.scope} />
        </Section>
        <Section index="4" title="Timeline">
          <Paragraphs text={sections.timeline} />
        </Section>

        <Section index="5" title="Investment">
          <Paragraphs text={sections.investmentIntro} />
          <View style={styles.table}>
            <View style={[styles.row, styles.tableHeader]}>
              <Text style={[styles.cellItem, styles.cellHeaderText]}>Item</Text>
              <Text style={[styles.cellQty, styles.cellHeaderText]}>Qty</Text>
              <Text style={[styles.cellPrice, styles.cellHeaderText]}>Unit price</Text>
              <Text style={[styles.cellPrice, styles.cellHeaderText]}>Amount</Text>
            </View>
            {data.lines.map((line, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.cellItem}>{line.description}</Text>
                <Text style={styles.cellQty}>{line.quantity}</Text>
                <Text style={styles.cellPrice}>{money(line.unitPriceMinor, currency)}</Text>
                <Text style={styles.cellPrice}>{money(line.totalMinor, currency)}</Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 8 }}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{money(data.subtotalMinor, currency)}</Text>
            </View>
            {data.discountMinor > 0 ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Discount</Text>
                <Text style={styles.totalsValue}>-{money(data.discountMinor, currency)}</Text>
              </View>
            ) : null}
            {data.taxMinor > 0 ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax ({(data.taxRateBps / 100).toFixed(1)}%)</Text>
                <Text style={styles.totalsValue}>{money(data.taxMinor, currency)}</Text>
              </View>
            ) : null}
            <View style={styles.totalsRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{money(data.totalMinor, currency)}</Text>
            </View>
          </View>
          <Text style={styles.validity}>Prices valid until {data.validUntil}.</Text>
        </Section>

        <Section index="6" title="Why FUTUREUNI">
          <Paragraphs text={sections.whyFutureuni} />
          {data.portfolio.map((item, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text>
                {item.title}
                {item.outcomeMetric === null ? "" : ` — ${item.outcomeMetric}`}
              </Text>
            </View>
          ))}
        </Section>

        <Section index="7" title="Terms and validity">
          <Paragraphs text={sections.terms} />
        </Section>
        <Section index="8" title="Next steps and acceptance">
          <Paragraphs text={sections.nextSteps} />
        </Section>

        <View style={styles.footer} fixed>
          <Text>FUTUREUNI</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Proposal ${data.ref} · v${String(data.version)} · Page ${String(pageNumber)} of ${String(totalPages)}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
