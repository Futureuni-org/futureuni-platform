"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Download, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui";
import { Select } from "@/components/admin";
import type { ServiceLine } from "@/contracts/common";
import type { CsvField, CsvPreview } from "@/modules/acquisition/sourcing";

import { commitImportAction, previewCsvAction } from "./csv-actions";
import { CSV_ATTESTATION_STATEMENT, CSV_FIELD_LIST } from "./types";
import { FIELD_LABELS, autoMap } from "./csv-mapping";
import { lineHref } from "@/modules/acquisition/ui/shell";

/**
 * CSV import wizard: upload → map columns → validation preview → lawful-collection attestation →
 * import. The authoritative parse and validation run on the server (`previewCsv`/`importCsv`); the
 * client only reads the file text to drive mapping and preview.
 */

const STEPS = ["Upload", "Map columns", "Review", "Confirm", "Import"] as const;

export function CsvImportClient({ slug, line }: { slug: string; line: ServiceLine }): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [header, setHeader] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, CsvField | "">>({});
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [errorReport, setErrorReport] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onFile(picked: File): Promise<void> {
    const text = await picked.text();
    setFile(picked);
    setContent(text);
    setBusy(true);
    const res = await previewCsvAction(slug, text, {});
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setHeader(res.data.preview.header);
    setMapping(autoMap(res.data.preview.header));
    setStep(1);
  }

  async function runPreview(): Promise<void> {
    setBusy(true);
    const clean: Record<string, string> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field !== "") clean[col] = field;
    }
    const res = await previewCsvAction(slug, content, clean);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setPreview(res.data.preview);
    setErrorReport(res.data.errorReport);
    setStep(2);
  }

  async function commit(): Promise<void> {
    if (file === null) return;
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    const clean: Record<string, string> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field !== "") clean[col] = field;
    }
    form.set("mapping", JSON.stringify(clean));
    form.set("attested", attested ? "true" : "false");
    const res = await commitImportAction(slug, form);
    setBusy(false);
    if (res.ok) {
      toast.success("Import started");
      router.push(lineHref(line, `search/runs/${res.data.runId}`));
    } else {
      toast.error(res.error.message);
    }
  }

  function downloadErrors(): void {
    if (errorReport === null) return;
    const blob = new Blob([errorReport], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "import-errors.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const mappedFields = new Set(Object.values(mapping).filter((f) => f !== ""));
  const canMap = mappedFields.has("companyName") && (mappedFields.has("website") || mappedFields.has("phone") || mappedFields.has("email"));

  return (
    <div className="flex flex-col gap-6">
      <Stepper step={step} />

      {step === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-input bg-zone/40 px-6 py-12 text-center"
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files[0];
            if (dropped !== undefined) void onFile(dropped);
          }}
        >
          <UploadCloud className="size-8 text-muted" aria-hidden />
          <p className="text-sm text-muted">
            Drop a CSV here, or choose a file. Include a <strong className="text-foreground">company name</strong> column
            and at least one of website, phone or email.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked !== undefined) void onFile(picked);
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Reading…" : "Choose CSV"}
          </Button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Match each column to a field. We auto-matched what we could — adjust anything that looks off.
          </p>
          <ul className="flex flex-col gap-2">
            {header.map((column) => (
              <li key={column} className="grid grid-cols-[1fr_1fr] items-center gap-3">
                <span className="truncate font-mono text-sm text-foreground">{column}</span>
                <Select
                  options={[
                    { value: "", label: "Ignore this column" },
                    ...CSV_FIELD_LIST.map((f) => ({ value: f, label: FIELD_LABELS[f] })),
                  ]}
                  value={mapping[column] ?? ""}
                  onChange={(e) => {
                    setMapping((m) => ({ ...m, [column]: e.target.value as CsvField | "" }));
                  }}
                />
              </li>
            ))}
          </ul>
          {!canMap ? (
            <p className="text-sm text-danger">
              Map a company name and at least one of website, phone or email.
            </p>
          ) : null}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => { setStep(0); }}>Back</Button>
            <Button onClick={() => void runPreview()} disabled={!canMap || busy}>Preview rows</Button>
          </div>
        </div>
      ) : null}

      {step === 2 && preview !== null ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <PreviewStat label="Valid" value={preview.validRows.length} tone="success" />
            <PreviewStat label="Errors" value={preview.errors.length} tone={preview.errors.length > 0 ? "danger" : "muted"} />
            <PreviewStat label="Total rows" value={preview.totalRows} tone="muted" />
          </div>
          {preview.errors.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-md bg-danger-soft/50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-danger">{preview.errors.length} rows have errors</p>
                <Button variant="ghost" size="sm" onClick={downloadErrors}>
                  <Download className="size-4" aria-hidden />
                  Download errors
                </Button>
              </div>
              <ul className="max-h-40 overflow-auto text-xs text-danger">
                {preview.errors.slice(0, 20).map((err) => (
                  <li key={err.rowNumber} className="font-mono">
                    Row {err.rowNumber}: {err.reasons.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => { setStep(1); }}>Back</Button>
            <Button onClick={() => { setStep(3); }} disabled={preview.validRows.length === 0}>
              Continue ({preview.validRows.length} valid)
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-4">
          <label className="flex items-start gap-3 rounded-md border border-border p-4 text-sm text-foreground">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => { setAttested(e.target.checked); }}
              style={{ accentColor: "var(--primary)" }}
              className="mt-0.5 size-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <span>{CSV_ATTESTATION_STATEMENT}</span>
          </label>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => { setStep(2); }}>Back</Button>
            <Button onClick={() => { setStep(4); void commit(); }} disabled={!attested || busy}>
              Import {preview !== null ? `${String(preview.validRows.length)} leads` : ""}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          {busy ? (
            <p className="text-sm text-muted">Importing…</p>
          ) : (
            <>
              <CheckCircle2 className="size-8 text-success" aria-hidden />
              <p className="text-sm text-muted">Import finished. Taking you to the run…</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Stepper({ step }: { step: number }): React.ReactElement {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Import steps">
      {STEPS.map((label, index) => {
        const state = index < step ? "done" : index === step ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={[
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
              state === "current"
                ? "bg-primary text-primary-foreground"
                : state === "done"
                  ? "bg-primary-soft text-primary-soft-foreground"
                  : "bg-zone text-muted",
            ].join(" ")}
          >
            <span className="font-mono tabular-nums">{index + 1}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function PreviewStat({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" | "muted" }): React.ReactElement {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-heading";
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface p-3 shadow-soft">
      <span className={`font-mono text-2xl tabular-nums ${color}`}>{value.toLocaleString("en-GB")}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
