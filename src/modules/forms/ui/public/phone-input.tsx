"use client";

/**
 * International phone input for the public form (docs/specs/module-forms.md §6).
 *
 * `react-phone-number-input` renders a country dropdown with a flag on the left and the local
 * number field on the right; the stored value is a plain E.164 string ("+447538598770"), which is
 * what the brief and the Excel export already expect from the `phone` field kind. We don't ship
 * `+234` as a default placeholder any more — the user picks their own country from the dropdown.
 *
 * Styling: the library's own CSS covers the dropdown chrome; the inner text input is wired to the
 * platform's `Input` primitive via `inputComponent`, so it matches the other fields exactly and
 * follows light / dark mode without extra work.
 */

import { forwardRef } from "react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

// Platform-token overrides on top of the library's own CSS (owned by this module, phase 22).
import "./phone-input.css";

export interface InternationalPhoneInputProps {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  describedBy: string | undefined;
  invalid: boolean;
  /** The caller may pass `undefined` explicitly when the field has no role; both allowed. */
  autoComplete?: string | undefined;
}

/** The platform `Input` adapted to `react-phone-number-input`'s `inputComponent` contract. */
const PhoneTextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function PhoneTextInput(props, ref) {
    return <Input ref={ref} {...props} className="rounded-l-none border-l-0" />;
  },
);

export function InternationalPhoneInput({
  id,
  name,
  value,
  onChange,
  describedBy,
  invalid,
  autoComplete,
}: InternationalPhoneInputProps) {
  return (
    <div
      className={cn(
        // The library emits a flex container with its own `.PhoneInput*` classes; we only need
        // to make sure the country selector sits beside the input and shares one visual field.
        "phone-input-shell flex w-full items-stretch",
      )}
      data-invalid={invalid ? "true" : undefined}
    >
      <PhoneInput
        id={id}
        name={name}
        {...(value === "" ? {} : { value })}
        onChange={(next) => {
          onChange(next ?? "");
        }}
        international
        countryCallingCodeEditable={false}
        inputComponent={PhoneTextInput}
        numberInputProps={{
          ...(describedBy !== undefined ? { "aria-describedby": describedBy } : {}),
          ...(invalid ? { "aria-invalid": "true" as const } : {}),
          ...(autoComplete !== undefined ? { autoComplete } : {}),
        }}
        className="flex w-full items-stretch"
      />
    </div>
  );
}
