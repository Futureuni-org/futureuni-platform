"use client";

import { useId, useState } from "react";

import { CURRENCY_SYMBOL, type Currency } from "@/contracts/common";
import { Input } from "@/components/ui/input";
import { fromMinor, toMinor } from "@/lib/money";

/**
 * CurrencyInput — a money field that speaks integer minor units (INV-11). The user types a decimal
 * amount; it is parsed with the exact `toMinor` helper (no floating point) and reported as minor
 * units, or `null` while the text isn't a valid amount. It only parses what was typed: totals and
 * prices are still computed by the server. A Phase 16 candidate for promotion.
 */
export function CurrencyInput({
  id,
  valueMinor,
  currency,
  onChange,
  describedBy,
  ariaLabel,
  disabled,
  className,
}: {
  id?: string;
  valueMinor: number | null;
  currency: Currency;
  onChange: (minor: number | null) => void;
  describedBy?: string | undefined;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(valueMinor === null ? "" : fromMinor(valueMinor, currency));
  const [invalid, setInvalid] = useState(false);
  const errorId = `${useId()}-error`;

  function handle(next: string) {
    setText(next);
    if (next.trim() === "") {
      setInvalid(false);
      onChange(null);
      return;
    }
    try {
      onChange(toMinor(next, currency));
      setInvalid(false);
    } catch {
      setInvalid(true);
      onChange(null);
    }
  }

  return (
    <div className={className}>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-muted"
        >
          {CURRENCY_SYMBOL[currency]}
        </span>
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={
            [describedBy, invalid ? errorId : undefined].filter((v) => v !== undefined).join(" ") ||
            undefined
          }
          aria-invalid={invalid ? true : undefined}
          onChange={(e) => {
            handle(e.target.value);
          }}
          className="pl-8 font-mono tabular-nums"
        />
      </div>
      {invalid && (
        <p id={errorId} role="alert" aria-live="polite" className="mt-1.5 text-sm text-danger">
          Enter an amount in figures, such as 1250.50.
        </p>
      )}
    </div>
  );
}
