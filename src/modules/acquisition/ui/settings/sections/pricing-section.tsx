"use client";

import { SettingsSection } from "@/components/admin";
import { EmptyState } from "@/components/patterns/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDraft } from "../profile-draft-context";
import {
  CURRENCIES,
  MARKETS,
  MARKET_CURRENCIES,
  type Market,
  type PriceRange,
  type PricingPackage,
} from "../profile-types";
import {
  AddButton,
  CheckboxField,
  ItemCard,
  NumberField,
  SelectField,
  StringListField,
  TextField,
} from "../editor-fields";

const CURRENCY_SYMBOL: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

export function PricingSection() {
  const { draft, canEdit, setField } = useDraft();
  const pricing = draft.pricing;

  function setPricing(next: typeof pricing) {
    setField("pricing", next);
  }
  function setPackages(next: PricingPackage[]) {
    setPricing({ ...pricing, packages: next });
  }

  return (
    <SettingsSection
      eyebrow="Pricing"
      title="Packages and ranges"
      emphasized
      actions={
        canEdit ? (
          <AddButton
            label="Add package"
            onClick={() => {
              let n = pricing.packages.length + 1;
              const existing = new Set(pricing.packages.map((p) => p.id));
              while (existing.has(`package_${String(n)}`)) n += 1;
              setPackages([
                ...pricing.packages,
                {
                  id: `package_${String(n)}`,
                  name: "New package",
                  includes: ["Deliverable"],
                  timelineWeeks: { min: 2, max: 4 },
                  prices: [
                    { market: "NIGERIA", currency: "NGN", minMinor: 0, typicalMinor: 0, maxMinor: 0 },
                  ],
                },
              ]);
            }}
          />
        ) : undefined
      }
    >
      {pricing.needsReview && (
        <div className="rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
          Pricing is marked <strong>needs review</strong> — these figures are placeholders and must
          be confirmed before launch (INV, launch gate).
        </div>
      )}
      <CheckboxField
        label="Needs review"
        description="Keep on until the figures are confirmed by Prince."
        checked={pricing.needsReview}
        disabled={!canEdit}
        onChange={(checked) => {
          setPricing({ ...pricing, needsReview: checked });
        }}
      />

      {pricing.packages.length === 0 ? (
        <EmptyState title="No packages" description="Add at least one package." />
      ) : (
        <div className="flex flex-col gap-4">
          {pricing.packages.map((pkg, i) => {
            function patch(change: Partial<PricingPackage>) {
              setPackages(pricing.packages.map((p, idx) => (idx === i ? { ...p, ...change } : p)));
            }
            return (
              <ItemCard
                key={i}
                title={pkg.name || pkg.id}
                badge={<span className="font-mono text-xs text-muted">{pkg.id}</span>}
                canEdit={canEdit}
                onRemove={() => {
                  setPackages(pricing.packages.filter((_, idx) => idx !== i));
                }}
              >
                <TextField
                  label="Name"
                  value={pkg.name}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch({ name: v });
                  }}
                />
                <StringListField
                  label="Includes"
                  values={pkg.includes}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch({ includes: v });
                  }}
                />
                <div className="grid max-w-md gap-4 sm:grid-cols-2">
                  <NumberField
                    label="Timeline min (weeks)"
                    value={pkg.timelineWeeks.min}
                    min={1}
                    disabled={!canEdit}
                    onChange={(v) => {
                      patch({ timelineWeeks: { ...pkg.timelineWeeks, min: v ?? 1 } });
                    }}
                  />
                  <NumberField
                    label="Timeline max (weeks)"
                    value={pkg.timelineWeeks.max}
                    min={1}
                    disabled={!canEdit}
                    onChange={(v) => {
                      patch({ timelineWeeks: { ...pkg.timelineWeeks, max: v ?? 1 } });
                    }}
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-foreground">Prices by market</p>
                  {pkg.prices.map((price, pi) => {
                    function patchPrice(change: Partial<PriceRange>) {
                      patch({
                        prices: pkg.prices.map((pr, idx) => (idx === pi ? { ...pr, ...change } : pr)),
                      });
                    }
                    const allowed = MARKET_CURRENCIES[price.market];
                    return (
                      <div key={pi} className="flex flex-col gap-3 rounded-md bg-surface p-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="min-w-[9rem]">
                            <SelectField
                              label="Market"
                              value={price.market}
                              disabled={!canEdit}
                              options={MARKETS}
                              onChange={(v) => {
                                const market = v as Market;
                                const cur = MARKET_CURRENCIES[market][0] ?? "NGN";
                                patchPrice({ market, currency: cur as PriceRange["currency"] });
                              }}
                            />
                          </div>
                          <div className="min-w-[8rem]">
                            <SelectField
                              label="Currency"
                              value={price.currency}
                              disabled={!canEdit}
                              options={CURRENCIES.filter((c) => allowed.includes(c)).map((c) => ({
                                value: c,
                                label: c,
                              }))}
                              onChange={(v) => {
                                patchPrice({ currency: v as PriceRange["currency"] });
                              }}
                            />
                          </div>
                          {canEdit && pkg.prices.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger"
                              onClick={() => {
                                patch({ prices: pkg.prices.filter((_, idx) => idx !== pi) });
                              }}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <MoneyMinor
                            label="Minimum"
                            currency={price.currency}
                            minor={price.minMinor}
                            disabled={!canEdit}
                            onChange={(minMinor) => {
                              patchPrice({ minMinor });
                            }}
                          />
                          <MoneyMinor
                            label="Typical"
                            currency={price.currency}
                            minor={price.typicalMinor}
                            disabled={!canEdit}
                            onChange={(typicalMinor) => {
                              patchPrice({ typicalMinor });
                            }}
                          />
                          <MoneyMinor
                            label="Maximum"
                            currency={price.currency}
                            minor={price.maxMinor}
                            disabled={!canEdit}
                            onChange={(maxMinor) => {
                              patchPrice({ maxMinor });
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {canEdit && (
                    <AddButton
                      label="Add market price"
                      onClick={() => {
                        patch({
                          prices: [
                            ...pkg.prices,
                            {
                              market: "INTERNATIONAL",
                              currency: "GBP",
                              minMinor: 0,
                              typicalMinor: 0,
                              maxMinor: 0,
                            },
                          ],
                        });
                      }}
                    />
                  )}
                </div>
              </ItemCard>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}

function MoneyMinor({
  label,
  currency,
  minor,
  onChange,
  disabled,
}: {
  label: string;
  currency: string;
  minor: number;
  onChange: (minor: number) => void;
  disabled: boolean;
}) {
  const symbol = CURRENCY_SYMBOL[currency] ?? "";
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-muted">{symbol}</span>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={minor === 0 ? "" : String(minor / 100)}
          disabled={disabled}
          aria-label={`${label} amount in ${currency}`}
          onChange={(e) => {
            const major = Number(e.target.value);
            onChange(Number.isFinite(major) ? Math.round(major * 100) : 0);
          }}
          className="font-mono"
        />
      </div>
    </label>
  );
}
