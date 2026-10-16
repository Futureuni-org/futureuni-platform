"use client";

/**
 * The navy rail down the left of the form (docs/specs/module-forms.md §6).
 *
 * This is the part that says FUTUREUNI before a word is read. It is the same deep-navy brand plane
 * the platform's own sign-in uses — `bg-heading`, the mark and wordmark lockup, display type — and
 * the step list marks the open section the way the platform's sidebar marks the open page: the
 * Editorial Ledger "reading rule" plus a 10% white fill (phases/04/SUMMARY.md). A prospect sees
 * the same object FUTUREUNI's own staff log into, not a form that could have come from anywhere.
 *
 * Below `md` it collapses to a band across the top: lockup, appearance switch, and the progress
 * rail. The step list is the wizard's own Back/Next there, so it isn't repeated.
 */

import Image from "next/image";
import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

import { ThemeSwitch } from "./theme-switch";

export interface LedgerStep {
  key: string;
  title: string;
  /** Every question in this step has an answer. */
  complete: boolean;
  /** A required question in this step is still empty, and the prospect has already been past it. */
  flagged: boolean;
}

export function BrandRail({
  formTitle,
  steps,
  current,
  answered,
  total,
  onOpenStep,
}: {
  formTitle: string;
  steps: readonly LedgerStep[];
  /** Index into `steps`; `steps.length` is the review step. */
  current: number;
  answered: number;
  total: number;
  onOpenStep: (index: number) => void;
}) {
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);

  return (
    <aside
      className={cn(
        "bg-heading text-primary-foreground",
        "flex flex-col gap-6 px-5 py-5",
        "md:sticky md:top-0 md:h-dvh md:gap-8 md:px-7 md:py-8",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-3">
          <Image
            src="/brand/futureuni-mark.png"
            alt=""
            width={28}
            height={36}
            priority
            className="h-8 w-auto md:h-10"
          />
          <span className="font-display text-lg font-semibold tracking-[0.02em] md:text-xl">
            FUTUREUNI
          </span>
        </span>
        <ThemeSwitch className="-mr-2" />
      </div>

      <p className="hidden max-w-[16rem] font-display text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.02em] md:block">
        {formTitle}
      </p>

      {/* The ledger: every section, numbered, with the open one marked. Desktop only. */}
      <nav aria-label="Form sections" className="hidden min-h-0 flex-1 overflow-y-auto md:block">
        <ol className="flex flex-col gap-0.5">
          {steps.map((step, index) => {
            const active = index === current;
            return (
              <li key={step.key}>
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => {
                    onOpenStep(index);
                  }}
                  className={cn(
                    "reading-rule flex w-full items-center gap-3 rounded-md py-2 pr-2 pl-4 text-left text-sm",
                    "text-primary-foreground/70 transition-colors",
                    "hover:bg-primary-foreground/10 hover:text-primary-foreground",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                    active && "bg-primary-foreground/10 text-primary-foreground",
                  )}
                  data-active={active ? "true" : undefined}
                >
                  <span className="font-mono text-xs tabular-nums opacity-70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{step.title}</span>
                  <StepMark step={step} />
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-current={current === steps.length ? "step" : undefined}
              onClick={() => {
                onOpenStep(steps.length);
              }}
              className={cn(
                "reading-rule mt-2 flex w-full items-center gap-3 rounded-md py-2 pr-2 pl-4 text-left text-sm",
                "text-primary-foreground/70 transition-colors",
                "hover:bg-primary-foreground/10 hover:text-primary-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                current === steps.length && "bg-primary-foreground/10 text-primary-foreground",
              )}
              data-active={current === steps.length ? "true" : undefined}
            >
              <span className="font-mono text-xs tabular-nums opacity-70">
                {String(steps.length + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate">Check and send</span>
            </button>
          </li>
        </ol>
      </nav>

      <Progress answered={answered} total={total} percent={percent} />
    </aside>
  );
}

/** A tick when the section is complete; a dot when a required answer is still missing. */
function StepMark({ step }: { step: LedgerStep }) {
  if (step.flagged) {
    return (
      <span
        aria-label="needs an answer"
        className="size-1.5 shrink-0 rounded-full bg-accent"
        role="img"
      />
    );
  }
  if (step.complete) return <Check aria-label="done" className="size-3.5 shrink-0 opacity-70" />;
  return null;
}

function Progress({
  answered,
  total,
  percent,
}: {
  answered: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline justify-between text-xs text-primary-foreground/70">
        <span className="font-mono tabular-nums">
          {answered} of {total} answered
        </span>
        <span className="font-mono tabular-nums">{percent}%</span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={answered}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Questions answered"
        className="h-1 w-full overflow-hidden rounded-full bg-primary-foreground/15"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-base)] ease-[var(--motion-ease-standard)]"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
    </div>
  );
}
