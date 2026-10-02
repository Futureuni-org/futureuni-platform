"use client";

import { Plus } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/admin";
import { Trash2 } from "lucide-react";
import type { Condition, ConditionAtom } from "@/contracts/service-line-profile";

import { AUDIT_CHECK_IDS, CONDITION_FIELDS, CONDITION_OPS, SEVERITIES } from "./profile-types";

const NUMERIC_FIELDS = new Set(["company.copyrightYear", "signal.count", "finding.pitchableCount"]);
const BOOLEAN_FIELDS = new Set([
  "company.hasWebsite",
  "company.isActiveClient",
  "contact.primary.exists",
  "contactability.hasAssistedChannel",
]);

type FieldAtom = Extract<ConditionAtom, { kind: "field" }>;

function coerce(field: string, raw: string, asArray: boolean): FieldAtom["value"] {
  const one = (s: string): string | number | boolean => {
    const t = s.trim();
    if (NUMERIC_FIELDS.has(field)) return Number(t);
    if (BOOLEAN_FIELDS.has(field)) return t === "true";
    return t;
  };
  if (asArray) {
    const parts = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    return (parts.length === 0 ? [""] : parts.map(one));
  }
  return one(raw);
}

function valueToText(value: FieldAtom["value"]): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

/**
 * ConditionBuilder — edits a `Condition` ({ all: atoms }, AND semantics, max 5 atoms). Used by
 * scoring rules and disqualifiers. Three atom kinds: signal present, audit finding, company /
 * contact field. The value for a field atom is coerced to the field's type; the server re-validates
 * against the contract schema on save.
 */
export function ConditionBuilder({
  condition,
  onChange,
  signalIds,
  disabled,
}: {
  condition: Condition;
  onChange: (condition: Condition) => void;
  signalIds: string[];
  disabled?: boolean;
}) {
  const atoms = condition.all;

  function setAtoms(next: ConditionAtom[]) {
    onChange({ all: next });
  }
  function patch(index: number, atom: ConditionAtom) {
    setAtoms(atoms.map((a, i) => (i === index ? atom : a)));
  }
  function addAtom() {
    if (atoms.length >= 5) return;
    const first = signalIds[0];
    const next: ConditionAtom =
      first !== undefined
        ? { kind: "signal", signalId: first, negate: false }
        : { kind: "field", field: "market", op: "eq", value: "NIGERIA" };
    setAtoms([...atoms, next]);
  }

  function changeKind(index: number, kind: ConditionAtom["kind"]) {
    if (kind === "signal") {
      patch(index, { kind: "signal", signalId: signalIds[0] ?? "no_signal", negate: false });
    } else if (kind === "finding") {
      const firstCheck = AUDIT_CHECK_IDS[0];
      if (firstCheck === undefined) return;
      patch(index, { kind: "finding", checkId: firstCheck, pitchableOnly: false, negate: false });
    } else {
      patch(index, { kind: "field", field: "market", op: "eq", value: "NIGERIA" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">All of these must be true (AND). Use separate rules for OR.</p>
      {atoms.map((atom, i) => (
        <div key={i} className="flex flex-wrap items-start gap-2 rounded-md bg-surface p-3">
          <div className="min-w-[8rem]">
            <Select
              aria-label="Condition type"
              value={atom.kind}
              disabled={disabled}
              options={[
                { value: "signal", label: "Signal" },
                { value: "finding", label: "Finding" },
                { value: "field", label: "Field" },
              ]}
              onChange={(e) => {
                changeKind(i, e.target.value as ConditionAtom["kind"]);
              }}
            />
          </div>

          {atom.kind === "signal" && (
            <>
              <div className="min-w-[10rem] flex-1">
                <Select
                  aria-label="Signal"
                  value={atom.signalId}
                  disabled={disabled}
                  options={signalIds.map((s) => ({ value: s, label: s }))}
                  onChange={(e) => {
                    patch(i, { ...atom, signalId: e.target.value });
                  }}
                />
              </div>
              <NegateToggle
                value={atom.negate}
                disabled={disabled}
                onChange={(negate) => {
                  patch(i, { ...atom, negate });
                }}
              />
            </>
          )}

          {atom.kind === "finding" && (
            <>
              <div className="min-w-[10rem] flex-1">
                <Select
                  aria-label="Audit check"
                  value={atom.checkId}
                  disabled={disabled}
                  options={AUDIT_CHECK_IDS.map((c) => ({ value: c, label: c }))}
                  onChange={(e) => {
                    patch(i, { ...atom, checkId: e.target.value as typeof atom.checkId });
                  }}
                />
              </div>
              <div className="min-w-[8rem]">
                <Select
                  aria-label="Minimum severity"
                  value={atom.minSeverity ?? ""}
                  disabled={disabled}
                  options={[{ value: "", label: "Any severity" }, ...SEVERITIES.map((s) => ({ value: s.value, label: `≥ ${s.label}` }))]}
                  onChange={(e) => {
                    const v = e.target.value;
                    patch(i, { ...atom, minSeverity: v === "" ? undefined : (v as typeof atom.minSeverity) });
                  }}
                />
              </div>
              <label className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={atom.pitchableOnly}
                  disabled={disabled}
                  onChange={(e) => {
                    patch(i, { ...atom, pitchableOnly: e.target.checked });
                  }}
                  className="size-4 accent-primary"
                />
                pitchable
              </label>
              <NegateToggle
                value={atom.negate}
                disabled={disabled}
                onChange={(negate) => {
                  patch(i, { ...atom, negate });
                }}
              />
            </>
          )}

          {atom.kind === "field" && (
            <>
              <div className="min-w-[12rem] flex-1">
                <Select
                  aria-label="Field"
                  value={atom.field}
                  disabled={disabled}
                  options={CONDITION_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
                  onChange={(e) => {
                    patch(i, { ...atom, field: e.target.value as typeof atom.field });
                  }}
                />
              </div>
              <div className="min-w-[6rem]">
                <Select
                  aria-label="Operator"
                  value={atom.op}
                  disabled={disabled}
                  options={CONDITION_OPS.map((o) => ({ value: o.value, label: o.label }))}
                  onChange={(e) => {
                    const op = e.target.value as typeof atom.op;
                    const asArray = op === "in" || op === "notIn";
                    patch(i, { ...atom, op, value: coerce(atom.field, valueToText(atom.value), asArray) });
                  }}
                />
              </div>
              <div className="min-w-[8rem] flex-1">
                {BOOLEAN_FIELDS.has(atom.field) && atom.op !== "in" && atom.op !== "notIn" ? (
                  <Select
                    aria-label="Value"
                    value={String(atom.value)}
                    disabled={disabled}
                    options={[
                      { value: "true", label: "true" },
                      { value: "false", label: "false" },
                    ]}
                    onChange={(e) => {
                      patch(i, { ...atom, value: e.target.value === "true" });
                    }}
                  />
                ) : (
                  <Input
                    aria-label="Value"
                    value={valueToText(atom.value)}
                    disabled={disabled}
                    placeholder={atom.op === "in" || atom.op === "notIn" ? "a, b, c" : "value"}
                    onChange={(e) => {
                      const asArray = atom.op === "in" || atom.op === "notIn";
                      patch(i, { ...atom, value: coerce(atom.field, e.target.value, asArray) });
                    }}
                  />
                )}
              </div>
            </>
          )}

          {!disabled && (
            <IconButton
              aria-label="Remove condition"
              className="text-danger"
              onClick={() => {
                setAtoms(atoms.filter((_, idx) => idx !== i));
              }}
            >
              <Trash2 aria-hidden className="size-4" />
            </IconButton>
          )}
        </div>
      ))}
      {!disabled && (
        <Button
          variant="secondary"
          size="sm"
          className="gap-2 self-start"
          onClick={addAtom}
          disabled={atoms.length >= 5}
        >
          <Plus aria-hidden className="size-4" />
          Add condition
        </Button>
      )}
    </div>
  );
}

function NegateToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean | undefined;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted">
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="size-4 accent-primary"
      />
      not
    </label>
  );
}
