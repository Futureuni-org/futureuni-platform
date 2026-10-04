"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";

import type { Currency } from "@/contracts/common";
import { Field, Select } from "@/components/admin";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/result";

import { CurrencyInput } from "./currency-input";
import type { ProposalActionResult, ProposalFormInput } from "./detail-actions";
import type { PackageOption, ProposalLineView, ProposalView, QuotePreview } from "./detail-types";
import { dateInputToIso, isoToDateInput } from "./format";

/**
 * The quote builder (module spec US-34). The user picks packages, adds custom line items and a
 * discount; every figure shown — line amounts, subtotal, discount, tax, total and whether manager
 * approval is needed — comes back from the server-side deterministic pricing service (INV-17).
 * Nothing here adds, multiplies or subtracts money: the component only collects inputs and renders
 * what the server returned.
 */

interface PackageChoice {
  quantity: number;
  unitPriceMinor: number | null;
}

interface CustomLine {
  key: number;
  description: string;
  quantity: number;
  unitPriceMinor: number | null;
}

const DISCOUNT_TYPES = ["NONE", "PERCENT", "AMOUNT"] as const;
type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** The version being revised: the builder opens on its lines and terms, not on a blank form. */
export interface QuoteSeed {
  lines: ProposalLineView[];
  discount: ProposalView["discount"];
  /** The date-only valid-until value (ISO, midnight UTC). */
  validUntil: string;
  notes: string | null;
}

/** 1250 basis points → "12.5": the text the percentage field shows. Not money. */
function bpsToPercentText(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const hundredths = bps % 100;
  if (hundredths === 0) return String(whole);
  return `${String(whole)}.${String(hundredths).padStart(2, "0").replace(/0$/, "")}`;
}

function seedPackages(
  seed: QuoteSeed | undefined,
  packages: PackageOption[],
): Record<string, PackageChoice> {
  const out: Record<string, PackageChoice> = {};
  for (const line of seed?.lines ?? []) {
    if (line.packageId !== null && packages.some((p) => p.id === line.packageId)) {
      out[line.packageId] = { quantity: line.quantity, unitPriceMinor: line.unitPriceMinor };
    }
  }
  return out;
}

function seedCustom(seed: QuoteSeed | undefined): CustomLine[] {
  return (seed?.lines ?? [])
    .filter((line) => line.packageId === null)
    .map((line, index) => ({
      key: index,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
    }));
}

/** "12.5" → 1250 basis points, or null when it isn't a percentage between 0 and 100. */
function percentToBps(text: string): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text.trim())) return null;
  const [whole = "0", fraction = ""] = text.trim().split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bps <= 10000 ? bps : null;
}

function TotalRow({
  label,
  minor,
  currency,
  strong,
  deducted,
}: {
  label: string;
  minor: number;
  currency: Currency;
  strong?: boolean;
  /** Shows the amount as a deduction (a leading minus), without negating the value itself. */
  deducted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong === true ? "font-semibold text-heading" : "text-muted"}>{label}</dt>
      <dd className={strong === true ? "text-lg font-semibold text-heading" : "text-foreground"}>
        {deducted === true && (
          <>
            <span aria-hidden className="font-mono">
              −
            </span>
            <span className="sr-only">minus </span>
          </>
        )}
        <Money value={{ amountMinor: minor, currency }} />
      </dd>
    </div>
  );
}

export function QuoteBuilder({
  leadId,
  packages,
  currency,
  seed,
  saveLabel,
  canApproveException,
  priceQuote,
  onSave,
  onSaved,
  onCancel,
}: {
  leadId: string;
  packages: PackageOption[];
  currency: Currency;
  seed?: QuoteSeed;
  saveLabel: string;
  canApproveException: boolean;
  priceQuote: (leadId: string, input: ProposalFormInput) => Promise<ActionResult<QuotePreview>>;
  onSave: (input: ProposalFormInput) => Promise<ActionResult<ProposalActionResult>>;
  onSaved: (result: ProposalActionResult) => void;
  onCancel: () => void;
}) {
  const [chosen, setChosen] = useState<Record<string, PackageChoice>>(() =>
    seedPackages(seed, packages),
  );
  const [custom, setCustom] = useState<CustomLine[]>(() => seedCustom(seed));
  // A revision starts from the terms of the version it revises. Starting blank would silently drop
  // an agreed discount, and with it the approval that discount needed.
  const seedDiscount: ProposalView["discount"] = seed?.discount ?? { type: "NONE" };
  const [discountType, setDiscountType] = useState<DiscountType>(seedDiscount.type);
  const [percent, setPercent] = useState(
    seedDiscount.type === "PERCENT" ? bpsToPercentText(seedDiscount.valueBps) : "",
  );
  const [amountMinor, setAmountMinor] = useState<number | null>(
    seedDiscount.type === "AMOUNT" ? seedDiscount.valueMinor : null,
  );
  const [validUntil, setValidUntil] = useState(
    seed === undefined ? "" : isoToDateInput(seed.validUntil),
  );
  const [notes, setNotes] = useState(seed?.notes ?? "");

  // The pricing service's last answer, tagged with the inputs it priced. What is shown is derived
  // from it: an answer for other inputs is stale, so the quote counts as "pricing" until a matching
  // one arrives, and a stale total is never shown or saved.
  const [settled, setSettled] = useState<{
    key: string;
    preview: QuotePreview | null;
    error: string | null;
  } | null>(null);
  const [saving, startSaving] = useTransition();
  const nextKey = useRef(custom.length);

  // The inputs that affect the price. Memoised on those alone, so a date or a note doesn't re-price.
  const priced = useMemo((): ProposalFormInput | null => {
    const packageLines = Object.entries(chosen).map(([packageId, choice]) => ({
      packageId,
      quantity: choice.quantity,
      ...(choice.unitPriceMinor === null ? {} : { unitPriceMinor: choice.unitPriceMinor }),
    }));
    const lineItems = custom.flatMap((line) =>
      line.description.trim() !== "" && line.unitPriceMinor !== null && line.quantity >= 1
        ? [
            {
              description: line.description,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
            },
          ]
        : [],
    );
    if (packageLines.length + lineItems.length === 0) return null;

    const bps = percentToBps(percent);
    const discount =
      discountType === "PERCENT" && bps !== null
        ? ({ type: "PERCENT", valueBps: bps } as const)
        : discountType === "AMOUNT" && amountMinor !== null
          ? ({ type: "AMOUNT", valueMinor: amountMinor } as const)
          : ({ type: "NONE" } as const);

    return { packages: packageLines, lineItems, discount };
  }, [chosen, custom, discountType, percent, amountMinor]);

  const pricedKey = useMemo(() => (priced === null ? null : JSON.stringify(priced)), [priced]);

  useEffect(() => {
    if (priced === null || pricedKey === null) return;
    let superseded = false;
    const timer = setTimeout(() => {
      void priceQuote(leadId, priced).then((result) => {
        if (superseded) return; // newer inputs are being priced
        setSettled(
          result.ok
            ? { key: pricedKey, preview: result.data, error: null }
            : { key: pricedKey, preview: null, error: result.error.message },
        );
      });
    }, 350);
    return () => {
      superseded = true;
      clearTimeout(timer);
    };
  }, [priced, pricedKey, leadId, priceQuote]);

  const answer = pricedKey !== null && settled?.key === pricedKey ? settled : null;
  const preview = answer?.preview ?? null;
  const previewError = answer?.error ?? null;
  const pricing = pricedKey !== null && answer === null;

  function togglePackage(pkg: PackageOption) {
    setChosen((prev) =>
      prev[pkg.id] === undefined
        ? { ...prev, [pkg.id]: { quantity: 1, unitPriceMinor: null } }
        : Object.fromEntries(Object.entries(prev).filter(([id]) => id !== pkg.id)),
    );
  }

  function updatePackage(id: string, patch: Partial<PackageChoice>) {
    setChosen((prev) => {
      const current = prev[id];
      return current === undefined ? prev : { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function updateCustom(key: number, patch: Partial<CustomLine>) {
    setCustom((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function save() {
    if (priced === null) return;
    const validIso = dateInputToIso(validUntil);
    const input: ProposalFormInput = {
      ...priced,
      ...(validIso === null ? {} : { validUntil: validIso }),
      notes: notes.trim() === "" ? null : notes,
    };
    startSaving(async () => {
      const result = await onSave(input);
      if (result.ok) {
        toast.success(
          result.data.requiresApproval
            ? `Version ${String(result.data.version)} saved. It needs a manager's approval.`
            : `Version ${String(result.data.version)} saved.`,
        );
        onSaved(result.data);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    // Laid out by the width of its own column, not the viewport: the builder sits beside the lead's
    // side rail, so a wide screen doesn't mean it has room for the totals next to the form.
    <div className="@container">
      <div className="grid grid-cols-1 gap-10 @4xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <fieldset className="flex flex-col gap-4">
            <legend className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              Packages
            </legend>
            <ul className="flex flex-col gap-4">
              {packages.map((pkg) => {
                const choice = chosen[pkg.id];
                const selected = choice !== undefined;
                return (
                  <li key={pkg.id} className="flex flex-col gap-3">
                    <label className="flex min-h-12 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          togglePackage(pkg);
                        }}
                        className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium break-words text-heading">{pkg.name}</span>
                        <span className="text-sm text-muted">
                          Typical{" "}
                          <Money
                            value={{ amountMinor: pkg.typicalMinor, currency: pkg.currency }}
                          />{" "}
                          · range{" "}
                          <Money value={{ amountMinor: pkg.minMinor, currency: pkg.currency }} /> to{" "}
                          <Money value={{ amountMinor: pkg.maxMinor, currency: pkg.currency }} />
                        </span>
                      </span>
                    </label>
                    {selected && (
                      <div className="ml-7 grid grid-cols-[6rem_minmax(0,14rem)] gap-3">
                        <Field label="Quantity">
                          {({ id }) => (
                            <Input
                              id={id}
                              type="number"
                              min={1}
                              max={100}
                              inputMode="numeric"
                              value={choice.quantity}
                              onChange={(e) => {
                                const quantity = Number.parseInt(e.target.value, 10);
                                if (
                                  Number.isInteger(quantity) &&
                                  quantity >= 1 &&
                                  quantity <= 100
                                ) {
                                  updatePackage(pkg.id, { quantity });
                                }
                              }}
                            />
                          )}
                        </Field>
                        <Field label={`Unit price for ${pkg.name}`}>
                          {({ id }) => (
                            <CurrencyInput
                              id={id}
                              valueMinor={choice.unitPriceMinor ?? pkg.typicalMinor}
                              currency={currency}
                              onChange={(minor) => {
                                updatePackage(pkg.id, { unitPriceMinor: minor });
                              }}
                            />
                          )}
                        </Field>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              Custom line items
            </legend>
            {custom.map((line, index) => (
              <div
                key={line.key}
                className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_10rem_auto]"
              >
                <Field label={`Line item ${String(index + 1)} description`}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={line.description}
                      maxLength={300}
                      onChange={(e) => {
                        updateCustom(line.key, { description: e.target.value });
                      }}
                    />
                  )}
                </Field>
                <Field label="Qty">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      max={1000}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) => {
                        const quantity = Number.parseInt(e.target.value, 10);
                        if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000) {
                          updateCustom(line.key, { quantity });
                        }
                      }}
                    />
                  )}
                </Field>
                <Field label="Unit price">
                  {({ id }) => (
                    <CurrencyInput
                      id={id}
                      valueMinor={line.unitPriceMinor}
                      currency={currency}
                      onChange={(minor) => {
                        updateCustom(line.key, { unitPriceMinor: minor });
                      }}
                    />
                  )}
                </Field>
                <IconButton
                  aria-label={`Remove line item ${String(index + 1)}`}
                  className="size-12 min-h-12"
                  onClick={() => {
                    setCustom((prev) => prev.filter((l) => l.key !== line.key));
                  }}
                >
                  <Trash2 aria-hidden className="size-4" />
                </IconButton>
              </div>
            ))}
            <div>
              <Button
                variant="ghost"
                disabled={custom.length >= 30}
                onClick={() => {
                  nextKey.current += 1;
                  setCustom((prev) => [
                    ...prev,
                    { key: nextKey.current, description: "", quantity: 1, unitPriceMinor: null },
                  ]);
                }}
              >
                <Plus aria-hidden className="size-4" />
                Add line item
              </Button>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Discount">
              {({ id }) => (
                <Select
                  id={id}
                  value={discountType}
                  options={[
                    { value: "NONE", label: "No discount" },
                    { value: "PERCENT", label: "Percentage" },
                    { value: "AMOUNT", label: "Amount" },
                  ]}
                  onChange={(e) => {
                    setDiscountType(
                      DISCOUNT_TYPES.find((type) => type === e.target.value) ?? "NONE",
                    );
                  }}
                />
              )}
            </Field>
            {discountType === "PERCENT" && (
              <Field
                label="Discount percentage"
                error={percent !== "" && percentToBps(percent) === null ? "Enter 0 to 100." : null}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    aria-describedby={describedBy}
                    value={percent}
                    placeholder="10"
                    onChange={(e) => {
                      setPercent(e.target.value);
                    }}
                  />
                )}
              </Field>
            )}
            {discountType === "AMOUNT" && (
              <Field label="Discount amount">
                {({ id }) => (
                  <CurrencyInput
                    id={id}
                    valueMinor={amountMinor}
                    currency={currency}
                    onChange={setAmountMinor}
                  />
                )}
              </Field>
            )}
            <Field label="Valid until">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={validUntil}
                  onChange={(e) => {
                    setValidUntil(e.target.value);
                  }}
                />
              )}
            </Field>
          </div>

          <Field label="Notes for the proposal">
            {({ id }) => (
              <Textarea
                id={id}
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
              />
            )}
          </Field>
        </div>

        <aside
          className="flex h-fit flex-col gap-4 rounded-lg bg-zone px-5 py-5 @4xl:sticky @4xl:top-6"
          aria-label="Quote totals"
        >
          <h3 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Totals</h3>
          <div aria-live="polite" aria-busy={pricing} className="flex flex-col gap-4">
            {preview === null ? (
              <p className="text-sm text-muted">
                {previewError ??
                  (priced === null
                    ? "Pick a package or add a line item to see the price."
                    : "Pricing…")}
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-2 text-sm">
                  {/* The server's lines in the server's order, replaced as a whole on every pricing:
                    the position is the only identity a line has (two lines can be identical). */}
                  {preview.lines.map((line, position) => (
                    <li
                      key={`${String(position)}-${line.description}`}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="min-w-0 break-words text-foreground">
                        {line.description}
                        <span className="text-muted"> × {String(line.quantity)}</span>
                      </span>
                      <Money value={{ amountMinor: line.totalMinor, currency: preview.currency }} />
                    </li>
                  ))}
                </ul>
                <dl className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
                  <TotalRow
                    label="Subtotal"
                    minor={preview.subtotalMinor}
                    currency={preview.currency}
                  />
                  {preview.discountMinor > 0 && (
                    <TotalRow
                      label="Discount"
                      minor={preview.discountMinor}
                      currency={preview.currency}
                      deducted
                    />
                  )}
                  {preview.taxMinor > 0 && (
                    <TotalRow label="Tax" minor={preview.taxMinor} currency={preview.currency} />
                  )}
                  <TotalRow
                    label="Total"
                    minor={preview.totalMinor}
                    currency={preview.currency}
                    strong
                  />
                </dl>
                {preview.requiresApproval && (
                  <div
                    role="status"
                    className="flex flex-col gap-1 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
                  >
                    <p className="flex items-center gap-2 font-semibold">
                      <ShieldAlert aria-hidden className="size-4" />
                      Manager approval needed
                    </p>
                    <ul className="flex list-disc flex-col gap-0.5 pl-5">
                      {preview.approvalReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <p>
                      {canApproveException
                        ? "You can approve it once it is saved."
                        : "A manager or admin must approve it before it can be sent."}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} loading={saving} disabled={preview === null || pricing}>
              {saveLabel}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
